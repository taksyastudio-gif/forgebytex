#!/usr/bin/env node

/**
 * CLI Test Interface for ForgeByteX Execution Core
 * 
 * This CLI allows testing the execution engine independently without the frontend.
 * Usage:
 *   node cli.ts execute --language c --source "code.c"
 *   node cli.ts execute --language python --source "code.py"
 *   node cli.ts interactive --language c --source "code.c"
 */

import { ExecutionManager } from './ExecutionManager.js';
import { detectIsolate } from './config.js';
import type { ExecutionRequest } from './types.js';

const executionManager = new ExecutionManager();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exit(1);
  }

  try {
    switch (command) {
      case 'execute':
        await handleExecute(args.slice(1));
        break;
      case 'interactive':
        await handleInteractive(args.slice(1));
        break;
      case 'status':
        handleStatus();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function printUsage() {
  console.log(`
ForgeByteX Execution Core CLI

Usage:
  node cli.ts execute --language <c|python> --source <code> [options]
  node cli.ts interactive --language <c|python> --source <code>
  node cli.ts status

Options:
  --language, -l    Language (c or python)
  --source, -s      Source code (string)
  --stdin           Input for stdin (string)
  --file            Read source from file
  --cpu-time        CPU time limit in seconds (default: 10)
  --wall-time       Wall time limit in seconds (default: 15)
  --memory          Memory limit in MB (default: 256)
  --output          Output limit in MB (default: 10)

Examples:
  node cli.ts execute --language c --source '#include <stdio.h>\\nint main() { printf("Hello"); return 0; }'
  node cli.ts execute --language python --source 'print("Hello")'
  node cli.ts execute --language c --file hello.c
  node cli.ts status
  `);
}

async function handleExecute(args: string[]) {
  const language = parseArg(args, '--language', '-l') as 'c' | 'python';
  const source = parseArg(args, '--source', '-s');
  const file = parseArg(args, '--file');
  const stdin = parseArg(args, '--stdin');
  
  const cpuTime = parseInt(parseArg(args, '--cpu-time') || '10', 10);
  const wallTime = parseInt(parseArg(args, '--wall-time') || '15', 10);
  const memory = parseInt(parseArg(args, '--memory') || '256', 10);
  const output = parseInt(parseArg(args, '--output') || '10', 10);

  if (!language) {
    console.error('Error: --language is required');
    process.exit(1);
  }

  let sourceCode = source;
  if (file) {
    const fs = await import('fs');
    sourceCode = fs.readFileSync(file, 'utf8');
  }

  if (!sourceCode) {
    console.error('Error: --source or --file is required');
    process.exit(1);
  }

  const request: ExecutionRequest = {
    language,
    source: sourceCode,
    mode: 'non-interactive',
    stdin,
    limits: {
      cpuTime,
      wallTime,
      memory,
      output,
      filesystem: 50,
      processes: 10,
    },
  };

  console.log(`Executing ${language} code...`);
  console.log('--- Source ---');
  console.log(sourceCode);
  console.log('--- End Source ---\n');

  const result = await executionManager.execute(request, {
    onStatus: (status: string) => console.log(`Status: ${status}`),
  });

  console.log('\n--- Result ---');
  console.log(`Success: ${result.success}`);
  console.log(`Status: ${result.status}`);
  console.log(`Phase: ${result.phase}`);
  console.log(`Exit Code: ${result.exitCode}`);
  console.log(`Signal: ${result.signal}`);
  console.log(`Duration: ${result.duration}ms`);
  
  if (result.stdout) {
    console.log('\n--- Stdout ---');
    console.log(result.stdout);
  }
  
  if (result.stderr) {
    console.log('\n--- Stderr ---');
    console.log(result.stderr);
  }
  
  if (result.diagnostics) {
    console.log('\n--- Diagnostics ---');
    console.log(result.diagnostics);
  }
  
  console.log('--- End Result ---');
  
  process.exit(result.success ? 0 : 1);
}

async function handleInteractive(args: string[]) {
  const language = parseArg(args, '--language', '-l') as 'c' | 'python';
  const source = parseArg(args, '--source', '-s');
  const file = parseArg(args, '--file');

  if (!language) {
    console.error('Error: --language is required');
    process.exit(1);
  }

  let sourceCode = source;
  if (file) {
    const fs = await import('fs');
    sourceCode = fs.readFileSync(file, 'utf8');
  }

  if (!sourceCode) {
    console.error('Error: --source or --file is required');
    process.exit(1);
  }

  const request: ExecutionRequest = {
    language,
    source: sourceCode,
    mode: 'interactive',
  };

  console.log(`Starting interactive ${language} session...`);
  console.log('Type input and press Enter. Type "exit" to quit.\n');

  const interactiveProcess = await executionManager.createInteractiveProcess(request, {
    onStdout: (data: string) => global.process.stdout.write(data),
    onStderr: (data: string) => global.process.stderr.write(data),
  });

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: global.process.stdin,
    output: global.process.stdout,
  });

  rl.on('line', async (line: string) => {
    if (line === 'exit') {
      interactiveProcess.stop();
      rl.close();
      global.process.exit(0);
    }
    
    interactiveProcess.write(line + '\n');
    
    // Wait a bit for output
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const output = interactiveProcess.read();
    if (output) {
      global.process.stdout.write(output);
    }
  });

  // Note: InteractiveProcess doesn't have event emitter interface
  // Process exit is handled by the CLI when user types 'exit' or Ctrl+C
}

function handleStatus() {
  const hasIsolate = detectIsolate();
  
  console.log('\n--- Execution Core Status ---');
  console.log(`Isolate Available: ${hasIsolate ? 'Yes' : 'No (development mode)'}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`Node Version: ${process.version}`);

  const envInfo = executionManager.getEnvironmentInfo();
  console.log(`\nAvailable Languages: ${envInfo.availableLanguages.join(', ')}`);

  console.log('--- End Status ---\n');
}

function parseArg(args: string[], ...names: string[]): string | undefined {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index !== -1 && index + 1 < args.length) {
      return args[index + 1];
    }
  }
  return undefined;
}

main();
