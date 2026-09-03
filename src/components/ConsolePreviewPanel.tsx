import React from 'react';
import { ArrowDownToLine, ArrowRightToLine } from 'lucide-react';

import { InteractiveTerminal } from './InteractiveTerminal';

import type { SupportedLanguage, EditorTheme, TerminalPosition } from '../types/byteplay';
import type { ExecutionStatus } from '../compiler/execution-protocol';

interface ConsolePreviewPanelProps {
  activeLanguage: SupportedLanguage;
  activeTheme?: EditorTheme;
  terminalLogs: string[];
  htmlPreviewDoc: string | null;
  onSendInput: (input: string) => void;
  onClearTerminal: () => void;
  isWaitingForInput?: boolean;
  executionStatus: ExecutionStatus;
  clearGeneration: number;
  terminalPosition: TerminalPosition;
  onTerminalPositionChange: (position: TerminalPosition) => void;
}

const STATUS_CONFIG: Record<
  ExecutionStatus,
  { label: string; color: string }
> = {
  idle:          { label: 'Ready',      color: 'text-muted' },
  preparing:     { label: 'Preparing…', color: 'text-cyan-400' },
  compiling:     { label: 'Compiling…', color: 'text-cyan-400' },
  running:       { label: 'Running…',   color: 'text-emerald-400' },
  'waiting-input': { label: 'Waiting for input', color: 'text-amber-400 font-bold animate-pulse' },
  completed:     { label: 'Completed',  color: 'text-emerald-400' },
  failed:        { label: 'Failed',     color: 'text-red-400' },
  stopped:       { label: 'Stopped',    color: 'text-muted' },
  timeout:       { label: 'Timed out', color: 'text-orange-400' },
  'memory-limit': { label: 'Memory limit exceeded', color: 'text-orange-400' },
  'output-limit': { label: 'Output limit exceeded', color: 'text-orange-400' },
  'process-limit': { label: 'Process limit exceeded', color: 'text-orange-400' },
  'sandbox-error': { label: 'Sandbox error', color: 'text-red-400' },
  'infrastructure-error': { label: 'Infrastructure error', color: 'text-red-400' },
};

export const ConsolePreviewPanel: React.FC<ConsolePreviewPanelProps> = ({
  activeLanguage,
  activeTheme = 'black',
  terminalLogs,
  htmlPreviewDoc,
  onSendInput,
  onClearTerminal,
  isWaitingForInput = false,
  executionStatus,
  clearGeneration,
  terminalPosition,
  onTerminalPositionChange,
}) => {
  const isHtml =
    activeLanguage === 'html' ||
    activeLanguage === 'css' ||
    activeLanguage === 'javascript';
  const { label: statusLabel, color: statusColor } = STATUS_CONFIG[executionStatus];

  return (
    <div className="console-panel w-full h-full flex flex-col font-mono text-xs min-w-0 bg-surface border-t border-theme">

      {/* ── Panel header ──────────────────────────────────────────────── */}
      <div className="console-panel-header flex items-center justify-between px-3.5 h-9 border-b border-theme shrink-0 select-none bg-surface">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-emerald-400 font-bold text-xs" aria-hidden="true">&gt;_</span>
          <span className="text-xs font-semibold uppercase tracking-wider font-sans text-primary truncate">
            {isHtml ? 'Live Web Preview' : 'Interactive Terminal'}
          </span>
          {!isHtml && (
            <span className={`text-[11px] font-mono ${statusColor} ml-1`}>
              • {statusLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {!isHtml && (
            <button
              type="button"
              onClick={() => onTerminalPositionChange(terminalPosition === 'bottom' ? 'right' : 'bottom')}
              className="p-1 text-muted hover:text-primary hover:bg-surface-raised rounded transition-colors cursor-pointer"
              title={`Switch to ${terminalPosition === 'bottom' ? 'right' : 'bottom'} panel`}
              aria-label={`Switch to ${terminalPosition === 'bottom' ? 'right' : 'bottom'} panel`}
            >
              {terminalPosition === 'bottom' ? (
                <ArrowRightToLine size={14} />
              ) : (
                <ArrowDownToLine size={14} />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onClearTerminal}
            className="p-1 text-muted hover:text-red-400 hover:bg-surface-raised rounded transition-colors cursor-pointer"
            title={isHtml ? 'Clear preview' : 'Clear terminal'}
            aria-label={isHtml ? 'Clear preview' : 'Clear terminal'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Main content area ─────────────────────────────────────────── */}
      {isHtml ? (
        <div className="flex-1 min-h-0 bg-white relative">
          {htmlPreviewDoc ? (
            <iframe
              title="HTML Sandbox"
              srcDoc={htmlPreviewDoc}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-modals"
            />
          ) : (
            <div className="h-full flex items-center justify-center p-4 text-slate-400 text-xs italic bg-inherit">
              Press &quot;Run Code&quot; to preview HTML.
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <InteractiveTerminal
            terminalLogs={terminalLogs}
            isWaitingForInput={isWaitingForInput}
            onInput={onSendInput}
            clearGeneration={clearGeneration}
            theme={activeTheme}
          />
        </div>
      )}
    </div>
  );
};

export default ConsolePreviewPanel;