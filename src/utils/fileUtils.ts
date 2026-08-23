import type { SupportedLanguage } from '../types/byteplay';

export function getLanguageFromFilename(filename: string): SupportedLanguage {
  if (filename.endsWith('.c')) return 'c';
  if (filename.endsWith('.html') || filename.endsWith('.htm')) return 'html';
  if (filename.endsWith('.py')) return 'python';
  if (filename.endsWith('.sql')) return 'sql';
  return 'plaintext';
}