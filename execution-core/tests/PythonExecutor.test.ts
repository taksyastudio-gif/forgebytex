/**
 * Comprehensive test suite for Python Executor
 * 
 * Tests cover:
 * - Basic execution
 * - Runtime errors
 * - Resource limits
 * - Stdin handling
 * - Output limiting
 * - Security scenarios
 */

import { PythonExecutor } from '../executors/PythonExecutor.js';
import type { ExecutionRequest } from '../types.js';
import { detectIsolate } from '../config.js';

describe('PythonExecutor', () => {
  let executor: PythonExecutor;
  const hasIsolate = detectIsolate();
  beforeAll(() => {
    executor = new PythonExecutor();
  });

  describe('Basic Execution', () => {
    test('1. Hello World', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `print("Hello, World!")`,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Hello, World!');
      expect(result.exitCode).toBe(0);
    });

    test('2. Simple arithmetic', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `
a = 10
b = 5
print(a + b)
print(a - b)
print(a * b)
print(a // b)
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('15');
      expect(result.stdout).toContain('5');
      expect(result.stdout).toContain('50');
      expect(result.stdout).toContain('2');
    });

    test('3. String manipulation', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `
s = "Hello"
print(len(s))
print(s.upper())
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('5');
      expect(result.stdout).toContain('HELLO');
    });

    test('4. List operations', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `
arr = [1, 2, 3, 4, 5]
print(sum(arr))
print(max(arr))
print(min(arr))
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('15');
      expect(result.stdout).toContain('5');
      expect(result.stdout).toContain('1');
    });

    test('5. Loop constructs', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `
for i in range(3):
    print(i, end=' ')
print()
j = 0
while j < 3:
    print(j, end=' ')
    j += 1
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('0 1 2');
    });

    test('6. Conditional statements', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `
x = 10
if x > 5:
    print("greater")
else:
    print("smaller")
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('greater');
    });

    test('7. Functions', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `
def square(n):
    return n * n
print(square(5))
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('25');
    });

    test('8. Dictionary operations', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `
d = {'a': 1, 'b': 2}
print(d['a'] + d['b'])
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('3');
    });

    test('9. Recursion', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
print(factorial(5))
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('120');
    });

    test('10. Exception handling', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `
try:
    x = 1 / 0
except ZeroDivisionError:
    print("Caught error")
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Caught error');
    });
  });

  describe('Runtime Errors', () => {
    test('11. Division by zero (unhandled)', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `x = 1 / 0`,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.stderr).toContain('ZeroDivisionError');
    });

    test('12. Name error', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `print(undefined_variable)`,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.stderr).toContain('NameError');
    });

    test('13. Type error', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `print("5" + 5)`,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.stderr).toContain('TypeError');
    });
  });

  describe('Resource Limits', () => {
    (hasIsolate ? test : test.skip)('14. Timeout handling', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `while True: pass`,
        mode: 'non-interactive',
        limits: {
          cpuTime: 1,
          wallTime: 2,
          memory: 64,
          output: 1,
          filesystem: 10,
          processes: 1,
        },
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(false);
    });

    (hasIsolate ? test : test.skip)('15. Memory limit', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `
# Try to allocate more than limit
data = [0] * (100 * 1024 * 1024)  # 100 MB
print("Allocated")
        `,
        mode: 'non-interactive',
        limits: {
          cpuTime: 5,
          wallTime: 10,
          memory: 32,
          output: 1,
          filesystem: 10,
          processes: 1,
        },
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(false);
    });

    test('16. Output limit', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `
for i in range(1000000):
    print("Hello World! ", end='')
        `,
        mode: 'non-interactive',
        limits: {
          cpuTime: 10,
          wallTime: 15,
          memory: 256,
          output: 1,
          filesystem: 10,
          processes: 1,
        },
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('Output limit exceeded');
    });
  });

  describe('Stdin Handling', () => {
    test('17. Simple stdin', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `
x = int(input())
print(x * 2)
        `,
        mode: 'non-interactive',
        stdin: '21\n',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('42');
    });
  });

  describe('Interactive Process', () => {
    (hasIsolate ? test : test.skip)('Interactive process creation', async () => {
      const request: ExecutionRequest = {
        language: 'python',
        source: `
x = int(input())
print(x * 2)
        `,
        mode: 'interactive',
      };

      const process = await executor.createInteractiveProcess(request);
      expect(process).toBeDefined();
      expect(process.isAlive()).toBe(true);
      
      process.write('21\n');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const output = process.read();
      process.stop();
      
      expect(output).toContain('42');
    });

    test('input supports waiting and multiple inputs without disabling timeout', async () => {
      const events: string[] = [];
      const process = await executor.createInteractiveProcess({
        language: 'python',
        source: `
a = int(input("A: "))
b = int(input("B: "))
print(a + b)
        `,
        mode: 'interactive',
        limits: { wallTime: 2 },
      }, {
        onExit: (result) => events.push(`${result.status}:${result.stdout}`),
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      process.write('2\n');
      await new Promise(resolve => setTimeout(resolve, 100));
      process.write('3\n');
      await new Promise(resolve => setTimeout(resolve, 250));

      expect(events.join('')).toContain('completed:A: B: 5');
    });

    test('input not reached still times out', async () => {
      const result = await new Promise<{ status: string }>(async (resolve) => {
        await executor.createInteractiveProcess({
          language: 'python',
          source: `
while True:
    pass
value = input()
          `,
          mode: 'interactive',
          limits: { wallTime: 1 },
        }, { onExit: (value) => resolve(value) });
      });

      expect(result.status).toBe('timeout');
    });
  });
});
