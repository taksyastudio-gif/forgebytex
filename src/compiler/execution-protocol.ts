/**
 * Shared execution protocol between the UI, the execution clients and
 * every language runtime worker (C toolchain, Python runtime).
 *
 * This is deliberately tiny: it defines the message vocabulary so that
 * C and Python share one stdout/stderr/status/exit-code contract without
 * coupling the two implementations to each other.
 */

/** Unified execution lifecycle shared by all languages. */
export type ExecutionStatus =
  | 'idle'
  | 'preparing'
  | 'compiling'
  | 'running'
  | 'waiting-input'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'timeout';

export type OutputStream = 'stdout' | 'stderr';

/** Which stage of the pipeline a result came from. */
export type ExecutionPhase = 'compile' | 'link' | 'run';

/**
 * Messages sent TO a runtime worker.
 * 'compile' starts a run (any language); 'stdin' feeds a suspended run.
 */
export type RuntimeRequest =
  | {
      type: 'compile';
      requestId: string;
      code: string;
      stdin?: string;
      stdinBuffer?: SharedArrayBuffer;
    }
  | {
      type: 'stdin';
      requestId: string;
      input: string;
    };

/**
 * Events produced BY a runtime worker.
 *
 * `attempt` counts how many times the worker has executed the program
 * for this requestId. Interactive runs that exhaust stdin are re-executed
 * from scratch with the accumulated input, so attempt > 1 replays earlier
 * output; clients use it to replace (not duplicate) what was shown.
 */
export type RuntimeEvent =
  | {
      type: 'stream';
      requestId: string;
      stream: OutputStream;
      text: string;
      attempt: number;
    }
  | {
      type: 'status';
      requestId: string;
      status: ExecutionStatus;
      attempt: number;
    }
  | {
      type: 'result';
      requestId: string;
      success: boolean;
      /** Accumulated stdout of the final attempt. */
      output: string;
      /** Compiler/linker/runtime error text (stderr or diagnostics). */
      error?: string;
      /** Compiler warnings on a successful run. */
      warnings?: string;
      /** Process exit code when known (null when the runtime crashed). */
      exitCode?: number | null;
      /** True when the program suspended waiting for more stdin. */
      waitingForInput?: boolean;
      status: ExecutionStatus;
      phase?: ExecutionPhase;
    };

export interface RunHooks {
  /**
   * Called for every streamed chunk of program output.
   * `attempt > 1` means the worker restarted the program (interactive
   * stdin resume) and previously streamed output should be replaced.
   */
  onOutput?: (
    stream: OutputStream,
    text: string,
    attempt: number
  ) => void;
  /** Called on every lifecycle transition of the current run. */
  onStatus?: (status: ExecutionStatus) => void;
}

export interface ExecutionResult {
  success: boolean;
  /** Accumulated stdout of the program. */
  output: string;
  /** Compiler/linker/runtime error text (stderr or diagnostics). */
  error?: string;
  /** Compiler warnings on a successful run. */
  warnings?: string;
  /** Process exit code when known (null when the runtime crashed). */
  exitCode?: number | null;
  /** True when the program suspended waiting for more stdin. */
  waitingForInput?: boolean;
  status: ExecutionStatus;
  /** Pipeline stage the result belongs to. */
  phase?: ExecutionPhase;
}

export const isTerminalStatus = (
  status: ExecutionStatus
): boolean =>
  status === 'completed' ||
  status === 'failed' ||
  status === 'stopped' ||
  status === 'timeout';

/** Legacy alias kept so existing imports keep working. */
export type CompileResult = ExecutionResult;
