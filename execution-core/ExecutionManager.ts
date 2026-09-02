/**
 * Execution Manager
 * 
 * Orchestrates language-specific executors and provides a unified interface
 * for code execution with proper sandboxing and resource limits.
 */

import type { Language, ExecutionRequest, ExecutionResult, ExecutionStatus, InteractiveProcess, ProcessCallbacks } from './types';
import { CExecutor } from './executors/CExecutor';
import { PythonExecutor } from './executors/PythonExecutor';
import { mergeLimits, getExecutionLimits, EXECUTION_ENV } from './config';

/**
 * Execution manager - main entry point for code execution
 */
export class ExecutionManager {
  private executors: Map<Language, any>;
  private activeProcesses: Map<string, InteractiveProcess>;
  
  constructor() {
    this.executors = new Map();
    this.activeProcesses = new Map();
    
    // Initialize language executors
    this.executors.set('c', new CExecutor());
    this.executors.set('python', new PythonExecutor());
  }
  
  /**
   * Execute code in a single run (non-interactive)
   */
  async execute(request: ExecutionRequest, callbacks?: ProcessCallbacks): Promise<ExecutionResult> {
    const executor = this.executors.get(request.language);
    
    if (!executor) {
      return {
        success: false,
        status: 'infrastructure-error',
        phase: 'run',
        stdout: '',
        stderr: '',
        exitCode: null,
        signal: null,
        duration: 0,
        diagnostics: `Unsupported language: ${request.language}`,
      };
    }
    
    if (!executor.isAvailable()) {
      return {
        success: false,
        status: 'infrastructure-error',
        phase: 'run',
        stdout: '',
        stderr: '',
        exitCode: null,
        signal: null,
        duration: 0,
        diagnostics: `${executor.getDescription()} is not available in current environment`,
      };
    }
    
    // Merge limits with defaults
    const limits = mergeLimits(request.limits);
    const limitedRequest: ExecutionRequest = {
      ...request,
      limits,
    };
    
    return executor.execute(limitedRequest, callbacks);
  }
  
  /**
   * Create an interactive process for stdin handling
   */
  async createInteractiveProcess(
    request: ExecutionRequest,
    callbacks?: ProcessCallbacks
  ): Promise<InteractiveProcess> {
    const executor = this.executors.get(request.language);
    
    if (!executor) {
      throw new Error(`Unsupported language: ${request.language}`);
    }
    
    if (!executor.isAvailable()) {
      throw new Error(`${executor.getDescription()} is not available in current environment`);
    }
    
    // Merge limits with defaults
    const limits = mergeLimits(request.limits);
    const limitedRequest: ExecutionRequest = {
      ...request,
      limits,
    };
    
    const process = await executor.createInteractiveProcess(limitedRequest, callbacks);
    
    // Track active process
    if (request.requestId) {
      this.activeProcesses.set(request.requestId, process);
    }
    
    return process;
  }
  
  /**
   * Get an active process by request ID
   */
  getProcess(requestId: string): InteractiveProcess | undefined {
    return this.activeProcesses.get(requestId);
  }
  
  /**
   * Stop and remove an active process
   */
  async stopProcess(requestId: string): Promise<void> {
    const process = this.activeProcesses.get(requestId);
    if (process) {
      await process.stop();
      this.activeProcesses.delete(requestId);
    }
  }
  
  /**
   * Get environment information
   */
  getEnvironmentInfo() {
    return {
      platform: EXECUTION_ENV.platform,
      hasIsolate: EXECUTION_ENV.hasIsolate,
      isDevelopment: EXECUTION_ENV.isDevelopment,
      availableLanguages: Array.from(this.executors.entries())
        .filter(([_, executor]) => executor.isAvailable())
        .map(([lang, _]) => lang),
    };
  }
}

// Singleton instance
export const executionManager = new ExecutionManager();
