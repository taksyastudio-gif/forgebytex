import { ErrorInterpreter } from './error-interpreter';
import type {
  ExecutionResult,
  RuntimeEvent,
  SupportedLanguage,
} from './execution-protocol';
import type { ExecutionCallbacks } from './execution-client';

interface PendingExecution {
  resolve: (result: ExecutionResult) => void;
  callbacks?: ExecutionCallbacks;
}

/**
 * Owns the dedicated C/C++ Web Worker.
 *
 * Worker output and lifecycle events are forwarded immediately to the UI,
 * while the promise resolves only after the complete execution finishes.
 */
export class CompilerClient {
  private worker: Worker | null = null;
  private activeRequestId: string | null = null;
  private pendingExecution: PendingExecution | null = null;

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker(): void {
    if (typeof Worker === 'undefined') {
      return;
    }

    try {
      this.worker = new Worker(
        new URL('./compiler.worker.ts', import.meta.url),
        { type: 'module' },
      );

      this.worker.addEventListener(
        'message',
        (event: MessageEvent<RuntimeEvent>) => {
          this.handleWorkerEvent(event.data);
        },
      );

      this.worker.addEventListener('error', (event) => {
        this.resolveWorkerFailure(
          event.message ||
            'The C/C++ worker stopped unexpectedly.',
        );
      });
    } catch (error: unknown) {
      this.worker = null;

      const message =
        error instanceof Error
          ? error.message
          : 'Unable to initialize the C/C++ worker.';

      console.error(
        'C/C++ worker initialization failed:',
        message,
      );
    }
  }

  public compileAndRun(
    code: string,
    language: SupportedLanguage,
    stdin = '',
    callbacks?: ExecutionCallbacks,
  ): Promise<ExecutionResult> {
    if (this.pendingExecution) {
      return Promise.resolve({
        success: false,
        output:
          '[Execution Error] A C/C++ program is already running. Stop it before starting another run.',
        error: 'A C/C++ execution is already active.',
        exitCode: null,
        status: 'failed',
        phase: 'run',
      });
    }

    if (!this.worker) {
      return Promise.resolve({
        success: false,
        output:
          '[Execution Error] The browser C/C++ worker is unavailable. Refresh the page and try again.',
        error: 'C/C++ worker is unavailable.',
        exitCode: null,
        status: 'infrastructure-error',
        phase: 'compile',
      });
    }

    const requestId = this.createRequestId();

    return new Promise<ExecutionResult>((resolve) => {
      this.activeRequestId = requestId;
      this.pendingExecution = {
        resolve,
        callbacks,
      };

      try {
        this.worker?.postMessage({
          type: 'compile',
          requestId,
          code,
          language,
          stdin,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to send the program to the C/C++ worker.';

        this.resolveWorkerFailure(message);
      }
    });
  }

  public sendInput(input: string): void {
    if (
      !this.worker ||
      !this.activeRequestId ||
      !this.pendingExecution
    ) {
      return;
    }

    try {
      this.worker.postMessage({
        type: 'stdin',
        requestId: this.activeRequestId,
        input,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to send input to the C/C++ worker.';

      this.resolveWorkerFailure(message);
    }
  }

  public stopCurrent(): void {
    if (!this.pendingExecution) {
      return;
    }

    const pendingExecution = this.pendingExecution;

    this.pendingExecution = null;
    this.activeRequestId = null;

    pendingExecution.resolve({
      success: false,
      output: '[VLNTOX] Execution stopped.',
      error: 'Execution stopped by the user.',
      exitCode: null,
      status: 'stopped',
      phase: 'run',
    });

    this.worker?.terminate();
    this.worker = null;
    this.initializeWorker();
  }

  private handleWorkerEvent(event: RuntimeEvent): void {
    const pendingExecution = this.pendingExecution;

    if (
      !pendingExecution ||
      !this.activeRequestId ||
      event.requestId !== this.activeRequestId
    ) {
      return;
    }

    if (event.type === 'stream') {
      pendingExecution.callbacks?.onOutput?.(
        event.stream,
        event.text,
        event.attempt,
      );
      return;
    }

    if (event.type === 'status') {
      pendingExecution.callbacks?.onStatus?.(event.status);
      return;
    }

    const result = this.createExecutionResult(event);

    pendingExecution.callbacks?.onStatus?.(result.status);

    if (event.waitingForInput) {
      pendingExecution.callbacks?.onStatus?.('waiting-input');
      return;
    }

    this.pendingExecution = null;
    this.activeRequestId = null;
    pendingExecution.resolve(result);
  }

  private createExecutionResult(
    event: Extract<RuntimeEvent, { type: 'result' }>,
  ): ExecutionResult {
    if (event.success) {
      return {
        success: true,
        output:
          event.output || 'Program completed with no output.',
        error: event.error,
        warnings: event.warnings,
        exitCode: event.exitCode ?? 0,
        waitingForInput: event.waitingForInput ?? false,
        status: event.status,
        phase: event.phase ?? 'run',
      };
    }

    const rawError = event.error || event.output;
    const insight = ErrorInterpreter.parse(rawError, 'c');

    const friendlyOutput = [
      `${insight.emoji} ${insight.humorousTitle}`,
      '',
      `What happened: ${insight.friendlyExplanation}`,
      `Quick fix: ${insight.suggestedFix}`,
      '',
      '---------------- Raw Compiler Output ----------------',
      rawError,
    ].join('\n');

    return {
      success: false,
      output: event.waitingForInput
        ? event.output
        : friendlyOutput,
      error: rawError,
      warnings: event.warnings,
      exitCode: event.exitCode ?? 1,
      waitingForInput: event.waitingForInput ?? false,
      status: event.status,
      phase: event.phase ?? 'compile',
    };
  }

  private resolveWorkerFailure(message: string): void {
    if (!this.pendingExecution) {
      return;
    }

    const pendingExecution = this.pendingExecution;

    this.pendingExecution = null;
    this.activeRequestId = null;

    pendingExecution.callbacks?.onStatus?.(
      'infrastructure-error',
    );

    pendingExecution.resolve({
      success: false,
      output: `[C/C++ Worker Error] ${message}`,
      error: message,
      exitCode: null,
      status: 'infrastructure-error',
      phase: 'compile',
    });
  }

  private createRequestId(): string {
    if (
      typeof crypto !== 'undefined' &&
      'randomUUID' in crypto
    ) {
      return crypto.randomUUID();
    }

    return `c-run-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
  }

  public terminate(): void {
    this.resolveWorkerFailure(
      'C/C++ execution was stopped by the application.',
    );

    this.worker?.terminate();
    this.worker = null;
  }
}

export default CompilerClient;