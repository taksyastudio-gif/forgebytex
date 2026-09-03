import express from 'express';
import cors from 'cors';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

function sanitizeEnvironment(toolchainDirectory) {
  const env = { ...process.env };

  const currentPath = env.PATH || '';
  if (toolchainDirectory && !currentPath.split(path.delimiter).includes(toolchainDirectory)) {
    env.PATH = [toolchainDirectory, currentPath].filter(Boolean).join(path.delimiter);
  } else {
    env.PATH = currentPath;
  }

  return env;
}

function getBinaryName() {
  return process.platform === 'win32' ? 'main.exe' : 'main';
}

function terminateProcessTree(child) {
  if (!child || !child.pid) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      if (child.kill()) {
        return;
      }

      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    }

    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // Ignore cleanup failures; the process may already be gone.
  }
}

async function removeDirectory(directoryPath) {
  if (!directoryPath) {
    return;
  }

  try {
    await fs.promises.rm(directoryPath, {
      recursive: true,
      force: true,
    });
  } catch {
    // Ignore cleanup errors to avoid crashing the server.
  }
}

async function buildNativeBinary(source, { staticLink = false } = {}) {
  const gccCheck = detectGcc();
  if (!gccCheck.available) {
    return {
      success: false,
      output: '',
      error: gccCheck.message,
      exitCode: 127,
      runtime: gccCheck,
    };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgebyte-'));
  const sourcePath = path.join(tempDir, 'main.c');
  const binaryPath = path.join(tempDir, getBinaryName());

  try {
    fs.writeFileSync(sourcePath, source, 'utf8');
  } catch (error) {
    await removeDirectory(tempDir);
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      exitCode: 1,
      runtime: gccCheck,
    };
  }

  const compileTimeoutMs = 15000;
  const compilerCommand = gccCheck.path && gccCheck.path.trim() ? gccCheck.path : 'gcc';
  const compiler = spawn(
    compilerCommand,
    [
      '-std=c17',
      '-O2',
      ...(staticLink ? ['-static'] : []),
      '-o',
      binaryPath,
      sourcePath,
    ],
    {
      cwd: tempDir,
      env: sanitizeEnvironment(path.dirname(compilerCommand)),
      timeout: compileTimeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    }
  );

  let compileStdout = '';
  let compileStderr = '';

  compiler.stdout.on('data', (chunk) => {
    compileStdout += chunk.toString();
  });

  compiler.stderr.on('data', (chunk) => {
    compileStderr += chunk.toString();
  });

  const result = await new Promise((resolve) => {
    compiler.on('error', (error) => {
      resolve({
        success: false,
        output: compileStdout,
        error: compileStderr || error.message,
        exitCode: 1,
        runtime: gccCheck,
      });
    });

    compiler.on('close', (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          output: compileStdout,
          error: compileStderr || 'Compilation failed.',
          exitCode: code ?? 1,
          runtime: gccCheck,
        });
        return;
      }

      resolve({
        success: true,
        output: compileStdout,
        error: compileStderr || undefined,
        exitCode: 0,
        runtime: gccCheck,
        tempDir,
        sourcePath,
        binaryPath,
      });
    });
  });

  if (!result.success) {
    await removeDirectory(tempDir);
  }

  return result;
}

function spawnNativeProgram(command, args, options, attempt = 1) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let settled = false;

    child.once('spawn', () => {
      settled = true;
      resolve(child);
    });

    child.once('error', (error) => {
      if (!settled && error?.code === 'UNKNOWN' && attempt < 3) {
        setTimeout(() => {
          spawnNativeProgram(command, args, options, attempt + 1).then(resolve, reject);
        }, 100);
        return;
      }

      reject(error);
    });
  });
}

const interactiveSessions = new Map();

function formatSseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function broadcastInteractiveEvent(session, event, data) {
  const payload = formatSseEvent(event, data);
  session.events.push(payload);

  for (const res of session.listeners) {
    res.write(payload);
  }
}

async function cleanupInteractiveSession(sessionId) {
  const session = interactiveSessions.get(sessionId);
  if (!session) {
    return;
  }

  interactiveSessions.delete(sessionId);

  if (session.cleanupTimer) {
    clearTimeout(session.cleanupTimer);
    session.cleanupTimer = null;
  }

  for (const res of session.listeners) {
    try {
      res.end();
    } catch {
      // Ignore stale response teardown errors.
    }
  }

  session.listeners.clear();

  try {
    terminateProcessTree(session.child);
  } catch {
    // Ignore cleanup failures.
  }

  await removeDirectory(session.tempDir);
}

