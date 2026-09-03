/**
 * C Language Executor
 *
 * Implements C compilation and execution using GCC with Isolate sandboxing.
 * Supports real interactive stdin through proper process management.
 *
 * Isolate lifecycle:
 * 1. isolate --init - creates sandbox directory
 * 2. isolate --run -- program - executes program in sandbox
 * 3. isolate --cleanup - removes sandbox directory
 */
import { spawn, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { COMPILER_CONFIG, EXECUTION_ENV, RESOURCE_LIMITS, SANDBOX_CONFIG, detectIsolate } from '../config.js';
/**
 * C executor implementation
 */
export class CExecutor {
    platform;
    hasIsolate;
    gccPath;
    isolatePath;
    constructor() {
        this.platform = EXECUTION_ENV.platform;
        this.hasIsolate = detectIsolate();
        this.gccPath = EXECUTION_ENV.gccPath;
        this.isolatePath = EXECUTION_ENV.isolatePath;
    }
    isAvailable() {
        // Check if GCC is available
        try {
            const result = spawnSync(this.gccPath, ['--version'], {
                encoding: 'utf8',
                timeout: 5000,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            return result.status === 0;
        }
        catch {
            return false;
        }
    }
    getDescription() {
        return `GCC C Compiler (${this.platform}${this.hasIsolate ? ' with Isolate sandbox' : ' (unsandboxed - development mode)'})`;
    }
    async execute(request, callbacks) {
        const startTime = Date.now();
        let workspace = null;
        let boxId = null;
        try {
            callbacks?.onStatus?.('preparing');
            // Create temporary workspace
            workspace = this.createWorkspace();
            // Write source file
            const sourcePath = join(workspace, 'main.c');
            writeFileSync(sourcePath, request.source, 'utf8');
            // Initialize Isolate sandbox if available
            if (this.hasIsolate) {
                boxId = await this.initIsolate(workspace);
            }
            // Compile
            const compileResult = await this.compile(sourcePath, workspace, request, callbacks, boxId);
            if (!compileResult.success) {
                if (boxId)
                    await this.cleanupIsolate(boxId);
                this.cleanupWorkspace(workspace);
                return {
                    success: false,
                    status: 'compile-error',
                    phase: 'compile',
                    stdout: compileResult.stdout || '',
                    stderr: compileResult.stderr || compileResult.diagnostics || '',
                    exitCode: compileResult.exitCode ?? null,
                    signal: null,
                    duration: Date.now() - startTime,
                    diagnostics: compileResult.diagnostics,
                };
            }
            // Execute
            const executeResult = await this.executeBinary(compileResult.binaryPath, workspace, request, callbacks, boxId);
            if (boxId)
                await this.cleanupIsolate(boxId);
            this.cleanupWorkspace(workspace);
            return {
                ...executeResult,
                duration: Date.now() - startTime,
            };
        }
        catch (error) {
            if (boxId)
                await this.cleanupIsolate(boxId).catch(() => { });
            if (workspace)
                this.cleanupWorkspace(workspace);
            return {
                success: false,
                status: 'infrastructure-error',
                phase: 'run',
                stdout: '',
                stderr: '',
                exitCode: null,
                signal: null,
                duration: Date.now() - startTime,
                diagnostics: error instanceof Error ? error.message : String(error),
            };
        }
    }
    async createInteractiveProcess(request, callbacks) {
        let workspace = null;
        let boxId = null;
        try {
            callbacks?.onStatus?.('preparing');
            // Create temporary workspace
            workspace = this.createWorkspace();
            // Write source file
            const sourcePath = join(workspace, 'main.c');
            writeFileSync(sourcePath, request.source, 'utf8');
            // Initialize Isolate sandbox if available
            if (this.hasIsolate) {
                boxId = await this.initIsolate(workspace);
            }
            // Compile
            const compileResult = await this.compile(sourcePath, workspace, request, callbacks, boxId);
            if (!compileResult.success) {
                if (boxId)
                    await this.cleanupIsolate(boxId);
                this.cleanupWorkspace(workspace);
                throw new Error(compileResult.diagnostics || 'Compilation failed');
            }
            // Create interactive process
            const process = new CInteractiveProcess(compileResult.binaryPath, workspace, request, callbacks, boxId || undefined, () => {
                if (boxId)
                    this.cleanupIsolate(boxId).catch(() => { });
                if (workspace)
                    this.cleanupWorkspace(workspace);
            });
            return process;
        }
        catch (error) {
            if (boxId)
                await this.cleanupIsolate(boxId).catch(() => { });
            if (workspace)
                this.cleanupWorkspace(workspace);
            throw new Error(`Failed to create interactive process: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    createWorkspace() {
        return mkdtempSync(join(tmpdir(), 'forgebyte-'));
    }
    cleanupWorkspace(workspace) {
        try {
            rmSync(workspace, { recursive: true, force: true });
        }
        catch {
            // Ignore cleanup errors
        }
    }
    /**
     * Initialize Isolate sandbox
     * Returns the box directory path
     */
    async initIsolate(_workspace) {
        const args = [
            '--box-id=' + SANDBOX_CONFIG.boxId,
            '--init',
        ];
        const result = spawnSync(this.isolatePath, args, {
            encoding: 'utf8',
            timeout: 10000,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        if (result.status !== 0) {
            throw new Error(`Isolate init failed: ${result.stderr || 'Unknown error'}`);
        }
        // Isolate prints the box directory to stdout
        const boxDir = result.stdout?.trim();
        if (!boxDir) {
            throw new Error('Isolate init did not return box directory');
        }
        return boxDir;
    }
    /**
     * Cleanup Isolate sandbox
     */
    async cleanupIsolate(_boxId) {
        const args = [
            '--box-id=' + SANDBOX_CONFIG.boxId,
            '--cleanup',
        ];
        spawnSync(this.isolatePath, args, {
            encoding: 'utf8',
            timeout: 10000,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    }
    async compile(sourcePath, workspace, request, callbacks, boxId) {
        callbacks?.onStatus?.('compiling');
        const binaryName = this.platform === 'win32' ? 'main.exe' : 'main';
        const outputPath = join(workspace, binaryName);
        const limits = request.limits || {};
        const compileArgs = [
            COMPILER_CONFIG.c.standard,
            COMPILER_CONFIG.c.optimization,
            COMPILER_CONFIG.c.outputFlag,
            outputPath,
            sourcePath,
        ];
        const result = await this.runIsolateCommand(this.gccPath, compileArgs, workspace, limits, 'compile', undefined, boxId);
        if (result.success) {
            return {
                success: true,
                binaryPath: outputPath,
                stdout: result.stdout,
                stderr: result.stderr,
            };
        }
        return {
            success: false,
            diagnostics: result.stderr || result.stdout || 'Compilation failed',
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode ?? null,
        };
    }
    async executeBinary(binaryPath, workspace, request, callbacks, boxId) {
        callbacks?.onStatus?.('running');
        const limits = request.limits || {};
        const result = await this.runIsolateCommand(binaryPath, [], workspace, limits, 'execute', request.stdin, boxId);
        return {
            success: result.exitCode === 0,
            status: result.exitCode === 0 ? 'completed' : 'failed',
            phase: 'run',
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            signal: result.signal,
            duration: 0,
            diagnostics: result.diagnostics,
        };
    }
    async runIsolateCommand(command, args, workspace, limits, phase, stdin, boxId) {
        if (!this.hasIsolate || !boxId) {
            // Fallback to unsandboxed execution (development only)
            return this.runUnsandboxedCommand(command, args, workspace, phase, stdin);
        }
        // Isolate sandboxed execution
        const isolateArgs = this.buildIsolateArgs(workspace, limits, phase);
        const fullArgs = [...isolateArgs, '--run', '--', command, ...args];
        try {
            const result = await this.spawnProcess(fullArgs, workspace, stdin);
            return result;
        }
        catch (error) {
            return {
                success: false,
                stdout: '',
                stderr: '',
                exitCode: null,
                signal: null,
                diagnostics: `Isolate execution failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    buildIsolateArgs(workspace, limits, _phase) {
        // Convert MB to KB for Isolate
        const memoryKb = (limits.memory || 256) * 1024;
        const fsizeKb = (limits.output || 10) * 1024;
        const args = [
            '--box-id=' + SANDBOX_CONFIG.boxId,
            '--dir=' + SANDBOX_CONFIG.workingDir,
            '--dir=' + workspace + ':rw',
            '--mem=' + memoryKb,
            '--time=' + (limits.cpuTime || 10),
            '--wall-time=' + (limits.wallTime || 15),
            '--extra-time=' + Math.max(1, (limits.wallTime || 15) - (limits.cpuTime || 10)),
            '--fsize=' + fsizeKb,
            '--processes=' + (limits.processes || 10),
            '--cg',
            '--cg-mem=' + memoryKb,
        ];
        return args;
    }
    async runUnsandboxedCommand(command, args, workspace, phase, stdin) {
        console.warn(`WARNING: Running unsandboxed ${phase} in development mode`);
        try {
            const result = await this.spawnProcess([command, ...args], workspace, stdin);
            return result;
        }
        catch (error) {
            return {
                success: false,
                stdout: '',
                stderr: '',
                exitCode: null,
                signal: null,
                diagnostics: `Unsandboxed execution failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    async spawnProcess(args, cwd, stdin) {
        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let stdoutSize = 0;
            let stderrSize = 0;
            const maxOutputSize = 10 * 1024 * 1024; // 10 MB
            let outputLimitExceeded = false;
            const process = spawn(args[0], args.slice(1), {
                cwd,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            if (stdin) {
                process.stdin.write(stdin);
                process.stdin.end();
            }
            process.stdout.on('data', (data) => {
                const chunk = data.toString();
                stdoutSize += chunk.length;
                if (stdoutSize > maxOutputSize && !outputLimitExceeded) {
                    outputLimitExceeded = true;
                    process.kill('SIGKILL');
                    return;
                }
                if (!outputLimitExceeded) {
                    stdout += chunk;
                }
            });
            process.stderr.on('data', (data) => {
                const chunk = data.toString();
                stderrSize += chunk.length;
                if (stderrSize > maxOutputSize && !outputLimitExceeded) {
                    outputLimitExceeded = true;
                    process.kill('SIGKILL');
                    return;
                }
                if (!outputLimitExceeded) {
                    stderr += chunk;
                }
            });
            process.on('close', (code, signal) => {
                if (outputLimitExceeded) {
                    resolve({
                        success: false,
                        stdout,
                        stderr: stderr + '\n[Output limit exceeded]',
                        exitCode: null,
                        signal: signal ? signal.toString() : null,
                    });
                }
                else {
                    resolve({
                        success: code === 0,
                        stdout,
                        stderr,
                        exitCode: code ?? null,
                        signal: signal ? signal.toString() : null,
                    });
                }
            });
            process.on('error', (_error) => {
                resolve({
                    success: false,
                    stdout,
                    stderr,
                    exitCode: null,
                    signal: null,
                });
            });
        });
    }
}
/**
 * Interactive C process implementation
 */
class CInteractiveProcess {
    process;
    cleanup;
    alive = true;
    callbacks;
    stdoutBuffer = '';
    stderrBuffer = '';
    settled = false;
    timeoutHandle;
    outputLimitExceeded = false;
    maxOutputSize;
    constructor(binaryPath, workspace, _request, callbacks, _boxId, cleanup) {
        this.cleanup = cleanup || (() => { });
        this.callbacks = callbacks;
        const limits = _request.limits || RESOURCE_LIMITS;
        this.maxOutputSize = Math.max(1, limits.output ?? RESOURCE_LIMITS.output) * 1024 * 1024;
        // Spawn process
        this.process = spawn(binaryPath, [], {
            cwd: workspace,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.setupProcessListeners();
        this.timeoutHandle = setTimeout(() => {
            if (this.alive) {
                this.finish(false, 'timeout', 'Execution timed out.');
                this.process.kill('SIGKILL');
            }
        }, Math.max(1, limits.wallTime ?? RESOURCE_LIMITS.wallTime) * 1000);
    }
    clearTimeout() {
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = null;
        }
    }
    finish(success, status, diagnostics, exitCode = null) {
        if (this.settled)
            return;
        this.settled = true;
        this.clearTimeout();
        this.callbacks?.onExit?.({
            success, status, phase: 'run', stdout: this.stdoutBuffer, stderr: this.stderrBuffer,
            exitCode, signal: null, duration: 0, diagnostics,
        });
    }
    setupProcessListeners() {
        this.process.stdout.on('data', (data) => {
            const text = data.toString();
            this.stdoutBuffer += text;
            this.callbacks?.onStdout?.(text);
            if (this.stdoutBuffer.length + this.stderrBuffer.length > this.maxOutputSize && !this.outputLimitExceeded) {
                this.outputLimitExceeded = true;
                this.finish(false, 'output-limit', 'Output limit exceeded.');
                this.process.kill('SIGKILL');
            }
        });
        this.process.stderr.on('data', (data) => {
            const text = data.toString();
            this.stderrBuffer += text;
            this.callbacks?.onStderr?.(text);
        });
        this.process.on('close', (exitCode) => {
            this.alive = false;
            this.finish(exitCode === 0, exitCode === 0 ? 'completed' : 'failed', exitCode === 0 ? undefined : 'The process exited with an error.', exitCode);
            this.cleanup();
        });
        this.process.on('error', (_error) => {
            this.alive = false;
            this.callbacks?.onExit?.({
                success: false,
                status: 'infrastructure-error',
                phase: 'run',
                stdout: this.stdoutBuffer,
                stderr: this.stderrBuffer,
                exitCode: null,
                signal: null,
                duration: 0,
                diagnostics: _error.message,
            });
        });
    }
    write(data) {
        if (this.alive && this.process.stdin) {
            this.process.stdin.write(data);
        }
    }
    closeStdin() {
        if (this.alive && this.process.stdin && !this.process.stdin.destroyed) {
            this.process.stdin.end();
        }
    }
    read() {
        const output = this.stdoutBuffer;
        this.stdoutBuffer = '';
        return output;
    }
    getOutput() {
        return this.stdoutBuffer;
    }
    getError() {
        return this.stderrBuffer;
    }
    isAlive() {
        return this.alive;
    }
    stop() {
        if (this.alive) {
            this.finish(false, 'failed', 'Execution stopped.');
            this.process.kill('SIGKILL');
            this.alive = false;
            this.cleanup();
        }
    }
}
