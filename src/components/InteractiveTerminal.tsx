import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';

import 'xterm/css/xterm.css';

interface InteractiveTerminalProps {
  terminalLogs: string[];
  isWaitingForInput?: boolean;
  onInput: (value: string) => void;
}

export const InteractiveTerminal: React.FC<InteractiveTerminalProps> = ({
  terminalLogs,
  isWaitingForInput = false,
  onInput,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const inputBufferRef = useRef('');
  const onInputRef = useRef(onInput);

  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      convertEol: true,
      disableStdin: false,
      allowProposedApi: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.4,
      theme: {
        background: '#05070d',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: '#334155',
        black: '#0f172a',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e2e8f0',
      },
      scrollback: 5000,
    });

    terminalRef.current = terminal;

    const scheduleOpen = () => {
      if (!containerRef.current) {
        return;
      }

      terminal.open(containerRef.current);
      terminal.focus();
    };

    requestAnimationFrame(scheduleOpen);

    terminal.onData((data) => {
      if (data === '\u007f' || data === '\b') {
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        }

        terminal.write('\b \b');
        return;
      }

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
      terminal.dispose();
      terminalRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.clear();

    if (terminalLogs.length > 0) {
      const content = terminalLogs.join('\n');
      terminal.write(content);
    }
  }, [terminalLogs]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.cursorBlink = isWaitingForInput;
  }, [isWaitingForInput]);

  return (
    <div className="h-full w-full bg-[#05070d] p-2">
      <div ref={containerRef} className="h-full w-full overflow-hidden rounded-md" />
    </div>
  );
};

export default InteractiveTerminal;
