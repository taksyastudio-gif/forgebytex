# ForgeByteX Execution Core - Architecture Documentation

## Overview

The ForgeByteX Execution Core is a native sandboxed execution engine for C and Python code. It provides a reliable, secure foundation for running untrusted code with real stdin/stdout/stderr handling, resource limits, and proper sandboxing using Isolate on Linux.

## Architecture

### Components

```
execution-core/
├── ExecutionManager.ts    # Orchestrates language executors
├── executors/
│   ├── CExecutor.ts       # C compilation and execution with GCC
│   └── PythonExecutor.ts   # Python execution with CPython
├── types.ts               # Core type definitions
├── config.ts              # Configuration and limits
├── execution-protocol.ts  # Shared execution protocol
├── index.ts               # Module exports
├── cli.ts                 # CLI test interface
└── tests/
    ├── CExecutor.test.ts  # C test suite (25 tests)
    └── PythonExecutor.test.ts  # Python test suite (17 tests)
```

### Execution Flow

#### Non-Interactive Execution

1. **Request**: `ExecutionRequest` with source code, language, mode, and limits
2. **Manager**: `ExecutionManager` routes to appropriate executor
3. **Compilation (C only)**:
   - Write source to temporary workspace
   - Initialize Isolate sandbox (`isolate --init`)
   - Compile with GCC inside sandbox
   - Cleanup on error
4. **Execution**:
   - Run binary/script with Isolate (`isolate --run -- program`)
   - Enforce resource limits via Isolate flags
   - Capture stdout/stderr with output limiting
   - Cleanup sandbox (`isolate --cleanup`)
5. **Result**: `ExecutionResult` with status, outputs, exit code, diagnostics

#### Interactive Execution

1. **Process Creation**: `createInteractiveProcess()` spawns live process
2. **Real stdin/stdout**: Direct pipe to process streams
3. **No replay**: Single live process, no state reconstruction
4. **Cleanup**: Automatic on process termination or explicit stop

### Isolate Integration

**Lifecycle**:
1. `isolate --box-id=forgebyteX --init` - Creates sandbox directory
2. `isolate --box-id=forgebyteX --run -- program args` - Executes in sandbox
3. `isolate --box-id=forgebyteX --cleanup` - Removes sandbox

**Resource Limits** (converted to KB for Isolate):
- `--mem`: Address space limit (memory * 1024 KB)
- `--time`: CPU time limit (seconds)
- `--wall-time`: Wall clock time limit (seconds)
- `--extra-time`: Grace period after limit (seconds)
- `--fsize`: Output file size limit (output * 1024 KB)
- `--processes`: Max process/thread count
- `--cg`: Enable control groups
- `--cg-mem`: Control group memory limit
- `--dir`: Directory bindings (workspace:rw, /box)

**Network Isolation**: Default network namespace prevents external communication

## Security Model

### Sandbox Boundaries

**Isolate provides**:
- **Process isolation**: Separate PID namespace
- **Filesystem isolation**: Only specified directories accessible
- **Network isolation**: No network devices (except loopback)
- **Resource limits**: CPU, memory, output, processes enforced
- **Control groups**: Multi-process resource tracking

**Default directory bindings**:
- `/bin`, `/lib`, `/lib64`, `/usr` (read-only, no devices)
- `/dev` (devices allowed)
- `/proc` (proc filesystem)
- `/box` (read-write working directory)
- Workspace directory (read-write)

### Threat Mitigation

**Prevented attacks**:
- File system access outside sandbox
- Network communication
- System calls via `system()`, `exec()`
- Privilege escalation
- Resource exhaustion (limits enforced)
- Output flooding (10 MB limit per stream)

**Assumptions**:
- Isolate is correctly installed and configured
- Kernel supports required namespaces (PID, IPC, NET)
- Control groups are mounted and configured
- Isolate binary runs as setuid root
- UID ranges are properly configured

### Resource Limits

**Default limits**:
- CPU time: 10 seconds
- Wall time: 15 seconds
- Memory: 256 MB
- Output: 10 MB (per stream)
- Filesystem: 50 MB
- Processes: 10

**Enforcement**:
- Isolate enforces at kernel level
- Output limiting at application level (10 MB per stream)
- Process killed on limit exceedance
- Status indicates limit type (timeout, memory-limit, output-limit)

## Execution Lifecycle

### Status Transitions

```
idle → preparing → compiling (C only) → running → completed
                    ↓                  ↓
                compile-error      failed / timeout / memory-limit / 
                                      process-limit / output-limit
```

### Status Values

- `idle`: No execution in progress
- `preparing`: Setting up workspace and sandbox
- `compiling`: C compilation in progress
- `compile-error`: Compilation failed
- `running`: Program executing
- `completed`: Normal termination
- `failed`: Non-zero exit code
- `timeout`: Time limit exceeded
- `memory-limit`: Memory limit exceeded
- `process-limit`: Process limit exceeded
- `output-limit`: Output size exceeded
- `sandbox-error`: Isolate sandbox failure
- `infrastructure-error`: System error

### Cleanup Guarantees

**Always cleanup**:
- Temporary workspace directories
- Isolate sandbox boxes
- Interactive processes

**Cleanup triggers**:
- Normal completion
- Error conditions
- Explicit stop
- Process termination
- Infrastructure errors

## Stdin Semantics

### Non-Interactive

- Single input string provided in request
- Fed to process stdin before execution
- Process reads until EOF
- No further interaction possible

### Interactive

- Real stdin pipe to live process
- `write()` sends data to process stdin
- `read()` retrieves accumulated stdout
- Process stays alive until stop() or natural exit
- No replay or state reconstruction

