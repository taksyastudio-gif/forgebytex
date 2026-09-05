import {
  Clang,
  LLD,
  getCompilerInvocation,
  setUpSysroot,
} from 'browsercc';
import {
  ConsoleStdout,
  File,
  OpenFile,
  WASI,
  WASIProcExit,
} from '@bjorn3/browser_wasi_shim';

import type {
  ExecutionPhase,
  ExecutionStatus,
  OutputStream,
  RuntimeEvent,
  RuntimeRequest,
  SupportedLanguage,
} from './execution-protocol';

type CompilerInstance = Awaited<ReturnType<typeof Clang>>;
type LinkerInstance = Awaited<ReturnType<typeof LLD>>;

interface CompilerRunResult {
  success: boolean;
  output: string;
  error?: string;
  warnings?: string;
  exitCode?: number | null;
  waitingForInput?: boolean;
  status: ExecutionStatus;
  phase: ExecutionPhase;
}

interface ExecutionSession {
  code: string;
  language: SupportedLanguage;
  stdin: string;
  attempt: number;
}

const textEncoder = new TextEncoder();
const executionSessions = new Map<string, ExecutionSession>();

let sysrootPromise: Promise<ArrayBuffer> | null = null;
let executionQueue: Promise<void> = Promise.resolve();

class StdinRequiredError extends Error {
  constructor() {
    super('stdin is waiting for more input');
    this.name = 'StdinRequiredError';
  }
}

class InteractiveStdinFile extends File {
  constructor() {
    super(new Uint8Array());
  }

  public append(data: Uint8Array): void {
    const next = new Uint8Array(this.data.length + data.length);

    next.set(this.data, 0);
    next.set(data, this.data.length);
    this.data = next;
  }
}

class InteractiveOpenFile extends OpenFile {
  public fd_read(size: number): { ret: number; data: Uint8Array } {
    const start = Number(this.file_pos);
    const end = Math.min(this.file.data.length, start + size);
    const data = this.file.data.slice(start, end);

    if (data.length === 0) {
      throw new StdinRequiredError();
    }

    this.file_pos += BigInt(data.length);

    return {
      ret: 0,
      data,
    };
  }
}

const postEvent = (event: RuntimeEvent): void => {
  self.postMessage(event);
};

const postStatus = (
  requestId: string,
  status: ExecutionStatus,
  attempt: number,
): void => {
  postEvent({
    type: 'status',
    requestId,
    status,
    attempt,
  });
};

const postStream = (
  requestId: string,
  stream: OutputStream,
  text: string,
  attempt: number,
): void => {
  if (!text) {
    return;
  }

  postEvent({
    type: 'stream',
    requestId,
    stream,
    text,
    attempt,
  });
};

const enqueue = (task: () => Promise<void>): void => {
  executionQueue = executionQueue.then(task, task);
};

const getClang = async (
  onStderr: (text: string) => void,
): Promise<CompilerInstance> =>
  Clang({
    thisProgram: 'clang',
    printErr: onStderr,
    locateFile: (path: string) =>
      path.endsWith('clang.wasm') ? '/clang.wasm' : path,
  }) as Promise<CompilerInstance>;

const getLinker = async (
  onStderr: (text: string) => void,
): Promise<LinkerInstance> =>
  LLD({
    thisProgram: 'wasm-ld',
    printErr: onStderr,
    locateFile: (path: string) =>
      path.endsWith('lld.wasm') ? '/lld.wasm' : path,
  }) as Promise<LinkerInstance>;

