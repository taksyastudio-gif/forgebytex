/**
 * Python Language Executor
 * 
 * Implements Python execution using CPython with Isolate sandboxing.
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

import type {
  LanguageExecutor,
  ExecutionRequest,
  ExecutionResult,
  InteractiveProcess,
  ProcessCallbacks,
} from '../types.js';
import { COMPILER_CONFIG, EXECUTION_ENV, RESOURCE_LIMITS, SANDBOX_CONFIG, detectIsolate } from '../config.js';

/**
 * Python executor implementation
 */
export class PythonExecutor implements LanguageExecutor {
  private readonly platform: string;
  private readonly hasIsolate: boolean;
  private readonly pythonPath: string;
  private readonly isolatePath: string;
  
  constructor() {
    this.platform = EXECUTION_ENV.platform;
    this.hasIsolate = detectIsolate();
    this.pythonPath = EXECUTION_ENV.pythonPath;
    this.isolatePath = EXECUTION_ENV.isolatePath;
  }
  
  isAvailable(): boolean {
    // Check if Python is available
    try {
      const result = spawnSync(this.pythonPath, ['--version'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }
  
  getDescription(): string {
    return `CPython ${COMPILER_CONFIG.python.version} (${this.platform}${this.hasIsolate ? ' with Isolate sandbox' : ' (unsandboxed - development mode)'})`;
  }
  
  async execute(request: ExecutionRequest, callbacks?: ProcessCallbacks): Promise<ExecutionResult> {
    const startTime = Date.now();
    let workspace: string | null = null;
    let boxId: string | null = null;
    
    try {
      callbacks?.onStatus?.('preparing');
      
      // Create temporary workspace
      workspace = this.createWorkspace();
      
      // Write source file
      const sourcePath = join(workspace, 'main.py');
      writeFileSync(sourcePath, request.source, 'utf8');
      
      // Initialize Isolate sandbox if available
      if (this.hasIsolate) {
        boxId = await this.initIsolate(workspace);
      }
      
      // Execute
      const executeResult = await this.executePython(
        sourcePath,
        workspace,
        request,
        callbacks,
        boxId
      );
      
      if (boxId) await this.cleanupIsolate(boxId);
      this.cleanupWorkspace(workspace);
      
      return {
        ...executeResult,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      if (boxId) await this.cleanupIsolate(boxId).catch(() => {});
      if (workspace) this.cleanupWorkspace(workspace);
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
  
  async createInteractiveProcess(
    request: ExecutionRequest,
    callbacks?: ProcessCallbacks
  ): Promise<InteractiveProcess> {
    let workspace: string | null = null;
    let boxId: string | null = null;
    
    try {
      callbacks?.onStatus?.('preparing');
      
      // Create temporary workspace
      workspace = this.createWorkspace();
      
      // Write source file
      const sourcePath = join(workspace, 'main.py');
      writeFileSync(sourcePath, request.source, 'utf8');
      
      // Initialize Isolate sandbox if available
      if (this.hasIsolate) {
        boxId = await this.initIsolate(workspace);
      }
      
      // Create interactive process
      const process = new PythonInteractiveProcess(
        sourcePath,
        workspace,
        request,
        callbacks,
        boxId || undefined,
        () => {
          if (boxId) this.cleanupIsolate(boxId).catch(() => {});
          if (workspace) this.cleanupWorkspace(workspace);
        }
      );
      
      return process;
    } catch (error) {
      if (boxId) await this.cleanupIsolate(boxId).catch(() => {});
      if (workspace) this.cleanupWorkspace(workspace);
      throw new Error(`Failed to create interactive process: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  private createWorkspace(): string {
    return mkdtempSync(join(tmpdir(), 'forgebyte-'));
  }
  
  private cleanupWorkspace(workspace: string): void {
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
  
  /**
   * Initialize Isolate sandbox
   * Returns the box directory path
   */
  private async initIsolate(_workspace: string): Promise<string> {
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
  private async cleanupIsolate(_boxId: string): Promise<void> {
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
  
  private async executePython(
    sourcePath: string,
    workspace: string,
    request: ExecutionRequest,
    callbacks?: ProcessCallbacks,
    boxId?: string | null
  ): Promise<ExecutionResult> {
    callbacks?.onStatus?.('running');
    
    const limits = request.limits || {};
    
    const result = await this.runIsolateCommand(
      this.pythonPath,
      [sourcePath],
      workspace,
      limits,
      'execute',
      request.stdin,
      boxId
    );
    
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
  
  private async runIsolateCommand(
    command: string,
    args: string[],
    workspace: string,
    limits: any,
    phase: 'compile' | 'execute',
    stdin?: string,
    boxId?: string | null
  ): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: string | null;
    diagnostics?: string;
  }> {
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
    } catch (error) {
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
  
  private buildIsolateArgs(workspace: string, limits: any, _phase: 'compile' | 'execute'): string[] {
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
  
  private async runUnsandboxedCommand(
    command: string,
    args: string[],
    workspace: string,
    phase: 'compile' | 'execute',
    stdin?: string
  ): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: string | null;
    diagnostics?: string;
  }> {
    console.warn(`WARNING: Running unsandboxed ${phase} in development mode`);
    
    try {
      const result = await this.spawnProcess([command, ...args], workspace, stdin);
      return result;
    } catch (error) {
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
  
  private async spawnProcess(
    args: string[],
    cwd: string,
    stdin?: string
  ): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: string | null;
  }> {
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
        } else {
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
 * Interactive Python process implementation
 */
class PythonInteractiveProcess implements InteractiveProcess {
  private process: any;
  private cleanup: () => void;
  private alive: boolean = true;
  private callbacks?: ProcessCallbacks;
  private stdoutBuffer: string = '';
  private stderrBuffer: string = '';
  private settled = false;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private outputLimitExceeded = false;
  private readonly maxOutputSize: number;
  
  constructor(
    sourcePath: string,
    workspace: string,
    _request: ExecutionRequest,
    callbacks?: ProcessCallbacks,
    _boxId?: string,
    cleanup?: () => void
  ) {
    this.cleanup = cleanup || (() => {});
    this.callbacks = callbacks;
    const limits = _request.limits || RESOURCE_LIMITS;
    this.maxOutputSize = Math.max(1, limits.output ?? RESOURCE_LIMITS.output) * 1024 * 1024;
    
    // Spawn process
    this.process = spawn(EXECUTION_ENV.pythonPath, [sourcePath], {
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

  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private finish(success: boolean, status: ExecutionResult['status'], diagnostics?: string, exitCode: number | null = null): void {
    if (this.settled) return;
    this.settled = true;
    this.clearTimeout();
    this.callbacks?.onExit?.({
      success, status, phase: 'run', stdout: this.stdoutBuffer, stderr: this.stderrBuffer,
      exitCode, signal: null, duration: 0, diagnostics,
    });
  }

  private setupProcessListeners(): void {
    this.process.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      this.stdoutBuffer += text;
      this.callbacks?.onStdout?.(text);
      if (this.stdoutBuffer.length + this.stderrBuffer.length > this.maxOutputSize && !this.outputLimitExceeded) {
        this.outputLimitExceeded = true;
        this.finish(false, 'output-limit', 'Output limit exceeded.');
        this.process.kill('SIGKILL');
      }
    });
    
    this.process.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      this.stderrBuffer += text;
      this.callbacks?.onStderr?.(text);
    });
    
    this.process.on('close', (exitCode: number | null) => {
      this.alive = false;
      this.finish(exitCode === 0, exitCode === 0 ? 'completed' : 'failed', exitCode === 0 ? undefined : 'The process exited with an error.', exitCode);
      this.cleanup();
    });
    
    this.process.on('error', (_error: Error) => {
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
  
  write(data: string): void {
    if (this.alive && this.process.stdin) {
      this.process.stdin.write(data);
    }
  }

  closeStdin(): void {
    if (this.alive && this.process.stdin && !this.process.stdin.destroyed) {
      this.process.stdin.end();
    }
  }
  
  read(): string {
    const output = this.stdoutBuffer;
    this.stdoutBuffer = '';
    return output;
  }
  
  getOutput(): string {
    return this.stdoutBuffer;
  }
  
  getError(): string {
    return this.stderrBuffer;
  }
  
  isAlive(): boolean {
    return this.alive;
  }
  
  stop(): void {
    if (this.alive) {
      this.finish(false, 'failed', 'Execution stopped.');
      this.process.kill('SIGKILL');
      this.alive = false;
      this.cleanup();
    }
  }
}
