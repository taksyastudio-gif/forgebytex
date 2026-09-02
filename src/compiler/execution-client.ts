import type {
  ExecutionResult,
  RunHooks,
  RuntimeEvent,
  RuntimeRequest,
} from './execution-protocol';

/**
 * Watchdog window measured in INACTIVITY. Streaming output or status
 * transitions keep resetting it, so long-running programs that produce
 * output are never killed, while a wedged worker is reaped promptly.
 * While a program is suspended waiting for user input the watchdog is
 * disarmed completely.
 */
const IDLE_TIMEOUT_MS = 120000;

const SHARED_STDIN_HEADER_BYTES = 16;
const SHARED_STDIN_CAPACITY_BYTES = 1024 * 1024;

class SharedStdinPipe {
  readonly buffer: SharedArrayBuffer;
  private readonly control: Int32Array;
  private readonly data: Uint8Array;
  private readonly encoder = new TextEncoder();

  constructor(initialText = '') {
    this.buffer = new SharedArrayBuffer(
      SHARED_STDIN_HEADER_BYTES + SHARED_STDIN_CAPACITY_BYTES
    );
    this.control = new Int32Array(this.buffer, 0, 4);
    this.data = new Uint8Array(this.buffer, SHARED_STDIN_HEADER_BYTES);

    if (initialText) {
      this.append(initialText);
    }
  }

  append(text: string): void {
    if (!text) {
      return;
    }

    const bytes = this.encoder.encode(text);
    const writeIndex = Atomics.load(this.control, 0);

    if (writeIndex + bytes.length > this.data.length) {
      throw new Error('Interactive stdin buffer overflow.');
    }

    this.data.set(bytes, writeIndex);
    Atomics.store(this.control, 0, writeIndex + bytes.length);
    Atomics.add(this.control, 3, 1);
    Atomics.notify(this.control, 3);
  }

  close(): void {
    Atomics.store(this.control, 2, 1);
    Atomics.add(this.control, 3, 1);
    Atomics.notify(this.control, 3);
  }
}

const canUseSharedStdin = (): boolean =>
  typeof SharedArrayBuffer !== 'undefined' &&
  typeof Atomics !== 'undefined' &&
  typeof globalThis !== 'undefined' &&
  globalThis.crossOriginIsolated === true;

type PendingRequest = {
  resolve: (result: ExecutionResult) => void;
  reject: (error: Error) => void;
  worker: Worker;
  hooks: RunHooks;
  stdinPipe?: SharedStdinPipe | null;
};

/**
 * Generic single-flight worker execution client.
 *
 * Owns the full worker lifecycle for one language runtime: creation,
 * message routing, stale-event filtering, activity watchdog, stdin
 * forwarding, stop and teardown. Concrete clients (C, Python) are thin
 * wrappers around this class.
 */
export class ExecutionClient {
  private readonly workerUrl: URL;
  private readonly workerOptions: WorkerOptions;

  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private watchdogs = new Map<string, ReturnType<typeof setTimeout>>();
  private activeRequestId: string | null = null;

  constructor(
    workerModule: () => URL,
    workerOptions: WorkerOptions = { type: 'module' }
  ) {
    this.workerUrl = workerModule();
    this.workerOptions = workerOptions;
  }

  /* ============================================================
     WORKER FACTORY
     ============================================================ */

  private createWorker(): Worker {
    const worker = new Worker(this.workerUrl, this.workerOptions);

    worker.addEventListener('message', this.handleMessage);
    worker.addEventListener('error', this.handleWorkerError);
    worker.addEventListener('messageerror', this.handleMessageError);

    return worker;
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      // Reuse the same worker so a suspended run can resume against the
      // already-loaded runtime instead of paying startup cost again.
      this.worker = this.createWorker();
    }

