import {
  Clang,
  LLD,
  getCompilerInvocation,
  setUpSysroot,
} from 'browsercc';

import {
  WASI,
  File,
  OpenFile,
  ConsoleStdout,
  WASIProcExit,
} from '@bjorn3/browser_wasi_shim';

import type {
  ExecutionPhase,
  ExecutionStatus,
  OutputStream,
  RuntimeEvent,
  RuntimeRequest,
} from './execution-protocol';

// browsercc and the WASI shim keep the C toolchain in the browser: Clang and
// LLD run as WebAssembly, while this worker owns the session state and stdin
// buffer for the current request.
class StdinRequiredError extends Error {
  constructor(message = 'stdin is waiting for more input') {
    super(message);
    this.name = 'StdinRequiredError';
  }
}

class InteractiveStdinFile extends File {
  constructor() {
    super(new Uint8Array());
  }

  append(data: Uint8Array): void {
    const next = new Uint8Array(this.data.length + data.length);
    next.set(this.data, 0);
    next.set(data, this.data.length);
    this.data = next;
  }
}

class InteractiveOpenFile extends OpenFile {
  fd_read(size: number): { ret: number; data: Uint8Array } {
    const slice = this.file.data.slice(
      Number(this.file_pos),
      Number(this.file_pos + BigInt(size))
    );

    if (slice.length === 0) {
      throw new StdinRequiredError();
    }

    this.file_pos += BigInt(slice.length);
    return { ret: 0, data: slice };
  }
}

class SharedStdinOpenFile extends OpenFile {
  private readonly control: Int32Array;
  private readonly data: Uint8Array;

  constructor(sharedBuffer: SharedArrayBuffer) {
    super(new File(new Uint8Array()));
    this.control = new Int32Array(sharedBuffer, 0, 4);
    this.data = new Uint8Array(sharedBuffer, 16);
  }

  fd_read(size: number): { ret: number; data: Uint8Array } {
    while (true) {
      const writeIndex = Atomics.load(this.control, 0);
      const readIndex = Atomics.load(this.control, 1);

      if (readIndex < writeIndex) {
        const endIndex = Math.min(writeIndex, readIndex + size);
        const slice = this.data.slice(readIndex, endIndex);
        Atomics.store(this.control, 1, readIndex + slice.length);
        return { ret: 0, data: slice };
      }

      if (Atomics.load(this.control, 2) === 1) {
        return { ret: 0, data: new Uint8Array(0) };
      }

      const version = Atomics.load(this.control, 3);
      Atomics.wait(this.control, 3, version);
    }
  }
}

type CompilerInstance = Awaited<ReturnType<typeof Clang>>;
type LinkerInstance = Awaited<ReturnType<typeof LLD>>;

const textEncoder = new TextEncoder();

/* ============================================================
   TOOLCHAIN CACHE
============================================================ */

let sysrootPromise: Promise<ArrayBuffer> | null = null;

/* ============================================================
   LOAD CLANG
============================================================ */

const getClang = async (
  onStderr?: (text: string) => void
): Promise<CompilerInstance> => {
  return (Clang({
   thisProgram: 'clang',
   printErr: (text: string) => {
     if (onStderr) {
       onStderr(text);
     }
   },
   locateFile: (path: string) => {
     if (path.endsWith('clang.wasm')) {
       return '/clang.wasm';
     }

     return path;
   },
  }) as Promise<CompilerInstance>);
};

/* ============================================================
   LOAD LLD
============================================================ */

const getLld = async (
  onStderr?: (text: string) => void
): Promise<LinkerInstance> => {
  return (LLD({
   thisProgram: 'wasm-ld',
   printErr: (text: string) => {
     if (onStderr) {
       onStderr(text);
     }
   },
   locateFile: (path: string) => {
     if (path.endsWith('lld.wasm')) {
       return '/lld.wasm';
     }

     return path;
   },
  }) as Promise<LinkerInstance>);
};

/* ============================================================
   LOAD SYSROOT
============================================================ */

