import type * as monaco from 'monaco-editor';

export interface CompilerDiagnostic {
  line: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  file?: string;
}

/**
 * Converts internal diagnostic objects into Monaco IMarkerData formats.
 */
export const mapDiagnosticsToMarkers = (
  monacoInstance: typeof monaco,
  editorModel: monaco.editor.ITextModel,
  diagnostics: CompilerDiagnostic[]
): monaco.editor.IMarkerData[] => {
  return diagnostics.map((diag) => {
    const lineCount = editorModel.getLineCount();
    const targetLine = Math.min(Math.max(diag.line, 1), lineCount);
    const lineMaxCol = editorModel.getLineMaxColumn(targetLine);
    
    const startCol = diag.column ? Math.min(Math.max(diag.column, 1), lineMaxCol) : 1;
    const endCol = diag.column ? Math.min(startCol + 1, lineMaxCol) : lineMaxCol;

    let severity: monaco.MarkerSeverity;
    switch (diag.severity) {
      case 'warning':
        severity = monacoInstance.MarkerSeverity.Warning;
        break;
      case 'info':
        severity = monacoInstance.MarkerSeverity.Info;
        break;
      case 'error':
      default:
        severity = monacoInstance.MarkerSeverity.Error;
        break;
    }

    return {
      startLineNumber: targetLine,
      startColumn: startCol,
      endLineNumber: targetLine,
      endColumn: endCol,
      message: diag.message,
      severity,
      source: 'forgebyteX Compiler',
    };
  });
};

/**
 * Clears all forgebyteX-generated markers from the current model.
 */
export const clearMonacoMarkers = (
  monacoInstance: typeof monaco,
  editorModel: monaco.editor.ITextModel
) => {
  monacoInstance.editor.setModelMarkers(editorModel, 'forgebytex', []);
};

/**
 * Applies diagnostic markers to a given model.
 */
export const setMonacoMarkers = (
  monacoInstance: typeof monaco,
  editorModel: monaco.editor.ITextModel,
  diagnostics: CompilerDiagnostic[]
) => {
  const markers = mapDiagnosticsToMarkers(monacoInstance, editorModel, diagnostics);
  monacoInstance.editor.setModelMarkers(editorModel, 'byteplay', markers);
};