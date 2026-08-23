export interface FriendlyError {
  id: string;
  line: number;
  column: number;
  message: string;
  raw: string;
  explanation: string;
}

export function interpretCompilerOutput(rawOutput: string): FriendlyError[] {
  const errors: FriendlyError[] = [];

  if (!rawOutput) return errors;

  // Split into lines and group multi-line diagnostics.
  const lines = rawOutput.split('\n');

  let current: { header?: string; block: string[] } | null = null;
  let idCounter = 0;

  const pushCurrent = () => {
    if (!current || !current.header) return;

    const header = current.header;
    const block = current.block.join('\n');

    // match header like: file.c:12:5: error: something
    const match = header.match(/(?:.*?:)?(\d+):(\d+):\s*(warning|error|fatal error|note):?\s*(.*)/i);

    if (match) {
      const lineNum = parseInt(match[1], 10);
      const colNum = parseInt(match[2], 10);
      const level = match[3].toLowerCase();
      const msg = match[4] || '';

      const explanation = (() => {
        if (/stdio\.h/i.test(block) || /undefined reference to `printf'/.test(block)) {
          return "Missing or incorrect stdio usage; check includes and linkage.";
        }
        if (/malloc|free|segmentation fault|abort/i.test(block)) {
          return 'Possible memory error or invalid pointer/memory access.';
        }
        return level === 'warning' ? 'Compiler warning; code may still compile.' : 'Compilation or runtime error. See raw output.';
      })();

      errors.push({
        id: `err-${idCounter++}`,
        line: lineNum,
        column: colNum,
        message: msg || block.split('\n')[0] || level,
        raw: block,
        explanation,
      });
    }

    current = null;
  };

  for (const line of lines) {
    const headerMatch = line.match(/(?:.*?:)?(\d+):(\d+):\s*(warning|error|fatal error|note):/i);
    if (headerMatch) {
      // Start a new block
      pushCurrent();
      current = { header: line, block: [line] };
    } else if (current) {
      // continuation of previous diagnostic block
      current.block.push(line);
    } else {
      // orphan lines: try to match simple single-line errors
      const simple = line.match(/(?:.*?:)?(\d+):(\d+):\s*(?:fatal\s+)?error:\s*(.*)/i);
      if (simple) {
        const lineNum = parseInt(simple[1], 10);
        const colNum = parseInt(simple[2], 10);
        const msg = simple[3];
        errors.push({
          id: `err-${idCounter++}`,
          line: lineNum,
          column: colNum,
          message: msg,
          raw: line,
          explanation: 'Compilation error detected.',
        });
      }
    }
  }

  // push last
  pushCurrent();

  return errors;
}