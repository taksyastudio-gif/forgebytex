/**
 * Execution Core Types
 *
 * Language-agnostic execution abstraction for ForgeByteX native execution engine.
 * This defines the interface between the execution manager and language-specific executors.
 */
/**
 * Default resource limits (conservative initial values)
 */
export const DEFAULT_LIMITS = {
    cpuTime: 10,
    wallTime: 15,
    memory: 256,
    output: 10,
    filesystem: 50,
    processes: 10,
};
