import type {
  ExecutionPhase,
  ExecutionStatus,
  OutputStream,
  RuntimeEvent,
  RuntimeRequest,
} from './execution-protocol';

// Load the Pyodide assets served from public/pyodide.
const PYODIDE_BASE = '/pyodide/';

type LoadPyodideFn = typeof import('pyodide').loadPyodide;
type PyodideRuntime = Awaited<ReturnType<LoadPyodideFn>>;

let loadPyodideFunc: LoadPyodideFn | null = null;
let pyodideRuntimePromise: Promise<PyodideRuntime> | null = null;

const getLoadPyodide = async (): Promise<LoadPyodideFn> => {
  if (loadPyodideFunc) return loadPyodideFunc;

  const response = await fetch(`${PYODIDE_BASE}pyodide.mjs`);
  if (!response.ok) {
    throw new Error(`Unable to load local Pyodide (${response.status})`);
  }

  const pyodideUrl = URL.createObjectURL(
    new Blob([await response.text()], { type: 'text/javascript' })
  );

  let pyodideModule: { loadPyodide: LoadPyodideFn };
  try {
    pyodideModule = (await import(
      /* @vite-ignore */ pyodideUrl
    )) as { loadPyodide: LoadPyodideFn };
  } finally {
    URL.revokeObjectURL(pyodideUrl);
  }

  loadPyodideFunc = pyodideModule.loadPyodide;
  return loadPyodideFunc;
};

const getPyodideRuntime = async (): Promise<PyodideRuntime> => {
  if (!pyodideRuntimePromise) {
    // Cache the initialized runtime so repeated runs reuse the same Pyodide
    // instance after the local asset bundle has been loaded.
    pyodideRuntimePromise = (async () => {
      const loadFn = await getLoadPyodide();

      return loadFn({
        indexURL: PYODIDE_BASE,
      });
    })().catch((error) => {
      pyodideRuntimePromise = null;
      throw error;
    });
  }

  return pyodideRuntimePromise;
};

const STDIN_REQUIRED_MARKER = '__FORGEBYTEX_STDIN_REQUIRED__';

class StdinRequiredError extends Error {
  constructor() {
    super(STDIN_REQUIRED_MARKER);
    this.name = 'StdinRequiredError';
  }
}

type Session = {
  code: string;
  stdin: string;
  attempt: number;
};

const executionSessions = new Map<string, Session>();

let executionChain: Promise<void> = Promise.resolve();

const enqueueExecution = (task: () => Promise<void>): void => {
  executionChain = executionChain.then(task, task);
};

