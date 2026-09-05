import type { FileItem } from '../types/byteplay';

export interface WebPreviewDiagnostic {
  fileName: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface WebPreviewResult {
  document: string;
  entryFileName: string;
  diagnostics: WebPreviewDiagnostic[];
}

const HTML_ENTRYPOINTS = [
  'index.html',
  'index.htm',
  'main.html',
];

const normalizePath = (value: string): string => {
  const withoutQuery = value.split(/[?#]/, 1)[0] ?? '';
  const normalized = withoutQuery
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '');

  const parts: string[] = [];

  for (const part of normalized.split('/')) {
    if (!part || part === '.') {
      continue;
    }

    if (part === '..') {
      parts.pop();
      continue;
    }

    parts.push(part);
  }

  return parts.join('/');
};

const isExternalReference = (value: string): boolean =>
  /^(?:[a-z][a-z\d+\-.]*:|\/\/|#)/i.test(value);

const getDirectory = (fileName: string): string => {
  const normalized = normalizePath(fileName);
  const separatorIndex = normalized.lastIndexOf('/');

  return separatorIndex === -1
    ? ''
    : normalized.slice(0, separatorIndex + 1);
};

const resolveReference = (
  ownerFileName: string,
  reference: string,
): string =>
  normalizePath(
    `${getDirectory(ownerFileName)}${reference.trim()}`,
  );

const createFileMap = (
  files: FileItem[],
): Map<string, FileItem> => {
  const fileMap = new Map<string, FileItem>();

  for (const file of files) {
    fileMap.set(normalizePath(file.name), file);
  }

  return fileMap;
};

const findEntryFile = (
  files: FileItem[],
  requestedEntryPoint?: string,
): FileItem | undefined => {
  const fileMap = createFileMap(files);

  if (requestedEntryPoint) {
    const requestedFile = fileMap.get(
      normalizePath(requestedEntryPoint),
    );

    if (requestedFile) {
      return requestedFile;
    }
  }

  for (const entryPoint of HTML_ENTRYPOINTS) {
    const entryFile = fileMap.get(entryPoint);

    if (entryFile) {
      return entryFile;
    }
  }

  return files.find((file) => file.language === 'html');
};

const escapeHtmlAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const createInlineStyle = (
  fileName: string,
  content: string,
): string =>
  `<style data-forgebytex-file="${escapeHtmlAttribute(fileName)}">
${content}
</style>`;

const createInlineScript = (
  fileName: string,
  content: string,
): string =>
  `<script data-forgebytex-file="${escapeHtmlAttribute(fileName)}">
${content}
</script>`;

const injectIntoHead = (
  html: string,
  content: string,
): string => {
  if (/<\/head\s*>/i.test(html)) {
    return html.replace(
      /<\/head\s*>/i,
      `${content}\n</head>`,
    );
  }

  return `${content}\n${html}`;
};

const injectBeforeBodyEnd = (
  html: string,
  content: string,
): string => {
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(
      /<\/body\s*>/i,
      `${content}\n</body>`,
    );
  }

  return `${html}\n${content}`;
};

const ensureDocumentStructure = (html: string): string => {
  if (/<html[\s>]/i.test(html)) {
    return html;
  }

  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '</head>',
    '<body>',
    html,
    '</body>',
    '</html>',
  ].join('\n');
};

const addDiagnostic = (
  diagnostics: WebPreviewDiagnostic[],
  diagnostic: WebPreviewDiagnostic,
): void => {
  const alreadyReported = diagnostics.some(
    (existing) =>
      existing.fileName === diagnostic.fileName &&
      existing.message === diagnostic.message,
  );

  if (!alreadyReported) {
    diagnostics.push(diagnostic);
  }
};

const injectReferencedStyles = (
  html: string,
  entryFile: FileItem,
  fileMap: Map<string, FileItem>,
  diagnostics: WebPreviewDiagnostic[],
): string => {
  const referencedFiles = new Set<string>();

  const result = html.replace(
    /<link\b[^>]*\bhref\s*=\s*(['"])(.*?)\1[^>]*>/gi,
    (...match: [string, string, string]) => {
      const [fullTag, , rawReference] = match;

      const relationMatch = fullTag.match(
        /\brel\s*=\s*(['"])(.*?)\1/i,
      );

      const relation = relationMatch?.[2].toLowerCase();

      if (
        relation !== 'stylesheet' ||
        isExternalReference(rawReference)
      ) {
        return fullTag;
      }

      const resolvedName = resolveReference(
        entryFile.name,
        rawReference,
      );
      const referencedFile = fileMap.get(resolvedName);

      if (!referencedFile) {
        addDiagnostic(diagnostics, {
          fileName: entryFile.name,
          message: `Stylesheet "${rawReference}" was not found in the project.`,
          severity: 'error',
        });

        return fullTag;
      }

      referencedFiles.add(resolvedName);

      return createInlineStyle(
        referencedFile.name,
        referencedFile.content,
      );
    },
  );

  const extraStyles = Array.from(fileMap.values())
    .filter(
      (file) =>
        file.language === 'css' &&
        !referencedFiles.has(normalizePath(file.name)),
    )
    .map((file) => createInlineStyle(file.name, file.content))
    .join('\n');

  return extraStyles
    ? injectIntoHead(result, extraStyles)
    : result;
};

const injectReferencedScripts = (
  html: string,
  entryFile: FileItem,
  fileMap: Map<string, FileItem>,
  diagnostics: WebPreviewDiagnostic[],
): string => {
  const referencedFiles = new Set<string>();

  const result = html.replace(
    /<script\b([^>]*)\bsrc\s*=\s*(['"])(.*?)\2([^>]*)>\s*<\/script\s*>/gis,
    (
      fullTag,
      beforeAttributes: string,
      _quote: string,
      rawReference: string,
      afterAttributes: string,
    ) => {
      if (isExternalReference(rawReference)) {
        return fullTag;
      }

      const resolvedName = resolveReference(
        entryFile.name,
        rawReference,
      );
      const referencedFile = fileMap.get(resolvedName);

      if (!referencedFile) {
        addDiagnostic(diagnostics, {
          fileName: entryFile.name,
          message: `JavaScript file "${rawReference}" was not found in the project.`,
          severity: 'error',
        });

        return fullTag;
      }

      referencedFiles.add(resolvedName);

      const typeAttribute =
        /\btype\s*=\s*(['"])module\1/i.test(
          `${beforeAttributes}${afterAttributes}`,
        )
          ? ' type="module"'
          : '';

      return createInlineScript(
        referencedFile.name,
        `${typeAttribute}\n${referencedFile.content}`,
      );
    },
  );

  const extraScripts = Array.from(fileMap.values())
    .filter(
      (file) =>
        file.language === 'javascript' &&
        !referencedFiles.has(normalizePath(file.name)),
    )
    .map((file) => createInlineScript(file.name, file.content))
    .join('\n');

  return extraScripts
    ? injectBeforeBodyEnd(result, extraScripts)
    : result;
};

export const buildWebPreview = (
  files: FileItem[],
  requestedEntryPoint?: string,
): WebPreviewResult => {
  const diagnostics: WebPreviewDiagnostic[] = [];
  const entryFile = findEntryFile(files, requestedEntryPoint);

  if (!entryFile) {
    return {
      document: '',
      entryFileName: '',
      diagnostics: [
        {
          fileName: requestedEntryPoint ?? 'index.html',
          message:
            'No HTML entrypoint was found. Create an index.html file to start a web project.',
          severity: 'error',
        },
      ],
    };
  }

  const fileMap = createFileMap(files);
  let document = ensureDocumentStructure(entryFile.content);

  document = injectReferencedStyles(
    document,
    entryFile,
    fileMap,
    diagnostics,
  );

  document = injectReferencedScripts(
    document,
    entryFile,
    fileMap,
    diagnostics,
  );

  return {
    document,
    entryFileName: entryFile.name,
    diagnostics,
  };
};

export const isWebProjectFile = (
  file: Pick<FileItem, 'language'>,
): boolean =>
  file.language === 'html' ||
  file.language === 'css' ||
  file.language === 'javascript';