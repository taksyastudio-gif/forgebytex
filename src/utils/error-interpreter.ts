import { ErrorInterpreter } from '../compiler/error-interpreter';

export interface FriendlyError {
  id: string;
  line: number;
  column: number;
  message: string;
  raw: string;
  explanation: string;
  severity: 'error' | 'warning';
}

/**
 * Compatibility adapter for older diagnostic imports.
 *
 * The canonical parser lives in compiler/error-interpreter.ts. These helpers
 * preserve the legacy FriendlyError shape without maintaining a second parser.
 */
export function interpretPythonError(
  rawOutput: string,
): FriendlyError[] {
  return convertInsight(
    ErrorInterpreter.parse(rawOutput, 'python'),
    'python',
  );
}

/**
 * Converts C and C++ compiler output into the legacy diagnostic shape.
 */
export function interpretCompilerOutput(
  rawOutput: string,
): FriendlyError[] {
  return convertInsight(
    ErrorInterpreter.parse(rawOutput, 'c'),
    'c',
  );
}

function convertInsight(
  insight: ReturnType<typeof ErrorInterpreter.parse>,
  language: string,
): FriendlyError[] {
  const line = Math.max(insight.lineNumber ?? 1, 1);
  const column = Math.max(insight.columnNumber ?? 1, 1);

  return [
    {
      id: `${language}-diagnostic-${line}-${column}`,
      line,
      column,
      message: insight.humorousTitle,
      raw: insight.rawError,
      explanation: [
        insight.friendlyExplanation,
        `Quick fix: ${insight.suggestedFix}`,
      ].join(' '),
      severity:
        insight.category === 'unknown' ? 'warning' : 'error',
    },
  ];
}