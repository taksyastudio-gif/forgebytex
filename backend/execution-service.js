/**
 * Execution Service - Integration Layer for execution-core
 * 
 * Wraps the native execution-core (ExecutionManager, CExecutor, PythonExecutor)
 * to provide session-based execution with SSE streaming, concurrency control,
 * and production safety gates.
 */

import { ExecutionManager } from '../execution-core/ExecutionManager.js';
import { detectIsolate } from '../execution-core/config.js';

// Production safety gate: require Isolate for production execution
const PRODUCTION_MODE = process.env.NODE_ENV === 'production';
const hasIsolate = detectIsolate();

if (PRODUCTION_MODE && !hasIsolate) {
  console.error('CRITICAL: Production mode requires Isolate sandbox. Native execution disabled.');
  console.error('Install and configure Isolate before deploying to production.');
}

// Bounded concurrency control
const MAX_CONCURRENT_EXECUTIONS = Number(process.env.MAX_CONCURRENT_EXECUTIONS || 10);
const activeExecutions = new Map();
const executionQueue = [];

/**
 * Session state for interactive execution
 */
class ExecutionSession {
  constructor(sessionId, requestId, language, source, stdin, interactiveProcess, callbacks) {
    this.sessionId = sessionId;
    this.requestId = requestId;
    this.language = language;
    this.source = source;
    this.stdin = stdin;
    this.interactiveProcess = interactiveProcess;
    this.callbacks = callbacks;
    this.finalized = false;
    this.stdout = '';
    this.stderr = '';
    this.warnings = null;
    this.manualStop = false;
    this.cleanupTimer = null;
    this.listeners = new Set();
    this.events = [];
  }

  broadcast(event, data) {
    const payload = formatSseEvent(event, data);
    this.events.push(payload);

    for (const res of this.listeners) {
      try {
        res.write(payload);
      } catch (error) {
        // Listener may have disconnected
        this.listeners.delete(res);
      }
    }
  }

  finalize(result) {
    if (this.finalized) {
      return;
    }

    this.finalized = true;

    this.broadcast('status', {
      type: 'status',
      requestId: this.requestId,
      status: result.status,
      attempt: 1,
    });

    this.broadcast('result', {
      type: 'result',
      requestId: this.requestId,
      success: result.success,
      output: result.stdout,
      error: result.error,
      warnings: result.warnings,
      exitCode: result.exitCode ?? null,
      waitingForInput: false,
      status: result.status,
      phase: result.phase ?? 'run',
    });

    // Schedule cleanup after 30 seconds
    if (!this.cleanupTimer) {
      this.cleanupTimer = setTimeout(() => {
        cleanupSession(this.sessionId);
      }, 30000);
    }
  }
}

/**
 * Format SSE event
 */
function formatSseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Map execution-core status to frontend protocol status
 */
function mapStatus(coreStatus) {
  const statusMap = {
    'idle': 'idle',
    'preparing': 'preparing',
    'compiling': 'compiling',
    'running': 'running',
    'compile-error': 'failed',
    'completed': 'completed',
    'failed': 'failed',
    'timeout': 'timeout',
    'memory-limit': 'timeout',
    'output-limit': 'timeout',
    'process-limit': 'timeout',
    'sandbox-error': 'failed',
    'infrastructure-error': 'failed',
  };

  return statusMap[coreStatus] || 'failed';
}

/**
 * Check if execution can start (concurrency control)
 */
function canStartExecution() {
  return activeExecutions.size < MAX_CONCURRENT_EXECUTIONS;
}

/**
 * Queue execution for later when slot available
 */
function queueExecution(fn) {
  executionQueue.push(fn);
}

/**
 * Process queued executions
 */
function processQueue() {
  while (executionQueue.length > 0 && canStartExecution()) {
    const fn = executionQueue.shift();
    if (fn) {
      fn();
    }
  }
}

/**
 * Cleanup session resources
 */