    return this.worker;
  }

  private disposeWorker(): void {
    if (!this.worker) {
      return;
    }

    try {
      this.worker.terminate();
    } catch {
      // Ignore worker teardown errors.
    }

    this.worker = null;
  }

  /* ============================================================
     WATCHDOG
     ============================================================ */

  private armWatchdog(requestId: string): void {
    this.disarmWatchdog(requestId);

    const timeoutId = setTimeout(() => {
      this.expireRequest(requestId);
    }, IDLE_TIMEOUT_MS);

    this.watchdogs.set(requestId, timeoutId);
  }

  private disarmWatchdog(requestId: string): void {
    const timeoutId = this.watchdogs.get(requestId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.watchdogs.delete(requestId);
    }
  }

  private expireRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }

    this.teardownRequest(requestId);
    // A timed-out worker may be left mid-execution; terminate it so the next
    // run starts from a clean runtime.
    this.disposeWorker();

    pending.hooks.onStatus?.('timeout');
    pending.resolve({
      success: false,
      output: '',
      error: 'Execution timed out after 120 seconds without activity.',
      exitCode: null,
      waitingForInput: false,
      status: 'timeout',
      phase: 'run',
    });
  }

  /**
   * Removes all bookkeeping for a request and terminates its worker.
   * Only call once the request will never receive further messages.
   */
  private teardownRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(requestId);
    this.disarmWatchdog(requestId);

    if (this.activeRequestId === requestId) {
      this.activeRequestId = null;
    }
  }

  /* ============================================================
     WORKER MESSAGE ROUTING
     ============================================================ */

  private handleMessage = (
    event: MessageEvent<RuntimeEvent>
  ): void => {
    const data = event.data;

    if (!data || typeof data !== 'object') {
      return;
    }

    if (data.type === 'stream') {
      const pending = this.pendingRequests.get(data.requestId);

      /*
       * Streams for unknown/expired requestIds are stale worker
       * messages (e.g. from a timed-out run) and are dropped so they
       * can never leak into the current run's output.
       */
      if (!pending) {
        return;
      }

      if (!pending.stdinPipe) {
        // Program produced output: it is alive, reward it with time.
        this.armWatchdog(data.requestId);
      }
      pending.hooks.onOutput?.(
        data.stream,
        data.text,
        data.attempt ?? 1
      );
      return;
    }

    if (data.type === 'status') {
      const pending = this.pendingRequests.get(data.requestId);
      if (!pending) {
        return;
      }

      if (data.status === 'waiting-input') {
        // Suspended on the user: pause the watchdog entirely.
        this.disarmWatchdog(data.requestId);
      } else {
        if (!pending.stdinPipe) {
          this.armWatchdog(data.requestId);
        }
      }

      pending.hooks.onStatus?.(data.status);
      return;
    }

    if (data.type !== 'result') {
      return;
    }

    const pending = this.pendingRequests.get(data.requestId);
    if (!pending) {
      // Duplicate or late result for an already-settled request.
      return;
    }

    if (data.waitingForInput) {
      /*
       * The program suspended waiting for stdin. The worker (and its
       * loaded toolchain/runtime + session) must stay alive so input
       * can be forwarded; the promise intentionally remains pending
       * until the program finishes or the user stops it.
       */
      this.disarmWatchdog(data.requestId);
      pending.hooks.onStatus?.('waiting-input');
      return;
    }

    this.teardownRequest(data.requestId);

    pending.resolve({
      success: data.success,
      output: data.output,
      error: data.error,
      warnings: data.warnings,
      exitCode: data.exitCode ?? null,
      waitingForInput: false,
      status: data.status ?? (data.success ? 'completed' : 'failed'),
      phase: data.phase,
    });
  };

  private handleWorkerError = (event: ErrorEvent): void => {
    const error = new Error(
      event.message || 'The runtime worker stopped unexpectedly.'
    );

    this.rejectAllPending(error);
  };

  private handleMessageError = (): void => {
    const error = new Error(
      'Unable to communicate with the runtime worker.'
    );

    this.rejectAllPending(error);
  };

  private rejectAllPending(error: Error): void {
    for (const [requestId, pending] of this.pendingRequests) {
      this.disarmWatchdog(requestId);

      pending.reject(error);
    }

    this.pendingRequests.clear();
    this.watchdogs.clear();
    this.activeRequestId = null;
    // Stop or fatal worker failures always tear down the reused worker so
    // stale state cannot bleed into the next execution.
    this.disposeWorker();
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */

  /** Start a run. Resolves with the final ExecutionResult. */
  run(
    code: string,
    stdin = '',
    hooks: RunHooks = {}
  ): Promise<ExecutionResult> {
    /*
     * Busy guard: a second concurrent run would race on the runtime's
     * filesystem/state inside the worker and interleave two result
     * streams. The UI normally prevents this; defensive backstop.
     */
    if (this.activeRequestId) {
      return Promise.reject(
        new Error('An execution is already in progress.')
      );
    }

    const worker = this.ensureWorker();

    const requestId = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    const request: RuntimeRequest = {
      type: 'compile',
      requestId,
      code,
    };

    let stdinPipe: SharedStdinPipe | null = null;
    if (canUseSharedStdin()) {
      stdinPipe = new SharedStdinPipe(stdin);
      request.stdinBuffer = stdinPipe.buffer;
      request.stdin = '';
    } else {
      request.stdin = stdin;
    }

    this.activeRequestId = requestId;

    return new Promise<ExecutionResult>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        worker,
        hooks,
        stdinPipe,
      });

      if (!stdinPipe) {
        this.armWatchdog(requestId);
      }

      worker.postMessage(request);
    });
  }

  /** Backwards-compatible alias used by the C pipeline. */
  compile(
    code: string,
    stdin = '',
    hooks: RunHooks = {}
  ): Promise<ExecutionResult> {
    return this.run(code, stdin, hooks);
  }

  /** Forward a line of stdin to the active (possibly suspended) run. */
  sendInput(input: string): boolean {
    if (!this.activeRequestId) {
      return false;
    }

    const requestId = this.activeRequestId;
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    const message: RuntimeRequest = {
      type: 'stdin',
      requestId,
      input,
    };

    if (pending.stdinPipe) {
      try {
        pending.stdinPipe.append(input);
        return true;
      } catch {
        return false;
      }
    }

    // Resuming activity: give the run a fresh watchdog window.
    this.armWatchdog(requestId);

    pending.worker.postMessage(message);
    return true;
  }

  /** Abort the active run. Pending promises settle as 'stopped'. */
  stopCurrent(): void {
    if (!this.activeRequestId) {
      return;
    }

    const requestId = this.activeRequestId;
    const pending = this.pendingRequests.get(requestId);

    if (pending) {
      pending.stdinPipe?.close();
      this.teardownRequest(requestId);
      // Stop is a hard reset: drop the worker and settle the run so the UI
      // can clear transient stdin and start cleanly on the next run.
      this.disposeWorker();

      pending.hooks.onStatus?.('stopped');
      pending.resolve({
        success: false,
        output: '',
        error: 'Execution stopped.',
        exitCode: null,
        status: 'stopped',
      });
    }

    this.activeRequestId = null;
  }

  /** Whether a run is currently in flight on this client. */
  get busy(): boolean {
    return this.activeRequestId !== null;
  }

  /** Tear everything down (page unload / hard reset). */
  terminate(): void {
    for (const requestId of this.pendingRequests.keys()) {
      this.pendingRequests.get(requestId)?.stdinPipe?.close();
      this.disarmWatchdog(requestId);
    }

    this.pendingRequests.clear();
    this.watchdogs.clear();
    this.activeRequestId = null;
    // Release the reused worker when the client is being torn down.
    this.disposeWorker();
  }
}