function finalizeInteractiveSession(sessionId, result) {
  const session = interactiveSessions.get(sessionId);
  if (!session || session.finalized) {
    return;
  }

  session.finalized = true;
  broadcastInteractiveEvent(session, 'status', {
    type: 'status',
    requestId: session.requestId,
    status: result.status,
    attempt: 1,
  });

  broadcastInteractiveEvent(session, 'result', {
    type: 'result',
    requestId: session.requestId,
    success: result.success,
    output: result.output,
    error: result.error,
    warnings: result.warnings,
    exitCode: result.exitCode ?? null,
    waitingForInput: false,
    status: result.status,
    phase: result.phase ?? 'run',
  });

  if (!session.cleanupTimer) {
    session.cleanupTimer = setTimeout(() => {
      void cleanupInteractiveSession(sessionId);
    }, 30000);
  }
}

async function startInteractiveSession(request) {
  const language = typeof request?.language === 'string' ? request.language : 'c';
  const source = typeof request?.source === 'string' ? request.source : '';
  const stdin = typeof request?.stdin === 'string' ? request.stdin : '';
  const requestId = typeof request?.requestId === 'string' ? request.requestId : `interactive-${Date.now()}`;

  if (language !== 'c') {
    return {
      success: false,
      phase: 'validation',
      requestId,
      error: {
        code: 'UNSUPPORTED_LANGUAGE',
        message: 'Only C is supported for interactive native execution.',
      },
      exitCode: 1,
    };
  }

  if (!source.trim()) {
    return {
      success: false,
      phase: 'validation',
      requestId,
      error: {
        code: 'EMPTY_SOURCE',
        message: 'Source code is required for interactive execution.',
      },
      exitCode: 1,
    };
  }

  const buildResult = await buildNativeBinary(source, { staticLink: true });
  if (!buildResult.success) {
    return {
      success: false,
      phase: 'compile',
      requestId,
      stdout: buildResult.output,
      stderr: buildResult.error,
      error: {
        code: 'COMPILATION_ERROR',
        message: buildResult.error || 'The C compiler reported an error.',
      },
      exitCode: buildResult.exitCode,
      runtime: buildResult.runtime,
    };
  }

  const tempDir = buildResult.tempDir;
  const runtime = buildResult.runtime;

  let child;
  try {
    child = await spawnNativeProgram(buildResult.binaryPath, [], {
      cwd: tempDir,
      env: sanitizeEnvironment(path.dirname(runtime.path)),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
  } catch (error) {
    await removeDirectory(tempDir);
    return {
      success: false,
      phase: 'execution',
      requestId,
      error: {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
      exitCode: 1,
      runtime,
    };
  }

  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session = {
    sessionId,
    requestId,
    child,
    tempDir,
    runtime,
    listeners: new Set(),
    events: [],
    finalized: false,
    stdout: '',
    stderr: '',
    warnings: buildResult.error?.trim() || undefined,
    manualStop: false,
    cleanupTimer: null,
  };

  interactiveSessions.set(sessionId, session);

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    if (!text) {
      return;
    }

    session.stdout += text;
    broadcastInteractiveEvent(session, 'stream', {
      type: 'stream',
      requestId,
      stream: 'stdout',
      text,
      attempt: 1,
    });
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (!text) {
      return;
    }

    session.stderr += text;
    broadcastInteractiveEvent(session, 'stream', {
      type: 'stream',
      requestId,
      stream: 'stderr',
      text,
      attempt: 1,
    });
  });

  child.on('error', (error) => {
    if (session.finalized) {
      return;
    }

    finalizeInteractiveSession(sessionId, {
      success: false,
      output: session.stdout,
      error: error.message,
      exitCode: null,
      status: 'failed',
      phase: 'run',
    });
  });

  child.on('close', (exitCode, signal) => {
    if (session.finalized) {
      return;
    }

    const stopped = session.manualStop || signal != null;
    const success = !stopped && exitCode === 0;
    const runtimeError = session.stderr.trim();
    const status = stopped ? 'stopped' : (success ? 'completed' : 'failed');

    finalizeInteractiveSession(sessionId, {
      success,
      output: session.stdout,
      error: success
        ? undefined
        : (stopped
          ? 'Execution stopped.'
          : runtimeError || `Program exited with code ${exitCode ?? 1}.`),
      warnings: session.warnings,
      exitCode: stopped ? null : (exitCode ?? 1),
      status,
      phase: 'run',
    });
  });

  if (stdin && child.stdin && !child.stdin.destroyed) {
    try {
      child.stdin.write(stdin);
    } catch {
      // Ignore startup write failures if the process exits immediately.
    }
  }

  return {
    success: true,
    requestId,
    sessionId,
    phase: 'run',
    runtime,
  };
}

function detectGcc() {
  const likelyPaths = [
    process.env.PATH ? process.env.PATH.split(path.delimiter) : [],
    [
      'C:\\Users\\acer\\AppData\\Local\\Microsoft\\WinGet\\Packages\\BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\\mingw64\\bin',
      'C:\\Program Files\\WinLibs\\mingw64\\bin',
      'C:\\mingw64\\bin',
      'C:\\msys64\\ucrt64\\bin',
      'C:\\msys64\\mingw64\\bin',
    ],
  ].flat();

  for (const candidatePath of likelyPaths) {
    if (!candidatePath || !candidatePath.trim()) {
      continue;
    }

    const candidate = path.join(candidatePath.trim(), process.platform === 'win32' ? 'gcc.exe' : 'gcc');
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const probe = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (!probe.error && probe.stdout) {
      const raw = String(probe.stdout || '').trim();
      const version = raw.split(/\r?\n/)[0] || 'unknown';

      return {
        language: 'c',
        runtime: 'gcc',
        available: true,
        executable: candidate,
        path: candidate,
        version,
        status: 'ready',
        message: 'GCC detected and ready for native execution.',
      };
    }
  }

  const executableName = process.platform === 'win32' ? 'gcc.exe' : 'gcc';
  const baseProbe = spawnSync(executableName, ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (!baseProbe.error && baseProbe.stdout) {
    const raw = String(baseProbe.stdout || '').trim();
    const version = raw.split(/\r?\n/)[0] || 'unknown';

    return {
      language: 'c',
      runtime: 'gcc',
      available: true,
      executable: executableName,
      path: executableName,
      version,
      status: 'ready',
      message: 'GCC detected and ready for native execution.',
    };
  }

  if (process.platform === 'win32') {
    const whereProbe = spawnSync('where', ['gcc'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (!whereProbe.error && whereProbe.stdout) {
      const pathValue = String(whereProbe.stdout).split(/\r?\n/)[0]?.trim();
      if (pathValue) {
        return {
          language: 'c',
          runtime: 'gcc',
          available: true,
          executable: pathValue,
          path: pathValue,
          version: 'detected via where',
          status: 'ready',
          message: 'GCC detected on PATH.',
        };
      }
    }
  }

  return {
    language: 'c',
    runtime: 'gcc',
    available: false,
    executable: null,
    path: null,
    version: null,
    status: 'missing',
    message: 'GCC was not found on this computer. Install a C toolchain before running native execution.',
  };
}

async function compileCSource(source, stdin = '') {
  const buildResult = await buildNativeBinary(source, { staticLink: false });

  if (!buildResult.success) {
    return {
      success: false,
      output: buildResult.output,
      error: buildResult.error,
      exitCode: buildResult.exitCode,
    };
  }

  const tempDir = buildResult.tempDir;
  const child = spawn(buildResult.binaryPath, {
    cwd: tempDir,
    env: sanitizeEnvironment(path.dirname(buildResult.binaryPath)),
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  let stdout = '';
  let stderr = '';
  const compileTimeoutMs = 15000;
  let settled = false;

  return await new Promise((resolve) => {
    const settle = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      void removeDirectory(tempDir);
      resolve(result);
    };

    const timer = setTimeout(() => {
      terminateProcessTree(child);
      settle({
        success: false,
        output: stdout,
        error: 'Program execution timed out.',
        exitCode: 124,
      });
    }, compileTimeoutMs);

    child.stdin.write(stdin);
    child.stdin.end();

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      settle({
        success: false,
        output: stdout,
        error: error.message,
        exitCode: 1,
      });
    });

    child.on('close', (exitCode) => {
      settle({
        success: exitCode === 0,
        output: stdout,
        error: stderr || undefined,
        exitCode: exitCode ?? 1,
      });
    });
  });
}

async function executeNativeC(request) {
  const language = typeof request?.language === 'string' ? request.language : 'c';
  const source = typeof request?.source === 'string' ? request.source : '';
  const stdin = typeof request?.stdin === 'string' ? request.stdin : '';
  const timeoutMs = Number(request?.timeoutMs ?? 10000);
  const requestId = typeof request?.requestId === 'string' ? request.requestId : `native-${Date.now()}`;

  if (language !== 'c') {
    return {
      success: false,
      phase: 'validation',
      requestId,
      error: {
        code: 'UNSUPPORTED_LANGUAGE',
        message: 'Only C is supported in the native execution service during Stage 1.',
      },
      exitCode: 1,
    };
  }

  if (!source.trim()) {
    return {
      success: false,
      phase: 'validation',
      requestId,
      error: {
        code: 'EMPTY_SOURCE',
        message: 'Source code is required for native execution.',
      },
      exitCode: 1,
    };
  }

  const runtime = detectGcc();
  if (!runtime.available) {
    return {
      success: false,
      phase: 'runtime-discovery',
      requestId,
      error: {
        code: 'RUNTIME_MISSING',
        message: runtime.message,
      },
      exitCode: 127,
      runtime,
    };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgebyte-run-'));
  const sourcePath = path.join(tempDir, 'main.c');
  const binaryPath = path.join(tempDir, getBinaryName());

  try {
    fs.writeFileSync(sourcePath, source, 'utf8');

    const compilerCommand = runtime.path && String(runtime.path).trim() ? String(runtime.path) : 'gcc';
    const compileResult = await new Promise((resolve, reject) => {
      const compiler = spawn(
        compilerCommand,
        ['-std=c17', '-O2', '-static', '-o', binaryPath, sourcePath],
        {
          cwd: tempDir,
          env: sanitizeEnvironment(path.dirname(compilerCommand)),
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        }
      );

      let stdout = '';
      let stderr = '';

      compiler.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      compiler.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      compiler.on('error', (error) => {
        reject(error);
      });

      compiler.on('close', (exitCode) => {
        if (exitCode !== 0) {
          resolve({
            ok: false,
            stdout,
            stderr,
            exitCode: exitCode ?? 1,
          });
          return;
        }

        resolve({
          ok: true,
          stdout,
          stderr,
          exitCode: 0,
        });
      });
    });

    if (!compileResult.ok) {
      await removeDirectory(tempDir);
      return {
        success: false,
        phase: 'compile',
        requestId,
        stdout: compileResult.stdout,
        stderr: compileResult.stderr,
        error: {
          code: 'COMPILATION_ERROR',
          message: compileResult.stderr || 'The C compiler reported an error.',
        },
        exitCode: compileResult.exitCode,
        runtime,
      };
    }

    const actualTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000;

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let program;

    const settleExecution = async (result) => {
      clearTimeout(timeoutHandle);
      await removeDirectory(tempDir);
      return result;
    };

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      if (program) {
        terminateProcessTree(program);
      }
    }, actualTimeoutMs);

    try {
      program = await spawnNativeProgram(binaryPath, [], {
        cwd: tempDir,
        env: sanitizeEnvironment(path.dirname(runtime.path)),
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true,
      });
    } catch (error) {
      return await settleExecution({
        success: false,
        phase: 'execution',
        requestId,
        stdout,
        stderr,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
        },
        exitCode: 1,
        runtime,
      });
    }

    let processError = null;
    program.on('error', (error) => {
      processError = error;
    });
    program.stdin.on('error', (error) => {
      processError = error;
    });

    program.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    program.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    if (stdin && program.stdin && !program.stdin.destroyed) {
      try {
        program.stdin.write(stdin);
      } catch (error) {
        // Ignore write errors when the child exits immediately after startup.
      }
    }

    if (program.stdin && !program.stdin.destroyed) {
      try {
        program.stdin.end();
      } catch {
        // Ignore close errors if the child already exited.
      }
    }

    const exitCode = await new Promise((resolve) => {
      let settled = false;

      const finalize = (code) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(code ?? 1);
      };

      program.on('close', (code) => {
        finalize(code ?? 1);
      });
    });

    if (timedOut) {
      return await settleExecution({
        success: false,
        phase: 'execution',
        requestId,
        stdout,
        stderr,
        error: {
          code: 'TIMEOUT',
          message: `Program execution timed out after ${actualTimeoutMs}ms.`,
        },
        exitCode: 124,
        runtime,
      });
    }

    if (processError) {
      return await settleExecution({
        success: false,
        phase: 'execution',
        requestId,
        stdout,
        stderr,
        error: {
          code: 'EXECUTION_ERROR',
          message: processError instanceof Error ? processError.message : String(processError),
        },
        exitCode: 1,
        runtime,
      });
    }

    return await settleExecution({
      success: exitCode === 0,
      phase: 'execution',
      requestId,
      stdout,
      stderr,
      error: exitCode === 0 ? null : {
        code: 'RUNTIME_ERROR',
        message: stderr || 'The program exited with a non-zero status.',
      },
      exitCode,
      runtime,
    });
  } catch (error) {
    await removeDirectory(tempDir);
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

app.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.get('/api/runtime', (_req, res) => {
  const runtime = detectGcc();
  res.json(runtime);
});

app.post('/api/feedback', async (req, res) => {
  const payload = req.body ?? {};
  const type = payload.type;
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  const theme = typeof payload.theme === 'string' ? payload.theme : '';
  const language = typeof payload.language === 'string' ? payload.language : '';
  const appVersion = typeof payload.app_version === 'string' ? payload.app_version : '';

  if (!['bug', 'suggestion', 'feedback'].includes(type) ||
      !message || message.length > 5000 || !theme || !language || !appVersion) {
    return res.status(400).json({ success: false, error: 'Invalid feedback payload.' });
  }

  try {
    const feedbackPath = process.env.FEEDBACK_FILE || path.join(os.tmpdir(), 'forgebyte-feedback.jsonl');
    await fs.promises.appendFile(
      feedbackPath,
      `${JSON.stringify({
        type,
        message,
        theme,
        language,
        app_version: appVersion,
        created_at: new Date().toISOString(),
      })}\n`,
      'utf8'
    );
    return res.status(201).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unable to store feedback.',
    });
  }
});

