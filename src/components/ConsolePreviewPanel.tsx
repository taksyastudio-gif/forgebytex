import React from 'react';

import { InteractiveTerminal } from './InteractiveTerminal';

import type { SupportedLanguage } from '../types/byteplay';
import type { ExecutionStatus } from '../compiler/execution-protocol';

interface ConsolePreviewPanelProps {
  activeLanguage: SupportedLanguage;
  terminalLogs: string[];
  htmlPreviewDoc: string | null;
  onSendInput: (input: string) => void;
  onClearTerminal: () => void;
  isWaitingForInput?: boolean;
  executionStatus: ExecutionStatus;
  clearGeneration: number;
}

const STATUS_CONFIG: Record<
  ExecutionStatus,
  { label: string; color: string }
> = {
  idle:          { label: 'Ready',      color: 'text-slate-500' },
  preparing:     { label: 'Preparing…', color: 'text-cyan-400' },
  compiling:     { label: 'Compiling…', color: 'text-cyan-400' },
  running:       { label: 'Running…',   color: 'text-emerald-400' },
  'waiting-input': { label: 'Waiting for input', color: 'text-yellow-400' },
  completed:     { label: 'Completed',  color: 'text-emerald-400' },
  failed:        { label: 'Failed',     color: 'text-red-400' },
  stopped:       { label: 'Stopped',    color: 'text-slate-400' },
  timeout:       { label: 'Timed out', color: 'text-orange-400' },
};

export const ConsolePreviewPanel: React.FC<ConsolePreviewPanelProps> = ({
  activeLanguage,
  terminalLogs,
  htmlPreviewDoc,
  onSendInput,
  onClearTerminal,
  isWaitingForInput = false,
  executionStatus,
  clearGeneration,
}) => {
  const isHtml = activeLanguage === 'html';
  const { label: statusLabel, color: statusColor } = STATUS_CONFIG[executionStatus];

  return (
    <div className="w-full h-full bg-[#05070d] flex flex-col font-mono text-xs min-w-0">

      {/* ── Panel header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#0a0d16] border-b border-slate-800/80 shrink-0 select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-emerald-400 font-bold text-sm" aria-hidden="true">&gt;_</span>
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-sans truncate">
            {isHtml ? 'Live Preview' : 'Terminal'}
          </span>
          {!isHtml && (
            <span className={`text-[10px] font-mono ${statusColor} ml-1`}>
              {statusLabel}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClearTerminal}
          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
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
            <div className="h-full flex items-center justify-center p-4 text-slate-500 text-xs italic bg-[#04060a]">
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
          />
        </div>
      )}
    </div>
  );
};

export default ConsolePreviewPanel;