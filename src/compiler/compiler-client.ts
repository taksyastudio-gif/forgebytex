import { ExecutionClient } from './execution-client';

export type {
  CompileResult,
  ExecutionResult,
} from './execution-protocol';

import type {
  ExecutionResult,
  RunHooks,
} from './execution-protocol';

export type CompileRequest = {
  type: 'compile';
  requestId: string;
  code: string;
  stdin?: string;
};

export type WorkerInputRequest = {
  type: 'stdin';
  requestId: string;
  input: string;
};

/**
 * C pipeline client.
 *
 * The full worker lifecycle (creation, message routing, stale-event
 * filtering, activity watchdog, stdin forwarding, stop/teardown) lives
 * in the shared ExecutionClient; this module only binds it to the C
 * toolchain worker and preserves the historical `compilerClient` API.
 */
class CompilerClientFacade {
  private readonly inner: ExecutionClient;
  private readonly backendUrl = import.meta.env.VITE_BACKEND_URL?.trim();

  constructor() {
    this.inner = new ExecutionClient(
      () => new URL('./compiler.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }

  compile(
    code: string,
    stdin = '',
    hooks: RunHooks = {}
  ) {
    if (!this.backendUrl) {
      return this.inner.compile(code, stdin, hooks);
    }

    return this.compileWithBackend(code, stdin, hooks);
  }

  private async compileWithBackend(
    code: string,
    stdin: string,
    hooks: RunHooks
  ): Promise<ExecutionResult> {
    hooks.onStatus?.('compiling');

    try {
      const response = await fetch(`${this.backendUrl}/api/compile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          stdin,
        }),
      });

      const result = await response.json() as {
        success?: boolean;
        output?: string;
        error?: string;
        exitCode?: number | null;
      };

      hooks.onStatus?.('running');

      if (result.output) {
        hooks.onOutput?.('stdout', result.output, 1);
      }

      const status = result.success ? 'completed' : 'failed';
      hooks.onStatus?.(status);

      return {
        success: Boolean(result.success),
        output: result.output ?? '',
        error: result.error,
        exitCode: result.exitCode ?? null,
        waitingForInput: false,
        status,
        phase: result.success ? 'run' : 'compile',
      };
    } catch {
      /*
       * Keep the existing browser compiler as the resilience path when
       * a configured backend is unreachable in local/dev environments.
       */
      return this.inner.compile(code, stdin, hooks);
    }
  }

  sendInput(input: string): boolean {
    return this.inner.sendInput(input);
  }

  stopCurrent(): void {
    this.inner.stopCurrent();
  }

  get busy(): boolean {
    return this.inner.busy;
  }

  terminate(): void {
    this.inner.terminate();
  }
}

export const compilerClient =
  new CompilerClientFacade();
