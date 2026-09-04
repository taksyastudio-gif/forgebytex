import { ExecutionClient } from './execution-client';
import PythonWorker from './python.worker?worker';
import type {
  ExecutionPhase,
  ExecutionResult,
  ExecutionStatus,
  RunHooks,
} from './execution-protocol';

export type PythonRequest = {
  type: 'compile';
  requestId: string;
  code: string;
  stdin?: string;
};

type BackendStartResponse = {
  success?: boolean;
  requestId?: string;
  sessionId?: string;
  phase?: ExecutionPhase;
  output?: string;
  error?: string | { message?: string };
  warnings?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
};

type BackendStreamEvent = {
  type?: 'stream';
  requestId?: string;
  stream?: 'stdout' | 'stderr';
  text?: string;
  attempt?: number;
};

type BackendStatusEvent = {
  type?: 'status';
  requestId?: string;
  status?: ExecutionStatus;
  attempt?: number;
};

type BackendResultEvent = {
  type?: 'result';
  requestId?: string;
  success?: boolean;
  output?: string;
  error?: string | { message?: string };
  warnings?: string;
  exitCode?: number | null;
  waitingForInput?: boolean;
  status?: ExecutionStatus;
  phase?: ExecutionPhase;
};

type ActiveBackendRun = {
  sessionId: string;
  eventSource: EventSource;
  hooks: RunHooks;
  resolve: (result: ExecutionResult) => void;
  reject: (error: Error) => void;
  stdout: string;
  stderr: string;
  warnings?: string;
  settled: boolean;
};

function normalizeBackendError(
  error: BackendStartResponse['error'],
  fallback: string
): string {
  if (!error) {
    return fallback;
  }

  if (typeof error === 'string') {
    return error;
  }

  return error.message || fallback;
}

/**
 * Python pipeline client.
 *
 * If a backend URL is available we run Python through the native interactive
 * execution service so input() can keep the child process alive while
 * waiting for stdin. Otherwise we fall back to the browser worker path.
 */
class PythonClientFacade {
  private readonly inner: ExecutionClient;
  private readonly backendUrl = import.meta.env.VITE_BACKEND_URL?.trim();
  private backendRun: ActiveBackendRun | null = null;

  constructor() {
    this.inner = new ExecutionClient(
      () => new PythonWorker()
    );
  }

  run(
    code: string,
    stdin = '',
    hooks: RunHooks = {}
  ) {
    if (!this.backendUrl) {
      return this.inner.run(code, stdin, hooks);
    }

    return this.runWithBackend(code, stdin, hooks);
  }

