import type * as monaco from 'monaco-editor';

const MARKER_OWNER = 'forgebytex';
const MARKER_SOURCE = 'VLNTOX Error Doctor';

export interface CompilerDiagnostic {
  line: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  file?: string;
}

/**
 * Converts normalized diagnostics into bounded Monaco marker data.
 */
export const mapDiagnosticsToMarkers = (
  monacoInstance: typeof monaco,
  editorModel: monaco.editor.ITextModel,
  diagnostics: CompilerDiagnostic[],
): monaco.editor.IMarkerData[] => {
  const lineCount = Math.max(editorModel.getLineCount(), 1);

  return diagnostics.map((diagnostic) => {
    const lineNumber = clamp(
      diagnostic.line,
      1,
      lineCount,
    );
    const lineMaxColumn = Math.max(
      editorModel.getLineMaxColumn(lineNumber),
      1,
    );
    const startColumn = clamp(
      diagnostic.column ?? 1,
      1,
      lineMaxColumn,
    );
    const endColumn = Math.min(
      startColumn + 1,
      lineMaxColumn,
    );

    return {
      startLineNumber: lineNumber,
      startColumn,
      endLineNumber: lineNumber,
      endColumn: Math.max(endColumn, startColumn),
      message: formatDiagnosticMessage(diagnostic),
      severity: getMarkerSeverity(
        monacoInstance,
        diagnostic.severity,
      ),
      source: MARKER_SOURCE,
    };
  });
};

/**
 * Clears only the markers owned by VLNTOX.
 */
export const clearMonacoMarkers = (
  monacoInstance: typeof monaco,
  editorModel: monaco.editor.ITextModel,
): void => {
  monacoInstance.editor.setModelMarkers(
    editorModel,
    MARKER_OWNER,
    [],
  );
};

/**
 * Applies normalized diagnostics to a Monaco model.
 */
export const setMonacoMarkers = (
  monacoInstance: typeof monaco,
  editorModel: monaco.editor.ITextModel,
  diagnostics: CompilerDiagnostic[],
): void => {
  monacoInstance.editor.setModelMarkers(
    editorModel,
    MARKER_OWNER,
    mapDiagnosticsToMarkers(
      monacoInstance,
      editorModel,
      diagnostics,
    ),
  );
};

function formatDiagnosticMessage(
  diagnostic: CompilerDiagnostic,
): string {
  const filePrefix = diagnostic.file
    ? `${diagnostic.file}: `
    : '';

  return `${filePrefix}${diagnostic.message}`;
}

function getMarkerSeverity(
  monacoInstance: typeof monaco,
  severity: CompilerDiagnostic['severity'],
): monaco.MarkerSeverity {
  switch (severity) {
    case 'warning':
      return monacoInstance.MarkerSeverity.Warning;
    case 'info':
      return monacoInstance.MarkerSeverity.Info;
    case 'error':
    default:
      return monacoInstance.MarkerSeverity.Error;
  }
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(
    Math.max(Math.trunc(value), minimum),
    maximum,
  );
}