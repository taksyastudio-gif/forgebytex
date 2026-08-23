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
};

type WorkerResponse = {
  type: 'result';
  requestId: string;
  success: boolean;
  output: string;
  error?: string;
};

type PendingRequest = {
  resolve: (result: CompileResult) => void;
  reject: (error: Error) => void;
};

class CompilerClient {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();

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

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = this.createWorker();
    }

    return this.worker;
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

    this.pendingRequests.delete(data.requestId);

    pending.resolve({
      success: data.success,
      output: data.output,
      error: data.error,
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

    this.worker?.terminate();
    this.worker = null;
  };

  private handleMessageError = (): void => {
    const error = new Error(
      'Unable to communicate with the compiler worker.'
    );

    this.rejectAllPending(error);

    this.worker?.terminate();
    this.worker = null;
  };

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }

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

    const worker = this.ensureWorker();

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
        });

        worker.postMessage(request);
      }
    );
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;

    this.rejectAllPending(
      new Error('Compiler worker terminated.')
    );
  }
}

export const compilerClient =
  new CompilerClient();