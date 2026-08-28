import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';

import 'xterm/css/xterm.css';

import type { EditorTheme } from '../types/byteplay';

interface InteractiveTerminalProps {
  terminalLogs: string[];
  isWaitingForInput?: boolean;
  onInput: (value: string) => void;
  /** Increment this to hard-clear the terminal (e.g. when user clicks Clear). */
  clearGeneration?: number;
  theme?: EditorTheme;
}

const XTERM_THEMES: Record<EditorTheme, import('xterm').ITheme> = {
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

export const InteractiveTerminal: React.FC<InteractiveTerminalProps> = ({
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
  /** How many log entries the terminal has already written. */
  const prevLengthRef = useRef(0);
  /** The clearGeneration that was last acted upon. */
  const prevClearGenerationRef = useRef(clearGeneration);

  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);

  // ── Mount the xterm Terminal once ────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      convertEol: true,
      disableStdin: false,
      allowProposedApi: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.4,
      theme: XTERM_THEMES[theme] ?? XTERM_THEMES.black,
      scrollback: 5000,
    });

    terminalRef.current = terminal;

    // Open inside requestAnimationFrame so the container has layout
    const openFrame = requestAnimationFrame(() => {
      if (!containerRef.current || terminalRef.current !== terminal) return;
      terminal.open(containerRef.current);
      terminal.focus();
    });

    // Handle keyboard input
    terminal.onData((data) => {
      // Backspace
      if (data === '\u007f' || data === '\b') {
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          terminal.write('\b \b');
        }
        return;
      }

      // Enter
      if (data === '\r' || data === '\n') {
        const rawInput = inputBufferRef.current;
        inputBufferRef.current = '';
        if (rawInput) {
          onInputRef.current(rawInput);
        }
        terminal.write('\r\n');
        return;
      }

      inputBufferRef.current += data;
      terminal.write(data);
    });

    return () => {
      cancelAnimationFrame(openFrame);
      terminal.dispose();
      terminalRef.current = null;
      prevLengthRef.current = 0;
      prevClearGenerationRef.current = 0;
    };
  }, []);

  // ── Hard clear when clearGeneration changes ───────────────────────────────
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    if (clearGeneration !== prevClearGenerationRef.current) {
      prevClearGenerationRef.current = clearGeneration;
      prevLengthRef.current = 0;
      terminal.clear();
      terminal.reset();
    }
  }, [clearGeneration]);

  // ── Sync xterm colors when theme changes ─────────────────────────────────
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.theme = XTERM_THEMES[theme] ?? XTERM_THEMES.black;
  }, [theme]);

  // ── Append-only: write only the NEW log entries ──────────────────────────
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const newEntries = terminalLogs.slice(prevLengthRef.current);
    if (newEntries.length === 0) return;

    for (const entry of newEntries) {
      // Each entry ends with a newline so lines stay separate.
      // Entries that already contain \n (multi-line output) are written as-is.
      terminal.write(entry.endsWith('\n') ? entry : entry + '\r\n');
    }

    prevLengthRef.current = terminalLogs.length;
  }, [terminalLogs]);

  // ── Cursor blink reflects waiting-for-input state ────────────────────────
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.cursorBlink = isWaitingForInput;
  }, [isWaitingForInput]);

  return (
    <div className="h-full w-full bg-[#05070d] p-2">
      <div ref={containerRef} className="h-full w-full overflow-hidden rounded-md" />
    </div>
  );
};

export default InteractiveTerminal;
