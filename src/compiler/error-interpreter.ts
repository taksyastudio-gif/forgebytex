export type FriendlyError = {
  title: string;
  message: string;
  tip: string;
  line?: number;
  column?: number;
  severity: "error" | "warning" | "runtime";
  raw: string;
};

type ErrorPattern = {
  pattern: RegExp;
  create: (
    match: RegExpExecArray,
    raw: string,
  ) => FriendlyError;
};

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern:
      /(?:main\.c|[^:\s]+):(\d+):(\d+):\s*error:\s*(?:expected\s+['"`]?;['"`]?\s+after\s+expression|expected\s*['"`]?;['"`]?)/i,

    create: (match, raw) => ({
      title: "💀 Ooh shit… where did the semicolon go?",
      message:
        "You opened a statement but forgot to finish it with a semicolon.",
      tip:
        "Check the end of the statement on this line and add `;`.",
      line: Number(match[1]),
      column: Number(match[2]),
      severity: "error",
      raw,
    }),
  },

  {
    pattern:
      /(?:main\.c|[^:\s]+):(\d+):(\d+):\s*error:\s*expected\s*['"`]?([)\]}])['"`]?/i,

    create: (match, raw) => ({
      title: "😬 You opened it… but never came back to close it.",
      message:
        `The compiler expected a closing \`${match[3]}\` here.`,
      tip:
        "Check your parentheses, brackets, and braces. Every opening symbol needs its matching closing symbol.",
      line: Number(match[1]),
      column: Number(match[2]),
      severity: "error",
      raw,
    }),
  },

  {
    pattern:
      /(?:main\.c|[^:\s]+):(\d+):(\d+):\s*error:\s*['"`]?([)\]}])['"`]?\s+expected/i,

    create: (match, raw) => ({
      title: "🫠 That bracket showed up without an invitation.",
      message:
        `There is an unexpected \`${match[3]}\` here.`,
      tip:
        "Check the nearby brackets and make sure they are properly paired.",
      line: Number(match[1]),
      column: Number(match[2]),
      severity: "error",
      raw,
    }),
  },

  {
    pattern:
      /(?:main\.c|[^:\s]+):(\d+):(\d+):\s*error:\s*use of undeclared identifier ['"`]?([^'"`]+)['"`]?/i,

    create: (match, raw) => ({
      title: "👀 Bro… who is this variable?",
      message:
        `\`${match[3].trim()}\` is being used, but C doesn't know what it is.`,
      tip:
        "Declare the variable before using it and check that its spelling matches exactly.",
      line: Number(match[1]),
      column: Number(match[2]),
      severity: "error",
      raw,
    }),
  },

  {
    pattern:
      /(?:main\.c|[^:\s]+):(\d+):(\d+):\s*error:\s*use of undeclared identifier/i,

    create: (match, raw) => ({
      title: "🤨 C has no idea what you're talking about.",
      message:
        "You're using an identifier that hasn't been declared.",
      tip:
        "Declare it first and check the spelling.",
      line: Number(match[1]),
      column: Number(match[2]),
      severity: "error",
      raw,
    }),
  },

  {
    pattern:
      /(?:main\.c|[^:\s]+):(\d+):(\d+):\s*error:\s*['"`]?([^'"`]+)['"`]?\s+undeclared/i,

    create: (match, raw) => ({
      title: "🤔 That name hasn't been introduced yet.",
      message:
        `\`${match[3].trim()}\` appears to be undeclared.`,
      tip:
        "Declare it before using it, or check whether you made a spelling mistake.",
      line: Number(match[1]),
      column: Number(match[2]),
      severity: "error",
      raw,
    }),
  },

  {
    pattern:
      /(?:main\.c|[^:\s]+):(\d+):(\d+):\s*warning:\s*(.+)/i,

    create: (match, raw) => ({
      title: "⚠️ Not broken… but C is giving you a warning.",
      message: match[3].trim(),
      tip:
        "Read the warning carefully. Your program may compile, but something could still be wrong.",
      line: Number(match[1]),
      column: Number(match[2]),
      severity: "warning",
      raw,
    }),
  },

  {
    pattern:
      /(?:main\.c|[^:\s]+):(\d+):(\d+):\s*error:\s*(.+)/i,

    create: (match, raw) => ({
      title: "💥 Yep… C found something it doesn't like.",
      message: match[3].trim(),
      tip:
        "Check this line first. The actual mistake can sometimes be a few characters before the highlighted position.",
      line: Number(match[1]),
      column: Number(match[2]),
      severity: "error",
      raw,
    }),
  },
];

function extractPrimaryDiagnostic(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const diagnostic = lines.find(
    (line) =>
      /:\d+:\d+:\s*(error|warning):/i.test(line),
  );

  return diagnostic ?? lines[0] ?? raw.trim();
}

export function interpretCompilerError(
  rawError: string,
): FriendlyError {
  const raw = rawError.trim();

  if (!raw) {
    return {
      title: "💥 Something went wrong.",
      message: "The compiler failed, but didn't provide a useful message.",
      tip:
        "Try running the code again. If the problem continues, check the code and compiler setup.",
      severity: "error",
      raw: "",
    };
  }

  const diagnostic = extractPrimaryDiagnostic(raw);

  for (const entry of ERROR_PATTERNS) {
    const match = entry.pattern.exec(diagnostic);

    if (match) {
      return entry.create(match, raw);
    }
  }

  if (
    /program exited with code/i.test(raw) ||
    /runtime error/i.test(raw)
  ) {
    return {
      title: "💥 Your program crashed.",
      message:
        "The code compiled, but something went wrong while it was running.",
      tip:
        "Check array bounds, pointers, input handling, division by zero, and other runtime operations.",
      severity: "runtime",
      raw,
    };
  }

  if (/undefined reference/i.test(raw)) {
    return {
      title: "🔗 The linker couldn't find something.",
      message:
        "Your code refers to a function or symbol that wasn't found during linking.",
      tip:
        "Check your function names, required libraries, and whether every function is actually defined.",
      severity: "error",
      raw,
    };
  }

  if (/file not found|no such file or directory/i.test(raw)) {
    return {
      title: "📦 Something the compiler needs is missing.",
      message:
        "The compiler couldn't find a required file or header.",
      tip:
        "Check your `#include` statements and make sure the referenced file exists.",
      severity: "error",
      raw,
    };
  }

  return {
    title: "💀 Oops… the compiler caught something.",
    message: diagnostic,
    tip:
      "Read the compiler message carefully and start with the line and column shown above.",
    severity: "error",
    raw,
  };
}