async function cleanupSession(sessionId) {
  const session = activeExecutions.get(sessionId);
  if (!session) {
    return;
  }

  activeExecutions.delete(sessionId);

  if (session.cleanupTimer) {
    clearTimeout(session.cleanupTimer);
    session.cleanupTimer = null;
  }

  for (const res of session.listeners) {
    try {
      res.end();
    } catch {
      // Ignore stale response teardown errors
    }
  }

  session.listeners.clear();

  if (session.interactiveProcess && session.interactiveProcess.isAlive()) {
    try {
      session.interactiveProcess.stop();
    } catch {
      // Ignore cleanup failures
    }
  }

  processQueue();
}

/**
 * Start an execution session
 */
async function startExecution(request) {
  const language = request?.language || 'c';
  const source = request?.source || '';
  const stdin = request?.stdin || '';
  const interactive = request?.interactive || false;
  const requestId = request?.requestId || `exec-${Date.now()}`;

  // Production safety gate
  if (PRODUCTION_MODE && !hasIsolate) {
    return {
      success: false,
      phase: 'validation',
      requestId,
      error: {
        code: 'INFRASTRUCTURE_ERROR',
        message: 'Production execution requires Isolate sandbox. Please configure Isolate before deploying.',
      },
      exitCode: 1,
    };
  }

  // Validate language
  if (!['c', 'python'].includes(language)) {
    return {
      success: false,
      phase: 'validation',
      requestId,
      error: {
        code: 'UNSUPPORTED_LANGUAGE',
        message: `Language '${language}' is not supported. Supported languages: c, python`,
      },
      exitCode: 1,
    };
  }

  // Validate source
  if (!source.trim()) {
    return {
      success: false,
      phase: 'validation',
      requestId,
      error: {
        code: 'EMPTY_SOURCE',
        message: 'Source code is required for execution.',
      },
      exitCode: 1,
    };
  }

  // Check concurrency
  if (!canStartExecution()) {
    return {
      success: false,
      phase: 'concurrency',
      requestId,
      error: {
        code: 'CONCURRENCY_LIMIT',
        message: `Maximum concurrent executions (${MAX_CONCURRENT_EXECUTIONS}) reached. Please try again later.`,
      },
      exitCode: 1,
    };
  }

  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Create execution request for execution-core
  const executionRequest = {
    language,
    source,
    mode: interactive ? 'interactive' : 'non-interactive',
    stdin,
    limits: {
      cpuTime: 10,
      wallTime: 15,
      memory: 256,
      output: 10,
      filesystem: 50,
      processes: 10,
    },
  };

  try {
    if (interactive) {
      return await startInteractiveSession(sessionId, requestId, executionRequest);
    } else {
      return await startNonInteractiveSession(sessionId, requestId, executionRequest);
    }
  } catch (error) {
    activeExecutions.delete(sessionId);
    return {
      success: false,
      phase: 'execution',
      requestId,
      error: {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
      exitCode: 1,
    };
  }
}

/**
 * Start interactive session with SSE streaming
 */
async function startInteractiveSession(sessionId, requestId, executionRequest) {
  const executionManager = new ExecutionManager();

  const session = new ExecutionSession(
    sessionId,
    requestId,
    executionRequest.language,
    executionRequest.source,
    executionRequest.stdin,
    null, // interactiveProcess will be set below
    null  // callbacks
  );

  activeExecutions.set(sessionId, session);

  // Create interactive process
  const interactiveProcess = await executionManager.createInteractiveProcess(
    executionRequest,
    {
      onStdout: (text) => {
        session.stdout += text;
        session.broadcast('stream', {
          type: 'stream',
          requestId,
          stream: 'stdout',
          text,
          attempt: 1,
        });
      },
      onStderr: (text) => {
        session.stderr += text;
        session.broadcast('stream', {
          type: 'stream',
          requestId,
          stream: 'stderr',
          text,
          attempt: 1,
        });
      },
      onStatus: (status) => {
        const mappedStatus = mapStatus(status);
        session.broadcast('status', {
          type: 'status',
          requestId,
          status: mappedStatus,
          attempt: 1,
        });
      },
      onExit: (result) => {
        session.finalize({
          success: result.success,
          stdout: session.stdout,
          stderr: session.stderr,
          error: result.diagnostics,
          warnings: session.warnings,
          exitCode: result.exitCode,
          status: mapStatus(result.status),
          phase: result.phase,
        });
      },
    }
  );

  session.interactiveProcess = interactiveProcess;

  // Send initial stdin if provided
  if (executionRequest.stdin) {
    interactiveProcess.write(executionRequest.stdin);
  }

  return {
    success: true,
    requestId,
    sessionId,
    phase: 'run',
  };
}

/**
 * Start non-interactive session (single execution)
 */
async function startNonInteractiveSession(sessionId, requestId, executionRequest) {
  const executionManager = new ExecutionManager();

  const result = await executionManager.execute(executionRequest, {
    onStatus: (status) => {
      console.log(`[Execution Status] ${status}`);
    },
  });

  activeExecutions.delete(sessionId);

  console.log(`[Execution Result] success=${result.success}, status=${result.status}, phase=${result.phase}`);
  console.log(`[Execution Output] stdout="${result.stdout}", stderr="${result.stderr}", diagnostics="${result.diagnostics}"`);

  return {
    success: result.success,
    requestId,
    sessionId,
    phase: result.phase,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.diagnostics || result.stderr,
    warnings: result.warnings,
    exitCode: result.exitCode,
    status: mapStatus(result.status),
  };
}

/**
 * Handle stdin input for interactive session
 */
function handleInput(sessionId, input, eof = false) {
  const session = activeExecutions.get(sessionId);
  if (!session || !session.interactiveProcess) {
    return {
      success: false,
      error: {
        code: 'SESSION_NOT_FOUND',
        message: 'Interactive execution session not found.',
      },
    };
  }

  if (!session.interactiveProcess.isAlive()) {
    return {
      success: false,
      error: {
        code: 'SESSION_TERMINATED',
        message: 'Session has already terminated.',
      },
    };
  }

  try {
    if (eof) {
      // Close stdin (EOF)
      // Note: InteractiveProcess interface doesn't have closeStdin, so we send empty input
      // The process will treat closed stdin as EOF
    } else if (input) {
      session.interactiveProcess.write(input);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'STDIN_WRITE_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/**
 * Stop interactive session
 */
function stopSession(sessionId) {
  const session = activeExecutions.get(sessionId);
  if (!session) {
    return {
      success: false,
      error: {
        code: 'SESSION_NOT_FOUND',
        message: 'Interactive execution session not found.',
      },
    };
  }

  session.manualStop = true;

  if (session.interactiveProcess && session.interactiveProcess.isAlive()) {
    session.interactiveProcess.stop();
  }

  session.finalize({
    success: false,
    stdout: session.stdout,
    error: 'Execution stopped.',
    warnings: session.warnings,
    exitCode: null,
    status: 'stopped',
    phase: 'run',
  });

  return { success: true };
}

/**
 * Get SSE event stream for session
 */
function getEventStream(sessionId) {
  const session = activeExecutions.get(sessionId);
  if (!session) {
    return null;
  }

  return session;
}

/**
 * Get execution service status
 */
function getServiceStatus() {
  return {
    hasIsolate,
    productionMode: PRODUCTION_MODE,
    maxConcurrentExecutions: MAX_CONCURRENT_EXECUTIONS,
    activeExecutions: activeExecutions.size,
    queuedExecutions: executionQueue.length,
  };
}

export {
  startExecution,
  handleInput,
  stopSession,
  getEventStream,
  cleanupSession,
  getServiceStatus,
  hasIsolate,
  PRODUCTION_MODE,
};
