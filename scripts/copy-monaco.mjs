import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(rootDir, 'node_modules', 'monaco-editor', 'min', 'vs');
const targetDir = resolve(rootDir, 'public', 'monaco', 'vs');

if (!existsSync(sourceDir)) {
  throw new Error(`Monaco source directory not found: ${sourceDir}`);
}

const EXCLUDED_LANGUAGE_PREFIXES = [
  'abap-', 'apex-', 'azcli-', 'bat-', 'bicep-', 'cameligo-', 'clojure-',
  'coffee-', 'csharp-', 'csp-', 'cypher-', 'dart-', 'dockerfile-', 'ecl-',
  'elixir-', 'flow9-', 'freemarker2-', 'fsharp-', 'go-', 'graphql-',
  'handlebars-', 'hcl-', 'ini-', 'java-', 'julia-', 'kotlin-', 'less-',
  'lexon-', 'liquid-', 'lua-', 'm3-', 'markdown-', 'mdx-', 'mips-', 'msdax-',
  'mysql-', 'objective-c-', 'pascal-', 'pascaligo-', 'perl-', 'pgsql-',
  'php-', 'pla-', 'postiats-', 'powerquery-', 'powershell-', 'protobuf-',
  'pug-', 'qsharp-', 'r-', 'razor-', 'redis-', 'redshift-', 'restructuredtext-',
  'ruby-', 'rust-', 'sb-', 'scala-', 'scheme-', 'scss-', 'shell-', 'solidity-',
  'sophia-', 'sparql-', 'st-', 'swift-', 'systemverilog-', 'tcl-', 'twig-',
  'typespec-', 'vb-', 'wgsl-', 'xml-', 'yaml-',
];

function shouldCopy(src) {
  const stat = statSync(src);
  if (stat.isDirectory()) {
    return true;
  }
  const file = basename(src);
  for (const prefix of EXCLUDED_LANGUAGE_PREFIXES) {
    if (file.startsWith(prefix)) {
      return false;
    }
  }
  return true;
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true, filter: shouldCopy });

console.log(`Copied Monaco assets to ${targetDir}`);
