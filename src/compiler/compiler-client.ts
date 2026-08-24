export type CompileRequest = {
  type: 'compile';
  requestId: string;
  code: string;
  stdin?: string;
};

export type CompileResult = {
  success: boolean;
  output: string;
  error?: string;
  warnings?: string;
};

type WorkerResponse = {
  type: 'result';
  requestId: string;
  success: boolean;
  output: string;
  error?: string;
  warnings?: string;
};

type PendingRequest = {
  resolve: (result: CompileResult) => void;
  reject: (error: Error) => void;
  worker: Worker;
};

class CompilerClient {
  private pendingRequests = new Map<string, PendingRequest>();
  private pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly requestTimeoutMs = 30000;

  private createWorker(): Worker {
    const worker = new Worker(
      new URL('./compiler.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.addEventListener(
      'message',
      this.handleMessage
    );

    worker.addEventListener(
      'error',
      this.handleWorkerError
    );

    worker.addEventListener(
      'messageerror',
      this.handleMessageError
    );

    return worker;
  }

  private removeRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(requestId);

    const timeoutId = this.pendingTimeouts.get(requestId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.pendingTimeouts.delete(requestId);
    }

    try {
      pending.worker.terminate();
    } catch {
      // Ignore worker teardown errors.
    }
  }

  private handleMessage = (
    event: MessageEvent<WorkerResponse>
  ): void => {
    const data = event.data;

    if (!data || data.type !== 'result') {
      return;
    }

    const pending = this.pendingRequests.get(
      data.requestId
    );

    if (!pending) {
      return;
    }

    this.removeRequest(data.requestId);

    pending.resolve({
      success: data.success,
      output: data.output,
      error: data.error,
      warnings: data.warnings,
    });
  };

  private handleWorkerError = (
    event: ErrorEvent
  ): void => {
    const error = new Error(
      event.message ||
        'The compiler worker stopped unexpectedly.'
    );

    this.rejectAllPending(error);
  };

  private handleMessageError = (): void => {
    const error = new Error(
      'Unable to communicate with the compiler worker.'
    );

    this.rejectAllPending(error);
  };

  private rejectAllPending(error: Error): void {
    for (const timeoutId of this.pendingTimeouts.values()) {
      clearTimeout(timeoutId);
    }

    for (const pending of this.pendingRequests.values()) {
      try {
        pending.worker.terminate();
      } catch {
        // Ignore worker teardown errors.
      }
      pending.reject(error);
    }

    this.pendingTimeouts.clear();
    this.pendingRequests.clear();
  }

  compile(
    code: string,
    stdin = ''
  ): Promise<CompileResult> {
    const backendUrl =
      typeof import.meta !== 'undefined' &&
      import.meta.env &&
      import.meta.env.VITE_BACKEND_URL
        ? String(import.meta.env.VITE_BACKEND_URL).replace(/\/$/, '')
        : '';

    if (backendUrl) {
      return fetch(`${backendUrl}/api/compile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          stdin,
        }),
      }).then(async (response) => {
        const data = await response.json();

        if (!response.ok || data.success === false) {
          return {
            success: false,
            output: data.output || '',
            error: data.error || 'Backend compilation failed.',
          };
        }

        return {
          success: true,
          output: data.output || '',
          error: data.error || undefined,
        };
      });
    }

    const worker = this.createWorker();

    const requestId =
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const request: CompileRequest = {
      type: 'compile',
      requestId,
      code,
      stdin,
    };

    return new Promise<CompileResult>(
      (resolve, reject) => {
        this.pendingRequests.set(requestId, {
          resolve,
          reject,
          worker,
        });

        const timeoutId = setTimeout(() => {
          if (!this.pendingRequests.has(requestId)) {
            return;
          }

          const pending = this.pendingRequests.get(requestId);
          this.pendingRequests.delete(requestId);
          this.pendingTimeouts.delete(requestId);

          try {
            pending?.worker.terminate();
          } catch {
            // Ignore worker teardown errors.
          }

          reject(new Error('Compiler timed out. Please try again.'));
        }, this.requestTimeoutMs);

        this.pendingTimeouts.set(requestId, timeoutId);

        worker.postMessage(request);
      }
    );
  }

  terminate(): void {
    for (const timeoutId of this.pendingTimeouts.values()) {
      clearTimeout(timeoutId);
    }

    this.pendingTimeouts.clear();

    for (const pending of this.pendingRequests.values()) {
      try {
        pending.worker.terminate();
      } catch {
        // Ignore worker teardown errors.
      }
    }

    this.pendingRequests.clear();
  }
}

export const compilerClient =
  new CompilerClient();