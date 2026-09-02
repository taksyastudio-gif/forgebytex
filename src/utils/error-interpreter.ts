export interface FriendlyError {
  id: string;
  line: number;
  column: number;
  message: string;
  raw: string;
  explanation: string;
  severity: 'error' | 'warning';
}

const PYTHON_ERROR_TYPES = [
  'SyntaxError',
  'NameError',
  'TypeError',
  'IndentationError',
  'IndexError',
  'KeyError',
  'ZeroDivisionError',
  'ModuleNotFoundError',
] as const;

type PythonErrorType = (typeof PYTHON_ERROR_TYPES)[number];

const pythonExplanation = (type: PythonErrorType): string => {
  switch (type) {
    case 'SyntaxError':
      return 'Python could not parse this code. Check the highlighted line for missing punctuation, quotes, or an invalid statement.';
    case 'IndentationError':
      return 'Python uses indentation to define blocks. Make the indentation consistent with the surrounding code.';
    case 'NameError':
      return 'This name has not been defined yet, or its spelling does not match the definition.';
    case 'TypeError':
      return 'This operation or function call uses a value of the wrong type. Check the values and expected argument types.';
    case 'IndexError':
      return 'The code tried to access a list or sequence position that does not exist.';
    case 'KeyError':
      return 'The requested dictionary key does not exist. Check the key or use a safe lookup.';
    case 'ZeroDivisionError':
      return 'A number was divided by zero. Check the divisor before performing the calculation.';
    case 'ModuleNotFoundError':
      return 'Python could not find the requested module in the browser runtime. Check the module name and supported packages.';
  }
};

export function interpretPythonError(rawOutput: string): FriendlyError[] {
  const raw = rawOutput.trim();
  if (!raw) return [];

  const typeMatch = raw.match(
    new RegExp(`\\b(${PYTHON_ERROR_TYPES.join('|')})\\b`)
  );
  const type = typeMatch?.[1] as PythonErrorType | undefined;
  const locationMatches = [...raw.matchAll(/File ".*?", line (\d+)/g)];
  const line = locationMatches.length > 0
    ? Number(locationMatches[locationMatches.length - 1][1])
    : 1;
  const messageLine = raw.split(/\r?\n/).reverse().find((value) =>
    value.trim().length > 0
  ) ?? raw;
  const message = type
    ? messageLine.replace(new RegExp(`^${type}:\\s*`), '').trim() || type
    : messageLine.trim();

  return [{
    id: 'python-err-0',
    line,
    column: 1,
    message: type ? `${type}: ${message}` : message,
    raw,
    explanation: type
      ? pythonExplanation(type)
      : 'Python reported an execution error. Review the traceback and the highlighted line.',
    severity: 'error',
  }];
}

const formatMessage = (rawMessage: string): string => {
  const clean = (rawMessage || '').replace(/\s+/g, ' ').trim();
  if (!clean) {
    return 'Compilation failed.';
  }
  return clean;
};

