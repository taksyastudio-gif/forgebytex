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

type CompileResult = {
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

type CompilerInstance = Awaited<ReturnType<typeof Clang>>;
type LinkerInstance = Awaited<ReturnType<typeof LLD>>;

const textEncoder = new TextEncoder();

/* ============================================================
   TOOLCHAIN CACHE
============================================================ */

let clangPromise: Promise<CompilerInstance> | null = null;
let lldPromise: Promise<LinkerInstance> | null = null;
let sysrootPromise: Promise<ArrayBuffer> | null = null;

/* ============================================================
   LOAD CLANG
============================================================ */

const getClang = async (): Promise<CompilerInstance> => {
  if (!clangPromise) {
    clangPromise = (Clang({
      thisProgram: 'clang',

      locateFile: (path: string) => {
        if (path.endsWith('clang.wasm')) {
          return '/clang.wasm';
        }

        return path;
      },
    }) as Promise<CompilerInstance>).catch((error: unknown) => {
      clangPromise = null;
      throw error;
    });
  }

  return clangPromise;
};

/* ============================================================
   LOAD LLD
============================================================ */

const getLld = async (): Promise<LinkerInstance> => {
  if (!lldPromise) {
    lldPromise = (LLD({
      thisProgram: 'wasm-ld',

      locateFile: (path: string) => {
        if (path.endsWith('lld.wasm')) {
          return '/lld.wasm';
        }

        return path;
      },
    }) as Promise<LinkerInstance>).catch((error: unknown) => {
      lldPromise = null;
      throw error;
    });
  }

  return lldPromise;
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
    /* ========================================================
       1. LOAD TOOLCHAIN
    ========================================================= */

    const [clang, lld, sysroot] =
      await Promise.all([
        getClang(),
        getLld(),
        getSysroot(),
      ]);

    /* ========================================================
       2. CREATE INVOCATION
    ========================================================= */

    const invocation =
      await createInvocation(code);

    /* ========================================================
       3. WRITE SOURCE
    ========================================================= */

    // Debug: log the source being compiled (escaped) to help diagnose
    // issues where string escapes are lost or transformed.
    try {
      // Use console.error so messages appear in dev console logs
      console.error(`COMPILER_SOURCE: requestId=${requestId} => ${JSON.stringify(code)}`);
    } catch (e) {
      // ignore
    }

    clang.FS.writeFile(
      'main.c',
      code
    );

    /* ========================================================
       4. PREPARE CLANG SYSROOT
    ========================================================= */

    setUpSysroot(
      clang,
      sysroot
    );

    /* ========================================================
       5. COMPILE C → OBJECT
    ========================================================= */

    clang.printErr = (text: string) => {
      compilerStderr += text + '\n';
    };

    const clangExitCode =
      clang.callMain(
        invocation.compilerArgs
      );

    if (clangExitCode !== 0) {
      return {
        success: false,
        output:
          compilerStderr.trim() ||
          'Compilation failed.',
        error:
          compilerStderr.trim() ||
          'Compilation failed.',
      };
    }

    /* ========================================================
       6. READ OBJECT
    ========================================================= */

    const objectFile =
      clang.FS.readFile(
        invocation.compilerArtifact,
        {
          encoding: 'binary',
        }
      );

    /* ========================================================
       7. WRITE OBJECT TO LLD
    ========================================================= */

    lld.FS.writeFile(
      invocation.compilerArtifact,
      objectFile
    );

    /* ========================================================
       8. PREPARE LLD SYSROOT
    ========================================================= */

    setUpSysroot(
      lld,
      sysroot
    );

    /* ========================================================
       9. LINK OBJECT → WASM
    ========================================================= */

    lld.printErr = (text: string) => {
      linkerStderr += text + '\n';
    };

    const lldExitCode =
      lld.callMain(
        invocation.linkerArgs
      );

    if (lldExitCode !== 0) {
      return {
        success: false,
        output:
          linkerStderr.trim() ||
          'Linking failed.',
        error:
          linkerStderr.trim() ||
          'Linking failed.',
      };
    }

    /* ========================================================
       10. READ FINAL WASM
    ========================================================= */

    const executable =
      lld.FS.readFile(
        invocation.linerArtifact,
        {
          encoding: 'binary',
        }
      );

    /* ========================================================
       11. COMPILE WASM MODULE
    ========================================================= */

    try {
      console.error(`WASM_EXECUTABLE: requestId=${requestId} size=${executable.length}`);
      // show first few bytes for debugging
      console.error(`WASM_HEAD: ${Array.from(executable.slice(0, 16)).join(',')}`);
    } catch (e) {
      // ignore
    }

    const wasmModule =
      await WebAssembly.compile(
        executable
      );

    /* ========================================================
       12. PREPARE STDIN
    ========================================================= */

    let normalizedStdin =
      stdinText;

    if (
      normalizedStdin.length > 0 &&
      !normalizedStdin.endsWith('\n')
    ) {
      normalizedStdin += '\n';
    }

    const stdinFile =
      new File(
        textEncoder.encode(
          normalizedStdin
        )
      );

    /* ========================================================
       13. PREPARE STDOUT
    ========================================================= */

    const stdoutChunks: string[] = [];

    const stdoutDecoder =
      new TextDecoder('utf-8', {
        fatal: false,
      });

    const stdout =
      new ConsoleStdout(
        (buffer) => {
          const text =
            stdoutDecoder.decode(
              buffer,
              {
                stream: true,
              }
            );

          if (text.length > 0) {
            stdoutChunks.push(text);
          }
        }
      );

    /* ========================================================
       14. PREPARE STDERR
    ========================================================= */

    const stderrChunks: string[] = [];

    const stderrDecoder =
      new TextDecoder('utf-8', {
        fatal: false,
      });

    const stderr =
      new ConsoleStdout(
        (buffer) => {
          const text =
            stderrDecoder.decode(
              buffer,
              {
                stream: true,
              }
            );

          if (text.length > 0) {
            stderrChunks.push(text);
          }
        }
      );

    /* ========================================================
       15. CREATE WASI
    ========================================================= */

    const wasi =
      new WASI(
        ['main'],
        [],
        [
          new OpenFile(stdinFile),
          stdout,
          stderr,
        ]
      );

    /* ========================================================
       16. INSTANTIATE WASM
    ========================================================= */

    let instance;
    try {
      instance = await WebAssembly.instantiate(wasmModule, {
        wasi_snapshot_preview1: wasi.wasiImport,
      });

      try {
        console.error(`WASM_EXPORTS: requestId=${requestId} -> ${Object.keys((instance as any).exports).join(',')}`);
      } catch (e) {}
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`WASM_INSTANTIATE_ERROR: requestId=${requestId} -> ${msg}`);
      throw err;
    };


    /* ========================================================
       17. RUN PROGRAM
    ========================================================= */

    try {
      wasi.start(
        instance as unknown as {
          exports: {
            memory: WebAssembly.Memory;
            _start: () => unknown;
          };
        }
      );
    } catch (error) {
      /*
       * WASIProcExit is expected when a program calls
       * exit() or returns from main().
       */
      if (!(error instanceof WASIProcExit)) {
        const remainingStdout =
          stdoutDecoder.decode();

        const remainingStderr =
          stderrDecoder.decode();

        if (remainingStdout) {
          stdoutChunks.push(
            remainingStdout
          );
        }

        if (remainingStderr) {
          stderrChunks.push(
            remainingStderr
          );
        }

        const runtimeOutput =
          stdoutChunks.join('');

        const runtimeError =
          stderrChunks.join('').trim();

        const message =
          error instanceof Error
            ? error.message
            : String(error);

        return {
          success: false,

          output:
            runtimeError ||
            runtimeOutput ||
            message,

          error:
            runtimeError ||
            message,
        };
      }

      /*
       * A non-zero WASI exit code is a real program failure.
       */
      if (error.code !== 0) {
        const remainingStdout =
          stdoutDecoder.decode();

        const remainingStderr =
          stderrDecoder.decode();

        if (remainingStdout) {
          stdoutChunks.push(
            remainingStdout
          );
        }

        if (remainingStderr) {
          stderrChunks.push(
            remainingStderr
          );
        }

        const runtimeError =
          stderrChunks.join('').trim();

        const output =
          stdoutChunks.join('');

        return {
          success: false,

          output:
            runtimeError ||
            output ||
            `Program exited with code ${error.code}.`,

          error:
            runtimeError ||
            `Program exited with code ${error.code}.`,
        };
      }
    }

    /* ========================================================
       18. FLUSH UTF-8 DECODERS
    ========================================================= */

    const remainingStdout =
      stdoutDecoder.decode();

    const remainingStderr =
      stderrDecoder.decode();

    if (remainingStdout) {
      stdoutChunks.push(
        remainingStdout
      );
    }

    if (remainingStderr) {
      stderrChunks.push(
        remainingStderr
      );
    }

    /* ========================================================
       19. COLLECT OUTPUT
    ========================================================= */

    const output =
      stdoutChunks.join('');

    const runtimeError =
      stderrChunks.join('').trim();

    /*
     * Runtime stderr means the program reported an error,
     * even if WASI returned normally.
     */
    if (runtimeError) {
      return {
        success: false,
        output:
          output || runtimeError,
        error: runtimeError,
      };
    }

    return {
      success: true,
      output,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    const compilerError =
      compilerStderr.trim();

    const linkerError =
      linkerStderr.trim();

    const errorMessage =
      compilerError ||
      linkerError ||
      message;

    return {
      success: false,

      output:
        errorMessage,

      error:
        errorMessage,
    };
  }
}

/* ============================================================
   WORKER MESSAGE HANDLER
============================================================ */

self.addEventListener(
  'message',
  async (
    event: MessageEvent<CompileRequest>
  ) => {
    if (
      event.data?.type !== 'compile'
    ) {
      return;
    }

    try {
      const result =
        await compileAndRun(
          event.data.code,
          event.data.stdin ?? ''
        );

      const response: WorkerResponse = {
        type: 'result',
        requestId: event.data.requestId,
        success: result.success,
        output: result.output,
        error: result.error,
      };

      self.postMessage(response);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      const response: WorkerResponse = {
        type: 'result',
        requestId: event.data.requestId,
        success: false,
        output: message,
        error: message,
      };

      self.postMessage(response);
    }
  }
);