app.post('/api/compile', async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const stdin = typeof req.body?.stdin === 'string' ? req.body.stdin : '';

  if (!code.trim()) {
    return res.status(400).json({
      success: false,
      output: '',
      error: 'Empty source code.',
    });
  }

  try {
    const result = await compileCSource(code, stdin);
    res.json({
      success: result.success,
      output: result.output,
      error: result.error,
      exitCode: result.exitCode,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/api/execute', async (req, res) => {
  const payload = req.body ?? {};
  if (payload?.interactive === true) {
    const result = await startInteractiveSession(payload);

    if (result.success) {
      return res.status(202).json(result);
    }

    if (result.phase === 'runtime-discovery' || result.error?.code === 'RUNTIME_MISSING') {
      return res.status(503).json(result);
    }

    if (result.phase === 'validation') {
      return res.status(400).json(result);
    }

    if (result.phase === 'compile') {
      return res.status(400).json(result);
    }

    return res.status(500).json(result);
  }

  const result = await executeNativeC(payload);

  if (result.success) {
    return res.json(result);
  }

  if (result.phase === 'runtime-discovery' || result.error?.code === 'RUNTIME_MISSING') {
    return res.status(503).json(result);
  }

  if (result.phase === 'validation') {
    return res.status(400).json(result);
  }

  if (result.phase === 'compile') {
    return res.status(400).json(result);
  }

  return res.status(500).json(result);
});

app.get('/api/execute/:sessionId/events', (req, res) => {
  const { sessionId } = req.params;
  const session = interactiveSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'SESSION_NOT_FOUND',
        message: 'Interactive execution session not found.',
      },
    });
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  session.listeners.add(res);

  for (const event of session.events) {
    res.write(event);
  }

  req.on('close', () => {
    session.listeners.delete(res);
  });
});

