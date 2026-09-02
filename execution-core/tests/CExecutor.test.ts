/**
 * Comprehensive test suite for C Executor
 * 
 * Tests cover:
 * - Basic execution
 * - Compilation errors
 * - Runtime errors
 * - Resource limits
 * - Stdin handling
 * - Output limiting
 * - Security scenarios
 */

import { CExecutor } from '../executors/CExecutor.js';
import { detectIsolate } from '../config.js';
import { ExecutionRequest } from '../types.js';

describe('CExecutor', () => {
  let executor: CExecutor;
  const hasIsolate = detectIsolate();

  beforeAll(() => {
    executor = new CExecutor();
  });

  describe('Basic Execution', () => {
    test('1. Hello World', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    printf("Hello, World!\\n");
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Hello, World!');
      expect(result.exitCode).toBe(0);
    });

    test('2. Simple arithmetic', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    int a = 10, b = 5;
    printf("%d\\n", a + b);
    printf("%d\\n", a - b);
    printf("%d\\n", a * b);
    printf("%d\\n", a / b);
    return 0;
}
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
        language: 'c',
        source: `
#include <stdio.h>
#include <string.h>
int main() {
    char str[] = "Hello";
    printf("%zu\\n", strlen(str));
    printf("%s\\n", str);
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('5');
      expect(result.stdout).toContain('Hello');
    });

    test('4. Array operations', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    int arr[5] = {1, 2, 3, 4, 5};
    int sum = 0;
    for (int i = 0; i < 5; i++) {
        sum += arr[i];
    }
    printf("%d\\n", sum);
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('15');
    });

    test('5. Loop constructs', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    for (int i = 0; i < 3; i++) {
        printf("%d ", i);
    }
    printf("\\n");
    int j = 0;
    while (j < 3) {
        printf("%d ", j);
        j++;
    }
    printf("\\n");
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('0 1 2');
    });

    test('6. Conditional statements', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    int x = 10;
    if (x > 5) {
        printf("greater\\n");
    } else {
        printf("smaller\\n");
    }
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('greater');
    });

    test('7. Functions', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int square(int n) {
    return n * n;
}
int main() {
    printf("%d\\n", square(5));
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('25');
    });

    test('8. Pointers', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    int x = 10;
    int *ptr = &x;
    printf("%d\\n", *ptr);
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('10');
    });

    test('9. Structs', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
struct Point {
    int x;
    int y;
};
int main() {
    struct Point p = {3, 4};
    printf("%d\\n", p.x + p.y);
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('7');
    });

    test('10. Recursion', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}
int main() {
    printf("%d\\n", factorial(5));
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('120');
    });
  });

  describe('Compilation Errors', () => {
    test('11. Syntax error', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    printf("Hello"  // Missing semicolon
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(false);
      expect(result.status).toBe('compile-error');
      expect(result.stderr).toBeTruthy();
    });

    test('12. Undefined reference', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    nonexistent_function();
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(false);
      expect(result.status).toBe('compile-error');
    });

    test('13. Missing header', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
int main() {
    printf("Hello\\n");  // No stdio.h included
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(false);
      expect(result.status).toBe('compile-error');
    });
  });

  describe('Runtime Errors', () => {
    test('14. Division by zero', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    int x = 10 / 0;
    printf("%d\\n", x);
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
    });

    test('15. Null pointer dereference', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    int *ptr = NULL;
    *ptr = 10;
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(false);
    });

    test('16. Stack overflow (deep recursion)', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
void recurse(int n) {
    if (n > 0) recurse(n + 1);
}
int main() {
    recurse(1);
    return 0;
}
        `,
        mode: 'non-interactive',
        limits: {
          cpuTime: 2,
          wallTime: 3,
          memory: 64,
          output: 1,
          filesystem: 10,
          processes: 1,
        },
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(false);
    });
  });

  describe('Resource Limits', () => {
    test('17. Timeout handling', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    while (1) {}
    return 0;
}
        `,
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

    test('18. Memory limit', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdlib.h>
#include <stdio.h>
int main() {
    // Try to allocate more than limit
    void *ptr = malloc(100 * 1024 * 1024);  // 100 MB
    if (ptr) {
        printf("Allocated\\n");
        free(ptr);
    } else {
        printf("Failed\\n");
    }
    return 0;
}
        `,
        mode: 'non-interactive',
        limits: {
          cpuTime: 5,
          wallTime: 10,
          memory: 32,  // 32 MB limit
          output: 1,
          filesystem: 10,
          processes: 1,
        },
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(false);
    });

    test('19. Output limit', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    for (int i = 0; i < 1000000; i++) {
        printf("Hello World! ");
    }
    return 0;
}
        `,
        mode: 'non-interactive',
        limits: {
          cpuTime: 10,
          wallTime: 15,
          memory: 256,
          output: 1,  // 1 MB limit
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
    test('20. Simple stdin', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    int x;
    scanf("%d", &x);
    printf("%d\\n", x * 2);
    return 0;
}
        `,
        mode: 'non-interactive',
        stdin: '21\n',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('42');
    });

    test('21. Multiple stdin inputs', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    int a, b, c;
    scanf("%d %d %d", &a, &b, &c);
    printf("%d\\n", a + b + c);
    return 0;
}
        `,
        mode: 'non-interactive',
        stdin: '10 20 30\n',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('60');
    });

    test('22. String stdin', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    char str[100];
    scanf("%s", str);
    printf("%s\\n", str);
    return 0;
}
        `,
        mode: 'non-interactive',
        stdin: 'Hello\n',
      };

      const result = await executor.execute(request);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Hello');
    });
  });

  describe('Security Scenarios', () => {
    test('23. File system access (should be restricted)', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    FILE *f = fopen("/etc/passwd", "r");
    if (f) {
        printf("File opened\\n");
        fclose(f);
    } else {
        printf("File not accessible\\n");
    }
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      // In sandbox, file should not be accessible
      if (hasIsolate) {
        expect(result.stdout).toContain('File not accessible');
      }
    });

    test('24. System call attempt', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdlib.h>
int main() {
    system("ls");
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      // System calls should be restricted in sandbox
      if (hasIsolate) {
        expect(result.success).toBe(false);
      }
    });

    test('25. Network access attempt', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
#include <sys/socket.h>
#include <netinet/in.h>
int main() {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock > 0) {
        printf("Socket created\\n");
    } else {
        printf("Socket failed\\n");
    }
    return 0;
}
        `,
        mode: 'non-interactive',
      };

      const result = await executor.execute(request);
      // Network should be blocked in sandbox
      if (hasIsolate) {
        expect(result.success).toBe(false);
      }
    });
  });

  describe('Interactive Process', () => {
    test('Interactive process creation', async () => {
      const request: ExecutionRequest = {
        language: 'c',
        source: `
#include <stdio.h>
int main() {
    int x;
    scanf("%d", &x);
    printf("%d\\n", x * 2);
    return 0;
}
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
  });
});
