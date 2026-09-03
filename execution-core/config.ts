/**
 * Execution Core Configuration
 * 
 * Centralized configuration for resource limits, sandbox settings, and execution parameters.
 */

import type { ResourceLimits } from './types.js';
import { spawnSync } from 'child_process';

/**
 * Resource limits configuration
 */
export const RESOURCE_LIMITS: ResourceLimits = {
  cpuTime: 10,      // 10 seconds CPU time
  wallTime: 15,     // 15 seconds wall clock time
  memory: 256,      // 256 MB memory limit
  output: 10,       // 10 MB output limit
  filesystem: 50,   // 50 MB filesystem limit
  processes: 10,    // 10 processes max
};

/**
 * Sandbox configuration
 */
export const SANDBOX_CONFIG = {
  /** Isolate box ID */
  boxId: 'forgebyteX',
  
  /** Working directory inside sandbox */
  workingDir: '/box',
  
  /** Temporary directory pattern */
  tempDirPattern: '/tmp/forgebyte-XXXXXX',
  
  /** Whether network access is allowed */
  allowNetwork: false,
  
  /** Whether filesystem access outside sandbox is allowed */
  allowHostFS: false,
  
  /** Maximum concurrent executions */
  maxConcurrent: 150,
} as const;

/**
 * Compiler configuration
 */
export const COMPILER_CONFIG = {
  /** C compiler */
  c: {
    executable: 'gcc',
    standard: '-std=c17',
    optimization: '-O2',
    warnings: '-Wall -Wextra',
    outputFlag: '-o',
  },
  
  /** Python interpreter */
  python: {
    executable: 'python3',
    version: '3.11',
  },
} as const;

/**
 * Execution environment configuration
 */
export let EXECUTION_ENV = {
  /** Platform detection */
  platform: process.platform,
  
  /** Whether running in development mode */
  isDevelopment: process.env.NODE_ENV !== 'production',
  
  /** Whether Isolate is available (Linux only, requires detection) */
  hasIsolate: false, // Will be set by detectIsolate()
  
  /** Path to isolate executable */
  isolatePath: process.env.ISOLATE_PATH || 'isolate',
  
  /** Path to GCC executable */
  gccPath: process.env.GCC_PATH || 'gcc',
  
  /** Path to Python executable */
  pythonPath: process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3'),
};

/**
 * Detect if Isolate is available and working
 */
export function detectIsolate(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }
  
  try {
    const result = spawnSync(EXECUTION_ENV.isolatePath, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    // Isolate returns 0 and prints version info
    if (result.status === 0 && result.stdout) {
      EXECUTION_ENV.hasIsolate = true;
      return true;
    }
  } catch {
    // Isolate not found or not executable
  }
  
  return false;
}

/**
 * Merge user-provided limits with defaults
 */
export function mergeLimits(userLimits?: Partial<ResourceLimits>): ResourceLimits {
  return {
    ...RESOURCE_LIMITS,
    ...userLimits,
  };
}

/**
 * Get execution-specific limits based on mode
 */
export function getExecutionLimits(mode: 'compile' | 'execute' = 'execute'): ResourceLimits {
  if (mode === 'compile') {
    // Compilation needs less time but still needs limits
    return {
      ...RESOURCE_LIMITS,
      cpuTime: 5,     // 5 seconds for compilation
      wallTime: 10,    // 10 seconds wall time
      memory: 128,    // 128 MB for compilation
    };
  }
  
  return RESOURCE_LIMITS;
}