  private async runWithBackend(
    code: string,
    stdin: string,
    hooks: RunHooks
  ): Promise<ExecutionResult> {
    if (this.backendRun) {
      return Promise.reject(new Error('An execution is already in progress.'));
    }

    hooks.onStatus?.('running');

    try {
      const response = await fetch(`${this.backendUrl}/api/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language: 'python',
          source: code,
          stdin,
          interactive: true,
        }),
      });

      const payload = await response.json() as BackendStartResponse;

      if (!response.ok || !payload.success || !payload.sessionId) {
        const errorText = normalizeBackendError(
          payload.error,
          payload.output || payload.stderr || 'Execution failed.'
        );

        if (payload.output) {
          hooks.onOutput?.('stdout', payload.output, 1);
        }

        if (payload.stderr) {
          hooks.onOutput?.('stderr', payload.stderr, 1);
        }

        hooks.onStatus?.('failed');

        return {
          success: false,
          output: payload.output || payload.stderr || '',
          error: errorText,
          exitCode: payload.exitCode ?? null,
          waitingForInput: false,
          status: 'failed',
          phase: payload.phase ?? 'run',
        };
      }

      return await new Promise<ExecutionResult>((resolve) => {
        const sessionId = payload.sessionId as string;
        const eventSource = new EventSource(
          `${this.backendUrl}/api/execute/${sessionId}/events`
        );

        const cleanup = () => {
          if (this.backendRun?.sessionId === sessionId) {
            this.backendRun = null;
          }

          try {
            eventSource.close();
          } catch {
            // Ignore EventSource teardown errors.
          }
        };

        const resolveOnce = (result: ExecutionResult) => {
          if (!this.backendRun || this.backendRun.settled) {
            return;
          }

          this.backendRun.settled = true;
          cleanup();
          resolve(result);
        };

        this.backendRun = {
          sessionId,
          eventSource,
          hooks,
          resolve: resolveOnce,
          reject: () => {},
          stdout: '',
          stderr: '',
          warnings: payload.warnings,
          settled: false,
        };

        hooks.onStatus?.('running');

        if (payload.warnings) {
          this.backendRun.warnings = payload.warnings;
        }

        eventSource.addEventListener('stream', (event: MessageEvent) => {
          if (!this.backendRun || this.backendRun.sessionId !== sessionId) {
            return;
          }

          const data = JSON.parse(event.data as string) as BackendStreamEvent;
          const text = data.text || '';
          if (!text) {
            return;
          }

          if (data.stream === 'stderr') {
            this.backendRun.stderr += text;
          } else {
            this.backendRun.stdout += text;
          }

          hooks.onOutput?.(data.stream || 'stdout', text, data.attempt ?? 1);
        });

        eventSource.addEventListener('status', (event: MessageEvent) => {
          const data = JSON.parse(event.data as string) as BackendStatusEvent;
          if (data.status) {
            hooks.onStatus?.(data.status);
          }
        });

        eventSource.addEventListener('result', (event: MessageEvent) => {
          if (!this.backendRun || this.backendRun.sessionId !== sessionId) {
            return;
          }

          const data = JSON.parse(event.data as string) as BackendResultEvent;
          const output = data.output ?? this.backendRun.stdout;
          const stderr = this.backendRun.stderr.trim();
          const errorText = normalizeBackendError(
            data.error,
            stderr || output || 'The runtime worker stopped unexpectedly.'
          );

          resolveOnce({
            success: Boolean(data.success),
            output,
            error: data.success ? undefined : errorText,
            warnings: data.warnings ?? this.backendRun.warnings,
            exitCode: data.exitCode ?? null,
            waitingForInput: false,
            status: data.status ?? (data.success ? 'completed' : 'failed'),
            phase: data.phase ?? 'run',
          });
        });

        eventSource.onerror = () => {
          if (!this.backendRun || this.backendRun.sessionId !== sessionId || this.backendRun.settled) {
            return;
          }

          const error = new Error(
            'The interactive Python runtime connection was lost.'
          );

          resolveOnce({
            success: false,
            output: this.backendRun.stdout,
            error: error.message,
            exitCode: null,
            waitingForInput: false,
            status: 'failed',
            phase: 'run',
          });
        };
      });
    } catch {
      /*
       * Keep the existing browser compiler as the resilience path when
       * a configured backend is unreachable in local/dev environments.
       */
      return this.inner.run(code, stdin, hooks);
    }
  }

  sendInput(input: string): boolean {
    if (!this.backendRun) {
      return this.inner.sendInput(input);
    }

    const sessionId = this.backendRun.sessionId;

    void fetch(`${this.backendUrl}/api/execute/${sessionId}/input`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input,
      }),
    }).catch(() => {
      // The session may disappear while the tab is closing.
    });

    return true;
  }

  stopCurrent(): void {
    if (this.backendRun) {
      const { sessionId, resolve, stdout, warnings } = this.backendRun;
      this.backendRun.settled = true;
      this.backendRun = null;

      void fetch(`${this.backendUrl}/api/execute/${sessionId}/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        keepalive: true,
      });

      resolve({
        success: false,
        output: stdout,
        error: 'Execution stopped.',
        warnings,
        exitCode: null,
        status: 'stopped',
        waitingForInput: false,
        phase: 'run',
      });
      return;
    }

    this.inner.stopCurrent();
  }

  get busy(): boolean {
    return this.backendRun !== null || this.inner.busy;
  }

  terminate(): void {
    this.stopCurrent();
    this.inner.terminate();
  }
}

export const pythonClient =
  new PythonClientFacade();
