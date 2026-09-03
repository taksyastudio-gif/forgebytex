/**
 * Execution Core Types
 * 
 * Language-agnostic execution abstraction for ForgeByteX native execution engine.
 * This defines the interface between the execution manager and language-specific executors.
 */

/**
 * Supported languages for native execution
 */
export type Language = 'c' | 'python';

/**
 * Execution mode
 */
export type ExecutionMode = 'non-interactive' | 'interactive';

/**
 * Resource limits for execution
 */
export interface ResourceLimits {
  /** CPU time limit in seconds */
  cpuTime: number;
  /** Wall clock time limit in seconds */
  wallTime: number;
  /** Memory limit in megabytes */
  memory: number;
  /** Output size limit in megabytes */
  output: number;
  /** Filesystem size limit in megabytes */
  filesystem: number;
  /** Maximum number of processes */
  processes: number;
}

/**
 * Default resource limits (conservative initial values)
 */
export const DEFAULT_LIMITS: ResourceLimits = {
  cpuTime: 10,
  wallTime: 15,
  memory: 256,
  output: 10,
  filesystem: 50,
  processes: 10,
};

/**
 * Execution request
 */
export interface ExecutionRequest {
  /** Programming language */
  language: Language;
  /** Source code to execute */
  source: string;
  /** Initial stdin content */
  stdin?: string;
  /** Resource limits (uses defaults if not provided) */
  limits?: Partial<ResourceLimits>;
  /** Execution mode */
  mode?: ExecutionMode;
  /** Request ID for tracking */
  requestId?: string;
}

/**
 * Execution status
 */
export type ExecutionStatus =
  | 'idle'
  | 'preparing'
  | 'compiling'
  | 'compile-error'
  | 'running'
  | 'waiting-input'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'timeout'
  | 'memory-limit'
  | 'process-limit'
  | 'output-limit'
  | 'sandbox-error'
  | 'infrastructure-error';

/**
 * Execution phase
 */
export type ExecutionPhase = 'compile' | 'run';

/**
 * Output stream type
 */
export type OutputStream = 'stdout' | 'stderr';

/**
 * Execution result
 */
export interface ExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Final execution status */
  status: ExecutionStatus;
  /** Execution phase where result occurred */
  phase: ExecutionPhase;
  /** Accumulated stdout */
  stdout: string;
  /** Accumulated stderr */
  stderr: string;
  /** Exit code (null if process crashed/terminated) */
  exitCode: number | null;
  /** Signal that terminated process (if applicable) */
  signal: string | null;
  /** Execution duration in milliseconds */
  duration: number;
  /** Resource usage statistics */
  resourceUsage?: {
    cpuTime?: number;
    memoryPeak?: number;
    outputSize?: number;
  };
  /** Diagnostics information */
  diagnostics?: string;
}

/**
 * Interactive process interface
 */
export interface InteractiveProcess {
  /** Check if process is still alive */
  isAlive(): boolean;
  
  /** Stop the process */
  stop(): void;
  
  /** Write to process stdin */
  write(data: string): void;

  /** Close stdin so a waiting reader receives EOF. */
  closeStdin?(): void;
  
  /** Read from process stdout */
  read(): string;
  
  /** Get current output */
  getOutput(): string;
  
  /** Get current error output */
  getError(): string;
}

/**
 * Process event callbacks
 */
export interface ProcessCallbacks {
  /** Called when stdout data is available */
  onStdout?: (data: string) => void;
  /** Called when stderr data is available */
  onStderr?: (data: string) => void;
  /** Called when process exits */
  onExit?: (result: ExecutionResult) => void;
  /** Called when process status changes */
  onStatus?: (status: ExecutionStatus) => void;
}

/**
 * Language executor interface
 */
export interface LanguageExecutor {
  /**
   * Execute code with given parameters
   */
  execute(request: ExecutionRequest, callbacks?: ProcessCallbacks): Promise<ExecutionResult>;
  
  /**
   * Create interactive process for stdin handling
   */
  createInteractiveProcess(request: ExecutionRequest, callbacks?: ProcessCallbacks): Promise<InteractiveProcess>;
  
  /**
   * Check if executor is available in current environment
   */
  isAvailable(): boolean;
  
  /**
   * Get executor description
   */
  getDescription(): string;
}
