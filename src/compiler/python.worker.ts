import type {
  ExecutionPhase,
  ExecutionStatus,
  OutputStream,
  RuntimeEvent,
  RuntimeRequest,
} from './execution-protocol';

// Load Pyodide from the CDN. This worker is an ES module worker, so
// importScripts is unavailable and we import the ESM entry via a dynamic
// import. Vite leaves absolute cross-origin URLs as native imports (no
// dev-server rewrite), and the relative assets inside pyodide.mjs resolve
// against the same CDN path via indexURL.
const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/';

type LoadPyodideFn = typeof import('pyodide').loadPyodide;

let loadPyodideFunc: LoadPyodideFn | null = null;

const getLoadPyodide = async (): Promise<LoadPyodideFn> => {
  if (loadPyodideFunc) return loadPyodideFunc;

  const pyodideUrl = `${PYODIDE_BASE}pyodide.mjs`;
  const pyodideModule = (await import(
    /* @vite-ignore */ pyodideUrl
  )) as { loadPyodide: LoadPyodideFn };

  loadPyodideFunc = pyodideModule.loadPyodide;
  return loadPyodideFunc;
};

type Session = {
  code: string;
  stdin: string;
  attempt: number;
  pyodide: Awaited<ReturnType<LoadPyodideFn>> | null;
};

const executionSessions = new Map<string, Session>();

let executionChain: Promise<void> = Promise.resolve();

const enqueueExecution = (task: () => Promise<void>): void => {
  executionChain = executionChain.then(task, task);
};

async function runPython(
  code: string,
  stdinText: string,
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
    // Initialize Pyodide on first run per session
    if (!session.pyodide) {
      post({
        type: 'status',
        requestId,
        status: 'preparing',
        attempt,
      });

      try {
        const loadFn = await getLoadPyodide();
        session.pyodide = await loadFn({
          indexURL: PYODIDE_BASE,
        });
      } catch (loadError) {
        const errorMsg = loadError instanceof Error ? loadError.message : String(loadError);
        emit('stderr', `Failed to load Pyodide: ${errorMsg}\n`);
        throw loadError;
      }

      // Redirect stdout/stderr to capture output
      try {
        session.pyodide.setStdout({
          batched: (s: string) => {
            emit('stdout', s);
          },
        });

        session.pyodide.setStderr({
          batched: (s: string) => {
            emit('stderr', s);
          },
        });
      } catch (streamError) {
        const errorMsg = streamError instanceof Error ? streamError.message : String(streamError);
        emit('stderr', `Failed to set streams: ${errorMsg}\n`);
        throw streamError;
      }
    }

    post({
      type: 'status',
      requestId,
      status: 'running',
      attempt,
    });

    // Set up stdin if provided
    if (stdinText) {
      session.pyodide.setStdin({
        stdin: () => stdinText,
      });
    }

    // Run the Python code
    let output = '';

    try {
      const result = await session.pyodide.runPythonAsync(code);
      
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
    session.stdin,
    requestId,
    attempt,
    session
  );

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
      pyodide: null,
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
