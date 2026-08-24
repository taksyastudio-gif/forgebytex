import React from 'react';
import type { FriendlyError } from '../utils/error-interpreter';

interface FriendlyErrorPanelProps {
  errors: FriendlyError[];
  selectedErrorId: string | null;
  showRawError: boolean;
  onErrorSelect: (error: FriendlyError) => void;
  onToggleRawError: () => void;
}

export const FriendlyErrorPanel: React.FC<FriendlyErrorPanelProps> = ({
  errors,
  selectedErrorId,
  showRawError,
  onErrorSelect,
  onToggleRawError,
}) => {
  const isWarningOnly = errors.length > 0 && errors.every((error) => error.severity === 'warning');
  const headingText = isWarningOnly ? 'Warning' : 'Compilation Error';
  const panelColor = isWarningOnly ? 'bg-amber-950/30 border-amber-500/40' : 'bg-[#12080d] border-red-900/50';
  const cardColor = isWarningOnly ? 'bg-amber-950/40 border-amber-700/55 hover:bg-amber-900/50' : 'bg-red-950/30 border-red-900/40 hover:bg-red-950/50';

  return (
    <div className={`border-t p-3 text-xs font-sans ${panelColor}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`font-bold flex items-center gap-1.5 ${isWarningOnly ? 'text-amber-400' : 'text-red-400'}`}>
          ?? {errors.length} {headingText}{errors.length > 1 ? 's' : ''} Detected
        </span>
        <button
          onClick={onToggleRawError}
          className="text-[10px] text-slate-400 hover:text-slate-200 underline"
        >
          {showRawError ? 'Hide Raw Details' : 'View Raw Log'}
        </button>
      </div>

      <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
        {errors.map((err) => {
          const isWarning = err.severity === 'warning';
          const tagText = isWarning ? 'Warning' : 'Error';
          const tagClass = isWarning ? 'text-amber-200 bg-amber-900/50 border-amber-500/30' : 'text-red-200 bg-red-950/50 border-red-500/30';

          return (
            <div
              key={err.id}
              onClick={() => onErrorSelect(err)}
              className={`p-2 rounded-lg cursor-pointer border transition-all ${selectedErrorId === err.id ? (isWarning ? 'bg-amber-950/80 border-amber-400' : 'bg-red-950/80 border-red-500') : cardColor}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-[10px] uppercase tracking-wide font-bold border px-1.5 py-0.5 rounded ${tagClass}`}>
                  {tagText}
                </span>
                <span className="font-mono text-[11px] text-slate-300">
                  Line {err.line}, Column {err.column}
                </span>
              </div>
              <div className="font-mono text-[11px] font-bold text-red-300">
                {err.message}
              </div>
              <p className="text-slate-300 text-[11px] mt-1">{err.explanation}</p>
              {showRawError && (
                <pre className="mt-1 p-1 bg-black/40 rounded text-[10px] text-red-400 font-mono overflow-x-auto">
                  {err.raw}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
