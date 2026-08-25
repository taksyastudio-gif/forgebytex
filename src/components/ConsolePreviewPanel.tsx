import React from 'react';

import { InteractiveTerminal } from './InteractiveTerminal';

import type {
  SupportedLanguage,
} from '../types/byteplay';

interface ConsolePreviewPanelProps {
  activeLanguage: SupportedLanguage;
  terminalLogs: string[];
  htmlPreviewDoc: string | null;
  onSendInput: (input: string) => void;
  onClearTerminal: () => void;
  isWaitingForInput?: boolean;
}

export const ConsolePreviewPanel: React.FC<
  ConsolePreviewPanelProps
> = ({
  activeLanguage,
  terminalLogs,
  htmlPreviewDoc,
  onSendInput,
  onClearTerminal,
  isWaitingForInput = false,
}) => {
  const isHtml =
    activeLanguage === 'html';

  return (
    <div className="w-full h-full bg-[#05070d] flex flex-col font-mono text-xs min-w-0">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#0a0d16] border-b border-slate-800/80 shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-emerald-400 font-bold">
            &gt;_
          </span>

          <span className="text-xs font-bold text-slate-200 uppercase tracking-wider font-sans truncate">
            {isHtml
              ? 'Live HTML Preview'
              : 'Interactive Terminal'}
          </span>
        </div>

        <button
          type="button"
          onClick={onClearTerminal}
          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
          title={
            isHtml
              ? 'Clear preview'
              : 'Clear terminal'
          }
          aria-label={
            isHtml
              ? 'Clear preview'
              : 'Clear terminal'
          }
        >
          🗑
        </button>
      </div>

      {/* Advertisement */}
      <a
        href="https://www.instagram.com/uniglobe_literary.club"
        target="_blank"
        rel="noopener noreferrer"
        className="mx-3.5 mt-3 p-2.5 bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-slate-900/80 border border-indigo-500/30 hover:border-indigo-400/60 rounded-xl flex items-center justify-between font-sans transition-all hover:scale-[1.01] shrink-0"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 p-[1.5px] shrink-0">
            <div className="w-full h-full bg-[#090d16] rounded-[6.5px] flex items-center justify-center">
              <svg
                className="w-4 h-4 text-pink-400"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </div>
          </div>

          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-200 truncate">
              Uniglobe Literary Club
            </div>

            <div className="text-[10px] text-indigo-300 font-mono truncate">
              @uniglobe_literary.club
            </div>
          </div>
        </div>

        <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0 ml-2">
          Follow
        </span>
      </a>

      {isHtml ? (
        <div className="flex-1 min-h-0 bg-white relative mt-3">
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
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#04060a]">
          <div className="flex-1 min-h-0 overflow-hidden">
            <InteractiveTerminal
              terminalLogs={terminalLogs}
              isWaitingForInput={isWaitingForInput}
              onInput={onSendInput}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ConsolePreviewPanel;