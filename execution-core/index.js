/**
 * Execution Core Module
 *
 * Main entry point for the ForgeByteX native execution engine.
 * Provides language-agnostic code execution with Isolate sandboxing.
 */
export * from './types.js';
export * from './config.js';
export { ExecutionManager, executionManager } from './ExecutionManager.js';
export { CExecutor } from './executors/CExecutor.js';
export { PythonExecutor } from './executors/PythonExecutor.js';