async function runPython(
  code: string,
  requestId: string,
  attempt: number,
  session: Session
): Promise<{
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number | null;
  waitingForInput?: boolean;
  status: ExecutionStatus;
  phase: ExecutionPhase;
}> {
  const post = (event: RuntimeEvent): void => {
    self.postMessage(event);
  };

  const emit = (
    stream: OutputStream,
    text: string
  ): void => {
    if (!text) {
      return;
    }

    post({
      type: 'stream',
      requestId,
      stream,
      text,
      attempt,
    });
  };

  try {
    if (!pyodideRuntimePromise) {
      post({
        type: 'status',
        requestId,
        status: 'preparing',
        attempt,
      });
    }

    let pyodide: PyodideRuntime;
    try {
      pyodide = await getPyodideRuntime();
    } catch (loadError) {
      const errorMsg = loadError instanceof Error ? loadError.message : String(loadError);
      emit('stderr', `Failed to load Pyodide: ${errorMsg}\n`);
      throw loadError;
    }

    // Configure streams for this attempt so emit closure captures current attempt
    pyodide.setStdout({
      batched: (s: string) => {
        emit('stdout', s);
      },
    });

    pyodide.setStderr({
      batched: (s: string) => {
        // Drop the traceback line produced when the stdin handler
        // suspends for more input; it is not a real error.
        if (s.includes(STDIN_REQUIRED_MARKER)) {
          return;
        }
        emit('stderr', s);
      },
    });

    // Live stdin: read lines from session.stdin buffer starting at offset 0 for this attempt.
    let stdinOffset = 0;
    let wasStdinRequired = false;

    pyodide.setStdin({
      stdin: () => {
        if (stdinOffset < session.stdin.length) {
          const nl = session.stdin.indexOf('\n', stdinOffset);
          if (nl !== -1) {
            const line = session.stdin.slice(stdinOffset, nl);
            stdinOffset = nl + 1;
            return line;
          }
          const line = session.stdin.slice(stdinOffset);
          stdinOffset = session.stdin.length;
          return line;
        }
        wasStdinRequired = true;
        throw new StdinRequiredError();
      },
    });

    post({
      type: 'status',
      requestId,
      status: 'running',
      attempt,
    });

    // Run the Python code
    let output = '';
    // Each attempt gets a fresh globals table so imports and variables from
    // prior runs do not leak into the next execution.
    const globals = pyodide.toPy({});

    try {
      const result = await pyodide.runPythonAsync(code, {
        globals,
        locals: globals,
      });
      
      // Convert result to string if it's not None
      if (result !== undefined && result !== null) {
        const resultStr = String(result);
        if (resultStr && resultStr !== 'None') {
          output = resultStr;
          emit('stdout', resultStr + '\n');
        }
      }

      return {
        success: true,
        output,
        error: undefined,
        exitCode: 0,
        waitingForInput: false,
        status: 'completed',
        phase: 'run',
      };
    } catch (pythonError) {
      const errorMessage = pythonError instanceof Error ? pythonError.message : String(pythonError);

      // Live stdin suspend: the stdin handler threw to request more
      // input. Surface it as waiting-input so the client forwards more
      // via sendInput and re-runs with the accumulated buffer.
      if (
        wasStdinRequired ||
        errorMessage.includes(STDIN_REQUIRED_MARKER) ||
        errorMessage.includes('Errno 29')
      ) {
        // Pyodide cannot suspend the same stack frame at input(); the run is
        // replayed from scratch with the accumulated stdin buffer instead.
        return {
          success: false,
          output: '',
          error: '',
          exitCode: null,
          waitingForInput: true,
          status: 'waiting-input',
          phase: 'run',
        };
      }

      // Check if this is a syntax error vs runtime error
      if (errorMessage.includes('SyntaxError')) {
        return {
          success: false,
          output: errorMessage,
          error: errorMessage,
          exitCode: 1,
          waitingForInput: false,
          status: 'failed',
          phase: 'compile',
        };
      }

      return {
        success: false,
        output: errorMessage,
        error: errorMessage,
        exitCode: 1,
        waitingForInput: false,
        status: 'failed',
        phase: 'run',
      };
    } finally {
      try {
        globals.destroy();
      } catch {
        // Ignore proxy cleanup errors.
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    return {
      success: false,
      output: message,
      error: message,
      exitCode: null,
      status: 'failed',
      phase: 'run',
    };
  }
}

const finishRun = (
  requestId: string,
  attempt: number,
  result: Awaited<ReturnType<typeof runPython>>
): void => {
  self.postMessage({
    type: 'status',
    requestId,
    status: result.status,
    attempt,
  } satisfies RuntimeEvent);

  self.postMessage({
    type: 'result',
    requestId,
    success: result.success,
    output: result.output,
    error: result.error,
    exitCode: result.exitCode ?? null,
    waitingForInput: result.waitingForInput ?? false,
    status: result.status,
    phase: result.phase,
  } satisfies RuntimeEvent);

  if (!result.waitingForInput) {
    executionSessions.delete(requestId);
  }
};

const runSession = async (
  requestId: string,
  session: Session
): Promise<void> => {
  const attempt = session.attempt;

  const result = await runPython(
    session.code,
    requestId,
    attempt,
    session
  );

  if (result.waitingForInput) {
    // Match the C worker: bump attempt so the client replaces (not
    // appends) the re-streamed output on the resumed run.
    session.attempt += 1;
  }

  finishRun(requestId, attempt, result);
};

self.addEventListener(
  'message',
  (
    event: MessageEvent<RuntimeRequest>
  ) => {
    const data = event.data;

    if (!data) {
      return;
    }

    if (data.type === 'stdin') {
      const session = executionSessions.get(data.requestId);
      if (!session) {
        return;
      }

      session.stdin += data.input;

      enqueueExecution(async () => {
        try {
          await runSession(data.requestId, session);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          self.postMessage({
            type: 'status',
            requestId: data.requestId,
            status: 'failed',
            attempt: session.attempt,
          } satisfies RuntimeEvent);

          self.postMessage({
            type: 'result',
            requestId: data.requestId,
            success: false,
            output: message,
            error: message,
            exitCode: null,
            waitingForInput: false,
            status: 'failed',
            phase: 'run',
          } satisfies RuntimeEvent);

          executionSessions.delete(data.requestId);
        }
      });
      return;
    }

    if (data.type !== 'compile') {
      return;
    }

    const session: Session = {
      code: data.code,
      stdin: data.stdin ?? '',
      attempt: 1,
    };

    executionSessions.set(data.requestId, session);

    enqueueExecution(async () => {
      try {
        await runSession(data.requestId, session);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        self.postMessage({
          type: 'status',
          requestId: data.requestId,
          status: 'failed',
          attempt: 1,
        } satisfies RuntimeEvent);

        self.postMessage({
          type: 'result',
          requestId: data.requestId,
          success: false,
          output: message,
          error: message,
          exitCode: null,
          waitingForInput: false,
          status: 'failed',
          phase: 'compile',
        } satisfies RuntimeEvent);

        executionSessions.delete(data.requestId);
      }
    });
  }
);
