import type { SupportedLanguage } from '../types/byteplay';

/**
 * Resolves one project filename to the language used by Monaco, preview,
 * and browser execution dispatch.
 */
export function getLanguageFromFilename(
  filename: string,
): SupportedLanguage {
  const normalizedFilename = filename.trim().toLowerCase();
  const extension = normalizedFilename.includes('.')
    ? normalizedFilename.split('.').pop()
    : undefined;

  switch (extension) {
    case 'c':
      return 'c';

    case 'cc':
    case 'cpp':
    case 'cxx':
    case 'h':
    case 'hh':
    case 'hpp':
      return 'cpp';

    case 'py':
      return 'python';

    case 'html':
    case 'htm':
      return 'html';

    case 'css':
      return 'css';

    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
    case 'ts':
    case 'tsx':
      return 'javascript';

    case 'sql':
      return 'sql';

    default:
      return 'plaintext';
  }
}

/**
 * Returns true when a file should render in the sandboxed browser preview.
 */
export function isPreviewLanguage(
  language: SupportedLanguage,
): boolean {
  return (
    language === 'html' ||
    language === 'css' ||
    language === 'javascript'
  );
}

/**
 * Returns true when a language has a dedicated local execution worker.
 */
export function isExecutableLanguage(
  language: SupportedLanguage,
): boolean {
  return (
    language === 'c' ||
    language === 'cpp' ||
    language === 'python'
  );
}