const buildExplanation = (rawText: string, level: 'error' | 'warning'): string => {
  if (/expected ['"]?;['"]? (?:after expression|at end of declaration|before)|missing semicolon/i.test(rawText)) {
    return 'A statement is missing its terminating semicolon (;). Add the semicolon at the end of the statement on the highlighted line.';
  }

  if (/expected ['"]?\)['"]?/.test(rawText) || /to match this \(/i.test(rawText)) {
    return 'The compiler expected a closing parenthesis here. Check the opening ( in the same expression and close it before continuing.';
  }

  if (/expected ['"]?\}['"]?/.test(rawText) || /to match this \{/.test(rawText)) {
    return 'A block is missing its closing brace (}). Check the opening { and make sure every block closes properly.';
  }

  if (/undeclared identifier|implicitly declaring|unknown type|not declared in scope/i.test(rawText)) {
    return 'This name is being used before it is declared, or it is spelled differently than the declaration.';
  }

  if (/call to undeclared function|implicit function declaration/i.test(rawText)) {
    return 'This function was called before it was defined or declared. Add a prototype or define the function before use.';
  }

  if (/redefinition of|previous definition is here/i.test(rawText)) {
    return 'This variable is declared more than once in the same scope. Keep only one declaration for each variable.';
  }

  if (/too few arguments to function call|expected .* have .*/i.test(rawText)) {
    return 'This function call is missing one or more required arguments. Check the function signature and provide the correct number of arguments.';
  }

  if (/incompatible pointer to integer conversion|incompatible integer to pointer conversion|incompatible types|cannot convert/i.test(rawText)) {
    return 'The value being assigned does not match the variable type. Use a value of the correct type for this variable.';
  }

  if (/format specifies type|-Wformat|%f.*int|%d.*double/i.test(rawText)) {
    return 'The format string does not match the variable type. Use a format specifier that matches the value being printed.';
  }

  if (/(cannot find|undefined reference|linker|file not found)/i.test(rawText)) {
    return 'The compiler or linker could not find a required symbol or file. Check the function names, includes, and project setup.';
  }

  if (level === 'warning') {
    return 'This is a compiler warning. The code may still compile, but it may be doing something unexpected or unsafe.';
  }

  return 'The compiler reported a problem in this code. Check the highlighted line and the surrounding statements.';
};

export function interpretCompilerOutput(rawOutput: string): FriendlyError[] {
  const errors: FriendlyError[] = [];

  if (!rawOutput) return errors;

  const normalized = rawOutput.trim();
  if (!normalized) return errors;

  const lines = normalized.split(/\r?\n/);
  let current: { block: string[]; level: 'error' | 'warning' | null } | null = null;
  let idCounter = 0;

  const pushCurrent = () => {
    if (!current || current.level === null) return;

    const block = current.block.join('\n');
    const header = current.block[0] || '';
    const match = header.match(/(?:.*?:)?(\d+):(\d+):\s*(warning|error|fatal error):?\s*(.*)/i);

    if (!match) {
      current = null;
      return;
    }

    const line = Number(match[1]);
    const column = Number(match[2]);
    const level = match[3].toLowerCase().includes('warning') ? 'warning' : 'error';
    const message = formatMessage(match[4] || current.block.slice(1).join(' ') || 'Compilation failed.');
    const explanation = buildExplanation(block, level);

    errors.push({
      id: `err-${idCounter++}`,
      line,
      column,
      message,
      raw: block,
      explanation,
      severity: level,
    });

    current = null;
  };

  for (const line of lines) {
    const diagnosticHeader = line.match(/(?:.*?:)?(\d+):(\d+):\s*(warning|error|fatal error|note):/i);

    if (diagnosticHeader) {
      pushCurrent();
      current = { block: [line], level: diagnosticHeader[3].toLowerCase().includes('warning') ? 'warning' : 'error' };
      continue;
    }

    if (current) {
      current.block.push(line);
      continue;
    }

    const bareDiagnostic = line.match(/(?:.*?:)?(\d+):(\d+):(?:\s*(?:fatal\s+)?error:)?\s*(.*)/i);
    if (bareDiagnostic) {
      const lineNumber = Number(bareDiagnostic[1]);
      const columnNumber = Number(bareDiagnostic[2]);
      const message = formatMessage(bareDiagnostic[3]);
      errors.push({
        id: `err-${idCounter++}`,
        line: lineNumber,
        column: columnNumber,
        message,
        raw: line,
        explanation: buildExplanation(line, 'error'),
        severity: 'error',
      });
    }
  }

  pushCurrent();

  if (errors.length === 0) {
    const firstMeaningful = normalized
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0) || normalized;

    const message = formatMessage(firstMeaningful);
    errors.push({
      id: `err-${idCounter++}`,
      line: 1,
      column: 1,
      message,
      raw: normalized,
      explanation: 'The compiler reported a diagnostic that ForgeByte could not confidently match to a standard beginner-friendly pattern. Review the raw compiler message and the highlighted line.',
      severity: 'error',
    });
  }

  return errors;
}
