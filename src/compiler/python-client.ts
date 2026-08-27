import { ExecutionClient } from './execution-client';

export type {
  ExecutionResult,
} from './execution-protocol';

export type PythonRequest = {
  type: 'compile';
  requestId: string;
  code: string;
  stdin?: string;
};

/**
 * Python pipeline client.
 *
 * Wraps the shared ExecutionClient for the Python runtime worker.
 * Follows the same pattern as CompilerClientFacade for consistency.
 */
class PythonClientFacade {
  private readonly inner: ExecutionClient;

  constructor() {
    this.inner = new ExecutionClient(
      () => new URL('./python.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }

  run(
    code: string,
    stdin = '',
    hooks = {}
  ) {
    return this.inner.run(code, stdin, hooks);
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

export const pythonClient =
  new PythonClientFacade();
