import type * as monaco from 'monaco-editor';
import type { FriendlyError } from './error-interpreter';

export function applyMonacoMarkers(
  monacoInstance: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
  errors: FriendlyError[]
) {
  const model = editor.getModel();
  if (!model) return;

  const markers: monaco.editor.IMarkerData[] = errors.map((err) => ({
    startLineNumber: err.line ?? 1,
    startColumn: Math.max(1, err.column ?? 1),
    endLineNumber: err.line ?? 1,
    endColumn: Math.max((err.column ?? 1) + 1, (err.column ?? 1) + 5),
    message: err.explanation
      ? `${err.message}\n\n${err.explanation}`
      : err.message,
    severity:
      err.severity === 'warning'
        ? monacoInstance.MarkerSeverity.Warning
        : monacoInstance.MarkerSeverity.Error,
  }));

  monacoInstance.editor.setModelMarkers(model, 'compiler', markers);
}

export function clearMonacoMarkers(
  monacoInstance: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor
) {
  const model = editor.getModel();
  if (!model) return;
  monacoInstance.editor.setModelMarkers(model, 'compiler', []);
}

export function goToLineColumn(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  line: number,
  column: number
) {
  if (!editor) return;
  editor.revealLineInCenter(line);
  editor.setPosition({ lineNumber: line, column });
  editor.focus();
}