const getSysroot = async (): Promise<ArrayBuffer> => {
  if (!sysrootPromise) {
    sysrootPromise = fetch('/sysroot.tar')
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Unable to load compiler sysroot (${response.status})`
          );
        }

        return response.arrayBuffer();
      })
      .catch((error) => {
        sysrootPromise = null;
        throw error;
      });
  }

  return sysrootPromise;
};

/* ============================================================
   CREATE COMPILER INVOCATION
============================================================ */

const createInvocation = async (
  code: string
) => {
  const invocation = await getCompilerInvocation(
    'main.c',
    code,
    []
  );

  /*
   * browsercc may provide C++ defaults depending on the
   * invocation configuration.
   *
   * forgebyteX currently treats this compiler as a C compiler,
   * so remove C++ standard flags before forcing C17.
   */
  const cxxStandardFlags = new Set([
    '-std=c++98',
    '-std=c++03',
    '-std=c++11',
    '-std=c++14',
    '-std=c++17',
    '-std=c++20',
    '-std=c++23',

    '-std=gnu++98',
    '-std=gnu++03',
    '-std=gnu++11',
    '-std=gnu++14',
    '-std=gnu++17',
    '-std=gnu++20',
    '-std=gnu++23',
  ]);

  invocation.compilerArgs =
    invocation.compilerArgs.filter(
      (argument) =>
        !cxxStandardFlags.has(argument)
    );

  invocation.compilerArgs.push(
    '-x',
    'c',
    '-std=c17'
  );

  return invocation;
};

/* ============================================================
   COMPILE + RUN
============================================================ */

async function compileAndRun(
  code: string,
  stdinText: string,
  stdinBuffer: SharedArrayBuffer | null,
  requestId: string,
  attempt: number
): Promise<{
  success: boolean;
  output: string;
  error?: string;
  warnings?: string;
  exitCode?: number | null;
  waitingForInput?: boolean;
  status: ExecutionStatus;
  phase: ExecutionPhase;
}> {
  let compilerStderr = '';
  let linkerStderr = '';

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
    const [clang, lld, sysroot] = await Promise.all([
      getClang((text: string) => {
        compilerStderr += text + '\n';
      }),
      getLld((text: string) => {
        linkerStderr += text + '\n';
      }),
      getSysroot(),
    ]);

    const invocation = await createInvocation(code);

    clang.FS.writeFile('main.c', code);
    setUpSysroot(clang, sysroot);

    const clangExitCode = clang.callMain(invocation.compilerArgs);
    if (clangExitCode !== 0) {
      return {
        success: false,
        output: compilerStderr.trim() || 'Compilation failed.',
        error: compilerStderr.trim() || 'Compilation failed.',
        exitCode: clangExitCode,
        status: 'failed',
        phase: 'compile',
      };
    }

    const objectFile = clang.FS.readFile(invocation.compilerArtifact, {
      encoding: 'binary',
    });

    lld.FS.writeFile(invocation.compilerArtifact, objectFile);
    setUpSysroot(lld, sysroot);

    const lldExitCode = lld.callMain(invocation.linkerArgs);
    if (lldExitCode !== 0) {
      return {
        success: false,
        output: linkerStderr.trim() || 'Linking failed.',
        error: linkerStderr.trim() || 'Linking failed.',
        exitCode: lldExitCode,
        status: 'failed',
        phase: 'link',
      };
    }

    const executable = lld.FS.readFile(invocation.linerArtifact, {
      encoding: 'binary',
    });

    const wasmModule = await WebAssembly.compile(executable);

    let stdinFd: OpenFile;

    if (stdinBuffer) {
      stdinFd = new SharedStdinOpenFile(stdinBuffer);
    } else {
      const stdinFile = new InteractiveStdinFile();
      const normalizedStdin = stdinText.length > 0 && !stdinText.endsWith('\n')
        ? `${stdinText}\n`
        : stdinText;

      stdinFile.append(textEncoder.encode(normalizedStdin));
      stdinFd = new InteractiveOpenFile(stdinFile);
    }

    const stdoutChunks: string[] = [];
    const stdoutDecoder = new TextDecoder('utf-8', { fatal: false });
    const stdout = new ConsoleStdout((buffer) => {
      const text = stdoutDecoder.decode(buffer, { stream: true });
      if (text.length > 0) {
        stdoutChunks.push(text);
        emit('stdout', text);
      }
    });

    const stderrChunks: string[] = [];
    const stderrDecoder = new TextDecoder('utf-8', { fatal: false });
    const stderr = new ConsoleStdout((buffer) => {
      const text = stderrDecoder.decode(buffer, { stream: true });
      if (text.length > 0) {
        stderrChunks.push(text);
        emit('stderr', text);
      }
    });

    const wasi = new WASI(['main'], [], [
      stdinFd,
      stdout,
      stderr,
    ]);

    const instance = await WebAssembly.instantiate(wasmModule, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });

    let exitCode = 0;

    try {
      post({
        type: 'status',
        requestId,
        status: 'running',
        attempt,
      });

      wasi.start(instance as unknown as {
        exports: {
          memory: WebAssembly.Memory;
          _start: () => unknown;
        };
      });
    } catch (error) {
      if (error instanceof StdinRequiredError) {
        /*
         * browsercc/WASI cannot suspend and resume the same C stack frame at
         * scanf(). Report waitingForInput so the client replays the program
         * from scratch with the accumulated stdin buffer instead.
         */
        return {
          success: false,
          output: stdoutChunks.join(''),
          error: '',
          exitCode: null,
          waitingForInput: true,
          status: 'waiting-input',
          phase: 'run',
        };
      }

      if (!(error instanceof WASIProcExit)) {
        const remainingStdout = stdoutDecoder.decode();
        const remainingStderr = stderrDecoder.decode();

        if (remainingStdout) {
          stdoutChunks.push(remainingStdout);
          emit('stdout', remainingStdout);
        }

        if (remainingStderr) {
          stderrChunks.push(remainingStderr);
          emit('stderr', remainingStderr);
        }

        const runtimeOutput = stdoutChunks.join('');
        const runtimeError = stderrChunks.join('').trim();
        const message = error instanceof Error ? error.message : String(error);

        return {
          success: false,
          output: runtimeError || runtimeOutput || message,
          error: runtimeError || message,
          exitCode: null,
          status: 'failed',
          phase: 'run',
        };
      }

      if (error.code !== 0) {
        const remainingStdout = stdoutDecoder.decode();
        const remainingStderr = stderrDecoder.decode();

        if (remainingStdout) {
          stdoutChunks.push(remainingStdout);
          emit('stdout', remainingStdout);
        }

        if (remainingStderr) {
          stderrChunks.push(remainingStderr);
          emit('stderr', remainingStderr);
        }

        const runtimeError = stderrChunks.join('').trim();
        const output = stdoutChunks.join('');

        return {
          success: false,
          output: runtimeError || output || `Program exited with code ${error.code}.`,
          error: runtimeError || `Program exited with code ${error.code}.`,
          exitCode: error.code,
          status: 'failed',
          phase: 'run',
        };
      }

      exitCode = error.code;
    }

    const remainingStdout = stdoutDecoder.decode();
    const remainingStderr = stderrDecoder.decode();

    if (remainingStdout) {
      stdoutChunks.push(remainingStdout);
      emit('stdout', remainingStdout);
    }

    if (remainingStderr) {
      stderrChunks.push(remainingStderr);
      emit('stderr', remainingStderr);
    }

    const output = stdoutChunks.join('');
    const runtimeError = stderrChunks.join('').trim();

    if (runtimeError) {
      return {
        success: false,
        output: output || runtimeError,
        error: runtimeError,
        exitCode,
        status: 'failed',
        phase: 'run',
      };
    }

    const compilerWarnings = compilerStderr.trim();

    return {
      success: true,
      output,
      warnings: compilerWarnings || undefined,
      exitCode,
      status: 'completed',
      phase: 'run',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const compilerError = compilerStderr.trim();
    const linkerError = linkerStderr.trim();
    const errorMessage = compilerError || linkerError || message;

    return {
      success: false,
      output: errorMessage,
      error: errorMessage,
      exitCode: null,
      status: 'failed',
      phase: 'compile',
    };
  }
}

/* ============================================================
   WORKER MESSAGE HANDLER
   ============================================================ */

type Session = {
  code: string;
  stdin: string;
  stdinBuffer: SharedArrayBuffer | null;
  attempt: number;
};

const executionSessions = new Map<string, Session>();

/*
 * All executions for this worker are funneled through a serial queue.
 * A resumed (interactive stdin) run must never interleave with another
 * pending resume for the same or a different session: WASM execution
 * is synchronous once started, but the async setup steps would
 * otherwise allow two runSessions to overlap at await points.
 */
let executionChain: Promise<void> = Promise.resolve();

const enqueueExecution = (task: () => Promise<void>): void => {
  executionChain = executionChain.then(task, task);
};

const finishRun = (
  requestId: string,
  attempt: number,
  result: Awaited<ReturnType<typeof compileAndRun>>
): void => {
  if (result.waitingForInput) {
    /*
     * Single message tells the client everything: stay alive, pause
     * the watchdog, surface 'waiting-input'.
     */
    self.postMessage({
      type: 'result',
      requestId,
      success: false,
      output: result.output,
      error: result.error,
      warnings: result.warnings,
      exitCode: result.exitCode ?? null,
      waitingForInput: true,
      status: 'waiting-input',
      phase: result.phase,
    } satisfies RuntimeEvent);
    return;
  }

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
    warnings: result.warnings,
    exitCode: result.exitCode ?? null,
    waitingForInput: false,
    status: result.status,
    phase: result.phase,
  } satisfies RuntimeEvent);

  executionSessions.delete(requestId);
};

const runSession = async (
  requestId: string,
  session: Session
): Promise<void> => {
  const attempt = session.attempt;

  if (attempt === 1) {
    self.postMessage({
      type: 'status',
      requestId,
      status: 'compiling',
      attempt,
    } satisfies RuntimeEvent);
  }

  const result = await compileAndRun(
    session.code,
    session.stdin,
    session.stdinBuffer,
    requestId,
    attempt
  );

  if (result.waitingForInput) {
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
        // Unknown/expired session: stale message, drop it.
        return;
      }

      if (session.stdinBuffer) {
        // Shared-memory stdin is written directly from the client, so
        // worker-side stdin messages are only used by the legacy fallback.
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
      stdinBuffer: data.stdinBuffer ?? null,
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
