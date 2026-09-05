import type * as monaco from 'monaco-editor';

import {
  ErrorInterpreter,
  type HumorousErrorInsight,
} from '../compiler/error-interpreter';
import type { SupportedLanguage } from '../types/byteplay';

const MARKER_OWNER = 'forgebytex';
const MARKER_SOURCE = 'ForgeByteX Error Doctor';

/**
 * Parses one local diagnostic and applies it to the active Monaco model.
 */
export function parseAndApplyDiagnostics(
  monacoInstance: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
  rawOutput: string,
  language: SupportedLanguage,
): HumorousErrorInsight[] {
  clearMonacoMarkers(monacoInstance, editor);

  if (!rawOutput.trim()) {
    return [];
  }

  const diagnostic = ErrorInterpreter.parse(rawOutput, language);
  applyMonacoMarkers(monacoInstance, editor, [diagnostic]);

  return [diagnostic];
}

/**
 * Applies bounded Error Doctor diagnostics to the current Monaco model.
 */
export function applyMonacoMarkers(
  monacoInstance: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
  diagnostics: HumorousErrorInsight[],
): void {
  const model = editor.getModel();

  if (!model) {
    return;
  }

  const markers: monaco.editor.IMarkerData[] = diagnostics.map(
    (diagnostic) => {
      const lineNumber = clamp(
        diagnostic.lineNumber ?? 1,
        1,
        Math.max(model.getLineCount(), 1),
      );
      const lineMaxColumn = Math.max(
        model.getLineMaxColumn(lineNumber),
        1,
      );
      const startColumn = clamp(
        diagnostic.columnNumber ?? 1,
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
        message: formatMarkerMessage(diagnostic),
        severity: getMarkerSeverity(monacoInstance, diagnostic),
        source: MARKER_SOURCE,
      };
    },
  );

  monacoInstance.editor.setModelMarkers(
    model,
    MARKER_OWNER,
    markers,
  );
}

/**
 * Clears only markers created by ForgeByteX.
 */
export function clearMonacoMarkers(
  monacoInstance: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
): void {
  const model = editor.getModel();

  if (!model) {
    return;
  }

  monacoInstance.editor.setModelMarkers(
    model,
    MARKER_OWNER,
    [],
  );
}

/**
 * Moves the editor cursor to a bounded diagnostic coordinate.
 */
export function goToLineColumn(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  line: number,
  column: number,
): void {
  if (!editor) {
    return;
  }

  const model = editor.getModel();

  if (!model) {
    return;
  }

  const lineNumber = clamp(
    line,
    1,
    Math.max(model.getLineCount(), 1),
  );
  const safeColumn = clamp(
    column,
    1,
    Math.max(model.getLineMaxColumn(lineNumber), 1),
  );

  editor.revealLineInCenter(lineNumber);
  editor.setPosition({
    lineNumber,
    column: safeColumn,
  });
  editor.focus();
}

function formatMarkerMessage(
  diagnostic: HumorousErrorInsight,
): string {
  return [
    diagnostic.humorousTitle,
    diagnostic.friendlyExplanation,
    `Quick fix: ${diagnostic.suggestedFix}`,
    '',
    `Raw output: ${diagnostic.rawError}`,
  ].join('\n');
}

function getMarkerSeverity(
  monacoInstance: typeof monaco,
  diagnostic: HumorousErrorInsight,
): monaco.MarkerSeverity {
  return diagnostic.category === 'unknown'
    ? monacoInstance.MarkerSeverity.Warning
    : monacoInstance.MarkerSeverity.Error;
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