app.post('/api/execute/:sessionId/input', async (req, res) => {
  const { sessionId } = req.params;
  const session = interactiveSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'SESSION_NOT_FOUND',
        message: 'Interactive execution session not found.',
      },
    });
  }

  const input = typeof req.body?.input === 'string' ? req.body.input : '';
  const eof = Boolean(req.body?.eof);

  if (eof) {
    try {
      if (session.child.stdin && !session.child.stdin.destroyed) {
        session.child.stdin.end();
      }
    } catch {
      // Ignore close failures.
    }
  } else if (input && session.child.stdin && !session.child.stdin.destroyed) {
    try {
      session.child.stdin.write(input);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'STDIN_WRITE_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return res.json({ success: true });
});

app.post('/api/execute/:sessionId/stop', async (req, res) => {
  const { sessionId } = req.params;
  const session = interactiveSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'SESSION_NOT_FOUND',
        message: 'Interactive execution session not found.',
      },
    });
  }

  session.manualStop = true;
  terminateProcessTree(session.child);

  return res.json({ success: true });
});

const gccCheck = detectGcc();
if (!gccCheck.available) {
  console.warn(gccCheck.message);
} else {
  console.log(`Native C runtime detected: ${gccCheck.executable} @ ${gccCheck.path || 'PATH'}`);
}

app.listen(PORT, () => {
  console.log(`ForgebyteX backend running on http://localhost:${PORT}`);
});
