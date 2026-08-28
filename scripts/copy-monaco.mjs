import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(rootDir, 'node_modules', 'monaco-editor', 'min', 'vs');
const targetDir = resolve(rootDir, 'public', 'monaco', 'vs');

if (!existsSync(sourceDir)) {
  throw new Error(`Monaco source directory not found: ${sourceDir}`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

console.log(`Copied Monaco assets to ${targetDir}`);
