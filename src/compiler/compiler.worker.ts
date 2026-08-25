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

type CompileRequest = {
  type: 'compile';
  requestId: string;
  code: string;
  stdin?: string;
};

type InputRequest = {
  type: 'stdin';
  requestId: string;
  input: string;
};

type CompileResult = {
  success: boolean;
  output: string;
  error?: string;
  warnings?: string;
  waitingForInput?: boolean;
  status?: 'running' | 'waiting-input' | 'completed' | 'failed' | 'stopped' | 'timeout';
};

type WorkerResponse = {
  type: 'result';
  requestId: string;
  success: boolean;
  output: string;
  error?: string;
  warnings?: string;
  waitingForInput?: boolean;
  status?: 'running' | 'waiting-input' | 'completed' | 'failed' | 'stopped' | 'timeout';
};

type StreamEvent = {
  type: 'stream';
  requestId: string;
  stream: 'stdout' | 'stderr';
  text: string;
};

type StatusEvent = {
  type: 'status';
  requestId: string;
  status: 'running' | 'waiting-input' | 'completed' | 'failed' | 'stopped' | 'timeout';
};

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
   * BytePlay currently treats this compiler as a C compiler,
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
  requestId = 'unknown'
): Promise<CompileResult> {
  let compilerStderr = '';
  let linkerStderr = '';

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
        status: 'failed',
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
        status: 'failed',
      };
    }

    const executable = lld.FS.readFile(invocation.linerArtifact, {
      encoding: 'binary',
    });

    const wasmModule = await WebAssembly.compile(executable);

    const normalizedStdin = stdinText.length > 0 && !stdinText.endsWith('\n')
      ? `${stdinText}\n`
      : stdinText;

    const stdinFile = new InteractiveStdinFile();
    stdinFile.append(textEncoder.encode(normalizedStdin));

    const stdoutChunks: string[] = [];
    const stdoutDecoder = new TextDecoder('utf-8', { fatal: false });
    const stdout = new ConsoleStdout((buffer) => {
      const text = stdoutDecoder.decode(buffer, { stream: true });
      if (text.length > 0) {
        stdoutChunks.push(text);
        self.postMessage({
          type: 'stream',
          requestId,
          stream: 'stdout',
          text,
        } satisfies StreamEvent);
      }
    });

    const stderrChunks: string[] = [];
    const stderrDecoder = new TextDecoder('utf-8', { fatal: false });
    const stderr = new ConsoleStdout((buffer) => {
      const text = stderrDecoder.decode(buffer, { stream: true });
      if (text.length > 0) {
        stderrChunks.push(text);
        self.postMessage({
          type: 'stream',
          requestId,
          stream: 'stderr',
          text,
        } satisfies StreamEvent);
      }
    });

    const wasi = new WASI(['main'], [], [
      new InteractiveOpenFile(stdinFile),
      stdout,
      stderr,
    ]);

    const instance = await WebAssembly.instantiate(wasmModule, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });

    try {
      self.postMessage({
        type: 'status',
        requestId,
        status: 'running',
      } satisfies StatusEvent);

      wasi.start(instance as unknown as {
        exports: {
          memory: WebAssembly.Memory;
          _start: () => unknown;
        };
      });
    } catch (error) {
      if (error instanceof StdinRequiredError) {
        self.postMessage({
          type: 'status',
          requestId,
          status: 'waiting-input',
        } satisfies StatusEvent);

        const promptOutput = stdoutChunks.join('');
        return {
          success: false,
          output: promptOutput,
          error: '',
          waitingForInput: true,
          status: 'waiting-input',
        };
      }

      if (!(error instanceof WASIProcExit)) {
        const remainingStdout = stdoutDecoder.decode();
        const remainingStderr = stderrDecoder.decode();

        if (remainingStdout) {
          stdoutChunks.push(remainingStdout);
        }

        if (remainingStderr) {
          stderrChunks.push(remainingStderr);
        }

        const runtimeOutput = stdoutChunks.join('');
        const runtimeError = stderrChunks.join('').trim();
        const message = error instanceof Error ? error.message : String(error);

        return {
          success: false,
          output: runtimeError || runtimeOutput || message,
          error: runtimeError || message,
          status: 'failed',
        };
      }

      if (error.code !== 0) {
        const remainingStdout = stdoutDecoder.decode();
        const remainingStderr = stderrDecoder.decode();

        if (remainingStdout) {
          stdoutChunks.push(remainingStdout);
        }

        if (remainingStderr) {
          stderrChunks.push(remainingStderr);
        }

        const runtimeError = stderrChunks.join('').trim();
        const output = stdoutChunks.join('');

        return {
          success: false,
          output: runtimeError || output || `Program exited with code ${error.code}.`,
          error: runtimeError || `Program exited with code ${error.code}.`,
          status: 'failed',
        };
      }
    }

    const remainingStdout = stdoutDecoder.decode();
    const remainingStderr = stderrDecoder.decode();

    if (remainingStdout) {
      stdoutChunks.push(remainingStdout);
    }

    if (remainingStderr) {
      stderrChunks.push(remainingStderr);
    }

    const output = stdoutChunks.join('');
    const runtimeError = stderrChunks.join('').trim();

    if (runtimeError) {
      return {
        success: false,
        output: output || runtimeError,
        error: runtimeError,
        status: 'failed',
      };
    }

    const compilerWarnings = compilerStderr.trim();

    return {
      success: true,
      output,
      warnings: compilerWarnings || undefined,
      status: 'completed',
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
      status: 'failed',
    };
  }
}

/* ============================================================
   WORKER MESSAGE HANDLER
============================================================ */

const executionSessions = new Map<string, { code: string; stdin: string }>();

const runSession = async (
  requestId: string,
  code: string,
  stdinText: string
): Promise<void> => {
  const result = await compileAndRun(code, stdinText, requestId);

  if (result.waitingForInput) {
    self.postMessage({
      type: 'status',
      requestId,
      status: 'waiting-input',
    } satisfies StatusEvent);
    return;
  }

  const response: WorkerResponse = {
    type: 'result',
    requestId,
    success: result.success,
    output: result.output,
    error: result.error,
    warnings: result.warnings,
    waitingForInput: result.waitingForInput,
    status: result.status,
  };

  self.postMessage({
    type: 'status',
    requestId,
    status: result.status ?? (result.success ? 'completed' : 'failed'),
  } satisfies StatusEvent);

  self.postMessage(response);

  if (!result.waitingForInput) {
    executionSessions.delete(requestId);
  }
};

self.addEventListener(
  'message',
  async (
    event: MessageEvent<CompileRequest | InputRequest>
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
      await runSession(data.requestId, session.code, session.stdin);
      return;
    }

    if (data.type !== 'compile') {
      return;
    }

    try {
      executionSessions.set(data.requestId, {
        code: data.code,
        stdin: data.stdin ?? '',
      });

      await runSession(data.requestId, data.code, data.stdin ?? '');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      const response: WorkerResponse = {
        type: 'result',
        requestId: data.requestId,
        success: false,
        output: message,
        error: message,
        warnings: undefined,
        status: 'failed',
      };

      self.postMessage({
        type: 'status',
        requestId: data.requestId,
        status: 'failed',
      } satisfies StatusEvent);

      self.postMessage(response);
      executionSessions.delete(data.requestId);
    }
  }
);