### Limitations

- No pseudo-terminal (TTY) emulation
- Line-buffered input only
- No terminal control sequences
- Process may block waiting for input

## Platform Requirements

### Linux (Production)

**Required kernel features**:
- CONFIG_PID_NS (PID namespaces)
- CONFIG_IPC_NS (IPC namespaces)
- CONFIG_NET_NS (network namespaces)
- CONFIG_CPUSETS (cpusets)
- CONFIG_CGROUP_CPUACCT (CPU accounting)
- CONFIG_MEMCG (memory controller)
- CONFIG_MEMCG_SWAP (swap controller)

**Required system configuration**:
- Isolate installed and setuid root
- Cgroup filesystem mounted at `/sys/fs/cgroup`
- UID ranges configured in Isolate
- Memory and swap controllers enabled (Debian: `cgroup_enable=memory swapaccount=1`)

### Windows (Development)

**Fallback mode**:
- No Isolate sandboxing
- Direct process execution with Node.js spawn
- Resource limits not enforced
- For development and testing only
- **Not for production use**

## Known Limitations

### Security

1. **No TTY emulation**: Interactive programs expecting terminals may behave unexpectedly
2. **No signal handling**: Limited signal support in sandbox
3. **Shared UID space**: Multiple concurrent sandboxes need different box IDs
4. **Kernel dependencies**: Requires specific kernel features
5. **Setuid requirement**: Isolate must run as root

### Functionality

1. **No multi-file compilation**: Single source file only for C
2. **No external libraries**: Only standard library available
3. **No network access**: Completely isolated (intentional)
4. **No file persistence**: Sandbox is ephemeral
5. **No database access**: No external services

### Performance

1. **Sandbox overhead**: Isolate adds startup latency (~50-100ms)
2. **Memory overhead**: Control groups add memory overhead
3. **Process overhead**: Each execution creates new sandbox
4. **No caching**: No compilation or execution caching

### Platform

1. **Linux only**: Isolate requires Linux kernel
2. **x86_64 primary**: Other architectures may have issues
3. **Specific kernel versions**: Requires modern kernel (3.8+)

## Development vs Production

### Development Mode (Windows/No Isolate)

- Direct process execution
- No resource limits
- No sandboxing
- For local testing only
- **Security warning**: Unsafe for untrusted code

### Production Mode (Linux with Isolate)

- Full sandboxing
- Resource limits enforced
- Network isolation
- Safe for untrusted code
- Required for production deployment

## Testing

### Test Coverage

**C Executor (25 tests)**:
- 10 basic execution tests
- 3 compilation error tests
- 3 runtime error tests
- 3 resource limit tests
- 3 stdin handling tests
- 3 security scenario tests
- 1 interactive process test

**Python Executor (17 tests)**:
- 10 basic execution tests
- 3 runtime error tests
- 3 resource limit tests
- 1 stdin handling test
- 1 interactive process test

### Running Tests

```bash
cd execution-core
npm test
```

### CLI Testing

```bash
# Execute C code
node cli.ts execute --language c --source '#include <stdio.h>\nint main() { printf("Hello"); return 0; }'

# Execute Python code
node cli.ts execute --language python --source 'print("Hello")'

# Interactive session
node cli.ts interactive --language python --source 'x = int(input()); print(x * 2)'

# Check status
node cli.ts status
```

## Integration Points

### Backend Integration

The execution core can be integrated into the existing backend:

```typescript
import { ExecutionManager } from './execution-core/index.js';

const executionManager = new ExecutionManager();

// Execute code
const result = await executionManager.execute({
  language: 'c',
  source: '...',
  mode: 'non-interactive',
  limits: { ... },
});

// Create interactive process
const process = await executionManager.createInteractiveProcess({
  language: 'python',
  source: '...',
  mode: 'interactive',
});
```

### Frontend Integration (Phase 2+)

The execution core is designed to be independent. Frontend integration will be handled in later phases through the existing WebSocket-based event streaming mechanism in `backend/server.js`.

## Troubleshooting

### Isolate Issues

**Problem**: `Isolate init failed`
- Check Isolate installation: `isolate --version`
- Verify setuid root: `ls -l $(which isolate)`
- Check UID configuration in Isolate source

**Problem**: Control groups not working
- Verify cgroup mount: `mount | grep cgroup`
- Check kernel config: `CONFIG_CGROUP_*`
- Enable memory controller (Debian): Add `cgroup_enable=memory swapaccount=1` to GRUB

### Compilation Issues

**Problem**: GCC not found
- Check GCC installation: `gcc --version`
- Update path in config: `GCC_PATH=/usr/bin/gcc`
- Install GCC: `apt-get install gcc`

**Problem**: Python not found
- Check Python installation: `python3 --version`
- Update path in config: `PYTHON_PATH=/usr/bin/python3`
- Install Python: `apt-get install python3`

### Resource Limit Issues

**Problem**: Limits not enforced
- Verify Isolate control groups enabled
- Check `--cg` flag in buildIsolateArgs
- Verify limit values (convert MB to KB)

### Output Limiting

**Problem**: Output limit not triggered
- Check output size calculation (bytes vs KB)
- Verify 10 MB limit in spawnProcess
- Check for outputLimitExceeded flag

## Future Enhancements (Out of Phase 1 Scope)

- Multi-file compilation support
- External library linking
- Persistent file storage
- Compilation caching
- Execution caching
- TTY emulation for interactive programs
- Signal handling improvements
- Docker-based sandboxing alternative
- Windows sandboxing support
- Metrics and monitoring
- Distributed execution