const getSysroot = async (): Promise<ArrayBuffer> => {
  if (!sysrootPromise) {
    sysrootPromise = fetch('/sysroot.tar')
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Unable to load compiler sysroot (${response.status}).`,
          );
        }

        return response.arrayBuffer();
      })
      .catch((error: unknown) => {
        sysrootPromise = null;
        throw error;
      });
  }

  return sysrootPromise;
};

const getSourceFilename = (language: SupportedLanguage): string =>
  language === 'cpp' ? 'main.cpp' : 'main.c';

const createCompilerInvocation = async (
  language: SupportedLanguage,
  code: string,
): Promise<Awaited<ReturnType<typeof getCompilerInvocation>>> => {
  const filename = getSourceFilename(language);
  const invocation = await getCompilerInvocation(filename, code, []);

  const cxxFlags = new Set([
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

  invocation.compilerArgs = invocation.compilerArgs.filter(
    (argument) => !cxxFlags.has(argument),
  );

  invocation.compilerArgs.push(
    '-x',
    language === 'cpp' ? 'c++' : 'c',
    language === 'cpp' ? '-std=c++17' : '-std=c17',
  );

  return invocation;
};

const createStdinFile = (stdin: string): OpenFile => {
  const file = new InteractiveStdinFile();
  const normalizedInput =
    stdin && !stdin.endsWith('\n') ? `${stdin}\n` : stdin;

  file.append(textEncoder.encode(normalizedInput));
  return new InteractiveOpenFile(file);
};

const isStdinRequiredError = (error: unknown): boolean => {
  if (error instanceof StdinRequiredError) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes('stdin is waiting for more input');
};

const compileAndRun = async (
  session: ExecutionSession,
  requestId: string,
): Promise<CompilerRunResult> => {
  let compilerStderr = '';
  let linkerStderr = '';

  try {
    const [clang, linker, sysroot] = await Promise.all([
      getClang((text) => {
        compilerStderr += `${text}\n`;
      }),
      getLinker((text) => {
        linkerStderr += `${text}\n`;
      }),
      getSysroot(),
    ]);

    const invocation = await createCompilerInvocation(
      session.language,
      session.code,
    );

    const sourceFilename = getSourceFilename(session.language);

    clang.FS.writeFile(sourceFilename, session.code);
    setUpSysroot(clang, sysroot);

    postStatus(requestId, 'compiling', session.attempt);

    const compileExitCode = clang.callMain(invocation.compilerArgs);

    if (compileExitCode !== 0) {
      const error = compilerStderr.trim() || 'Compilation failed.';

      return {
        success: false,
        output: error,
        error,
        exitCode: compileExitCode,
        status: 'failed',
        phase: 'compile',
      };
    }

    const objectFile = clang.FS.readFile(
      invocation.compilerArtifact,
      { encoding: 'binary' },
    );

    linker.FS.writeFile(invocation.compilerArtifact, objectFile);
    setUpSysroot(linker, sysroot);

    postStatus(requestId, 'compiling', session.attempt);

    const linkExitCode = linker.callMain(invocation.linkerArgs);

    if (linkExitCode !== 0) {
      const error = linkerStderr.trim() || 'Linking failed.';

      return {
        success: false,
        output: error,
        error,
        exitCode: linkExitCode,
        status: 'failed',
        phase: 'link',
      };
    }

    const executable = linker.FS.readFile(
      invocation.linerArtifact,
      { encoding: 'binary' },
    );

    const wasmModule = await WebAssembly.compile(executable);
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const stdoutDecoder = new TextDecoder();
    const stderrDecoder = new TextDecoder();

    const stdout = new ConsoleStdout((buffer) => {
      const text = stdoutDecoder.decode(buffer, { stream: true });

      if (text) {
        stdoutChunks.push(text);
        postStream(
          requestId,
          'stdout',
          text,
          session.attempt,
        );
      }
    });

    const stderr = new ConsoleStdout((buffer) => {
      const text = stderrDecoder.decode(buffer, { stream: true });

      if (text) {
        stderrChunks.push(text);
        postStream(
          requestId,
          'stderr',
          text,
          session.attempt,
        );
      }
    });

    const wasi = new WASI(
      ['main'],
      [],
      [createStdinFile(session.stdin), stdout, stderr],
    );

    const instance = await WebAssembly.instantiate(wasmModule, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });

    postStatus(requestId, 'running', session.attempt);

    let exitCode = 0;

    try {
      wasi.start(
        instance as unknown as {
          exports: {
            memory: WebAssembly.Memory;
            _start: () => unknown;
          };
        },
      );
    } catch (error: unknown) {
      if (isStdinRequiredError(error)) {
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

      if (error instanceof WASIProcExit) {
        exitCode = error.code;
      } else {
        throw error;
      }
    }

    const output = stdoutChunks.join('');
    const runtimeError = stderrChunks.join('').trim();

    if (runtimeError || exitCode !== 0) {
      const error =
        runtimeError || `Program exited with code ${exitCode}.`;

      return {
        success: false,
        output: output || error,
        error,
        exitCode,
        status: 'failed',
        phase: 'run',
      };
    }

    return {
      success: true,
      output,
      warnings: compilerStderr.trim() || undefined,
      exitCode,
      status: 'completed',
      phase: 'run',
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    const finalError =
      compilerStderr.trim() || linkerStderr.trim() || message;

    return {
      success: false,
      output: finalError,
      error: finalError,
      exitCode: null,
      status: 'failed',
      phase: 'compile',
    };
  }
};

const finishSession = (
  requestId: string,
  session: ExecutionSession,
  result: CompilerRunResult,
): void => {
  postEvent({
    type: 'result',
    requestId,
    success: result.success,
    output: result.output,
    error: result.error,
    warnings: result.warnings,
    exitCode: result.exitCode ?? null,
    waitingForInput: result.waitingForInput ?? false,
    status: result.status,
    phase: result.phase,
  });

  if (result.waitingForInput) {
    session.attempt += 1;
  } else {
    executionSessions.delete(requestId);
  }
};

const runSession = async (
  requestId: string,
  session: ExecutionSession,
): Promise<void> => {
  const result = await compileAndRun(session, requestId);
  finishSession(requestId, session, result);
};

const failSession = (
  requestId: string,
  attempt: number,
  error: unknown,
): void => {
  const message = error instanceof Error ? error.message : String(error);

  postStatus(requestId, 'failed', attempt);
  postEvent({
    type: 'result',
    requestId,
    success: false,
    output: message,
    error: message,
    exitCode: null,
    waitingForInput: false,
    status: 'failed',
    phase: 'run',
  });

  executionSessions.delete(requestId);
};

const handleCompile = (
  request: Extract<RuntimeRequest, { type: 'compile' }>,
): void => {
  const session: ExecutionSession = {
    code: request.code,
    language: request.language === 'cpp' ? 'cpp' : 'c',
    stdin: request.stdin ?? '',
    attempt: 1,
  };

  executionSessions.set(request.requestId, session);

  enqueue(async () => {
    try {
      await runSession(request.requestId, session);
    } catch (error: unknown) {
      failSession(request.requestId, session.attempt, error);
    }
  });
};

const handleStdin = (
  request: Extract<RuntimeRequest, { type: 'stdin' }>,
): void => {
  const session = executionSessions.get(request.requestId);

  if (!session) {
    return;
  }

  session.stdin += `${request.input}\n`;

  enqueue(async () => {
    try {
      await runSession(request.requestId, session);
    } catch (error: unknown) {
      failSession(request.requestId, session.attempt, error);
    }
  });
};

self.addEventListener(
  'message',
  (event: MessageEvent<RuntimeRequest>) => {
    const request = event.data;

    if (!request) {
      return;
    }

    if (request.type === 'stdin') {
      handleStdin(request);
      return;
    }

    if (request.type === 'compile') {
      handleCompile(request);
    }
  },
);