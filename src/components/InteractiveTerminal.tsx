import {
  useEffect,
  useRef,
  type FC,
} from 'react';
import { Terminal } from 'xterm';
import type { ITheme } from 'xterm';

import 'xterm/css/xterm.css';

import type { EditorTheme } from '../types/byteplay';

interface InteractiveTerminalProps {
  terminalLogs: string[];
  isWaitingForInput?: boolean;
  onInput: (value: string) => void;
  clearGeneration?: number;
  theme?: EditorTheme;
}

const XTERM_THEMES: Record<EditorTheme, ITheme> = {
  black: {
    background: '#060910',
    foreground: '#f8fafc',
    cursor: '#38bdf8',
    selectionBackground: '#1e3a8a80',
    black: '#0f172a',
    red: '#f87171',
    green: '#34d399',
    yellow: '#fbbf24',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#e2e8f0',
  },
  white: {
    background: '#f8fafc',
    foreground: '#0f172a',
    cursor: '#2563eb',
    selectionBackground: '#bfdbfe',
    black: '#0f172a',
    red: '#dc2626',
    green: '#059669',
    yellow: '#d97706',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: '#64748b',
  },
  cyberpunk: {
    background: '#050410',
    foreground: '#f0f6fc',
    cursor: '#06b6d4',
    selectionBackground: 'rgba(6, 182, 212, 0.25)',
    black: '#0e0c24',
    red: '#fb7185',
    green: '#34d399',
    yellow: '#facc15',
    blue: '#38bdf8',
    magenta: '#c084fc',
    cyan: '#06b6d4',
    white: '#f0f6fc',
  },
};

export const InteractiveTerminal: FC<
  InteractiveTerminalProps
> = ({
  terminalLogs,
  isWaitingForInput = false,
  onInput,
  clearGeneration = 0,
  theme = 'black',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);

  const inputBufferRef = useRef('');
  const onInputRef = useRef(onInput);
  const waitingRef = useRef(isWaitingForInput);

  const previousLogCountRef = useRef(0);
  const previousClearGenerationRef =
    useRef(clearGeneration);

  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);

  useEffect(() => {
    waitingRef.current = isWaitingForInput;

    const terminal = terminalRef.current;

    if (!terminal) {
      return;
    }

    terminal.options.cursorBlink = isWaitingForInput;

    if (isWaitingForInput) {
      terminal.focus();
    }
  }, [isWaitingForInput]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const terminal = new Terminal({
      allowProposedApi: true,
      convertEol: true,
      cursorBlink: waitingRef.current,
      cursorStyle: 'block',
      disableStdin: false,
      fontFamily:
        "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.4,
      scrollback: 5000,
      theme: XTERM_THEMES[theme],
    });

    terminalRef.current = terminal;

    const openFrame = window.requestAnimationFrame(() => {
      if (terminalRef.current !== terminal) {
        return;
      }

      terminal.open(container);
      terminal.focus();
    });

    const dataSubscription = terminal.onData((data) => {
      if (!waitingRef.current) {
        return;
      }

      if (data === '\u007f' || data === '\b') {
        if (inputBufferRef.current.length === 0) {
          return;
        }

        inputBufferRef.current =
          inputBufferRef.current.slice(0, -1);

        terminal.write('\b \b');
        return;
      }

      if (data === '\r' || data === '\n') {
        const input = inputBufferRef.current;

        inputBufferRef.current = '';

        terminal.write('\r\n');

        // The worker receives one complete line. The parent App
        // is responsible for adding the newline expected by C/Python.
        onInputRef.current(input);
        return;
      }

      // Ignore control sequences that should not become source input.
      if (data.startsWith('\u001b')) {
        return;
      }

      inputBufferRef.current += data;
      terminal.write(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      terminal.resize(
        Math.max(terminal.cols, 1),
        Math.max(terminal.rows, 1),
      );
    });

    resizeObserver.observe(container);

    return () => {
      window.cancelAnimationFrame(openFrame);
      dataSubscription.dispose();
      resizeObserver.disconnect();

      terminal.dispose();
      terminalRef.current = null;
      inputBufferRef.current = '';
      previousLogCountRef.current = 0;
    };
  }, [theme]);

  useEffect(() => {
    const terminal = terminalRef.current;

    if (!terminal) {
      return;
    }

    terminal.options.theme = XTERM_THEMES[theme];
  }, [theme]);

  useEffect(() => {
    const terminal = terminalRef.current;

    if (!terminal) {
      return;
    }

    if (
      clearGeneration !==
      previousClearGenerationRef.current
    ) {
      previousClearGenerationRef.current =
        clearGeneration;

      previousLogCountRef.current = 0;
      inputBufferRef.current = '';

      terminal.clear();
      terminal.reset();
    }
  }, [clearGeneration]);

  useEffect(() => {
    const terminal = terminalRef.current;

    if (!terminal) {
      return;
    }

    if (
      terminalLogs.length <
      previousLogCountRef.current
    ) {
      terminal.clear();
      terminal.reset();
      previousLogCountRef.current = 0;
    }

    const newEntries = terminalLogs.slice(
      previousLogCountRef.current,
    );

    for (const entry of newEntries) {
      terminal.write(formatTerminalEntry(entry));
    }

    previousLogCountRef.current = terminalLogs.length;

    if (newEntries.length > 0) {
      terminal.scrollToBottom();
    }
  }, [terminalLogs]);

  return (
    <div className="h-full w-full bg-terminal-bg p-2">
      <div
        aria-label={
          isWaitingForInput
            ? 'Program input terminal'
            : 'Program output terminal'
        }
        className="h-full w-full overflow-hidden rounded-md"
        ref={containerRef}
      />
    </div>
  );
};

const formatTerminalEntry = (text: string): string => {
  if (!text) {
    return '';
  }

  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  return normalized
    .split('\n')
    .map((line) => `${line}\r\n`)
    .join('');
};

export default InteractiveTerminal;