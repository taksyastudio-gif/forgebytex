import express from 'express';
import cors from 'cors';
import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

function compileCSource(source, stdin = '') {
  return new Promise((resolve) => {
    const gccCheck = spawnSync('gcc', ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (gccCheck.error || !gccCheck.stdout) {
      return resolve({
        success: false,
        output: '',
        error: 'gcc is not installed or not available in PATH. Install build-essential/gcc in the runtime (Docker/Render/Linux) before compiling C programs.',
        exitCode: 127,
      });
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgebyte-'));
    const sourcePath = path.join(tempDir, 'main.c');
    const binaryPath = path.join(tempDir, 'main');

    fs.writeFileSync(sourcePath, source, 'utf8');

    const compileTimeoutMs = 15000;
    execFile(
      'gcc',
      ['-std=c17', '-O2', '-o', binaryPath, sourcePath],
      { timeout: compileTimeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (compileError, _compileStdout, compileStderr) => {
        if (compileError) {
          return resolve({
            success: false,
            output: '',
            error: compileStderr || compileError.message,
            exitCode: compileError.code ?? 1,
          });
        }

        const child = spawnSync(binaryPath, {
          input: stdin,
          encoding: 'utf8',
          timeout: compileTimeoutMs,
          maxBuffer: 10 * 1024 * 1024,
        });

        resolve({
          success: child.status === 0,
          output: child.stdout || '',
          error: child.stderr || undefined,
          exitCode: child.status ?? 1,
        });
      }
    );
  });
}

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

const gccCheck = spawnSync('gcc', ['--version'], { encoding: 'utf8', timeout: 5000 });
if (gccCheck.error) {
  console.warn('gcc not found in PATH; Render or Docker runtime must install build-essential/gcc before using /api/compile');
}

app.listen(PORT, () => {
  console.log(`ForgebyteX backend running on http://localhost:${PORT}`);
});
