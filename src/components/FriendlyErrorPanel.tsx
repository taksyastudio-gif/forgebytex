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
  return (
    <div className="bg-[#12080d] border-t border-red-900/50 p-3 text-xs font-sans text-red-200">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-red-400 flex items-center gap-1.5">
          ⚠️ {errors.length} Compilation Error{errors.length > 1 ? 's' : ''} Detected
        </span>
        <button
          onClick={onToggleRawError}
          className="text-[10px] text-slate-400 hover:text-slate-200 underline"
        >
          {showRawError ? 'Hide Raw Details' : 'View Raw Log'}
        </button>
      </div>

      <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
        {errors.map((err) => (
          <div
            key={err.id}
            onClick={() => onErrorSelect(err)}
            className={`p-2 rounded-lg cursor-pointer border transition-all ${
              selectedErrorId === err.id
                ? 'bg-red-950/80 border-red-500'
                : 'bg-red-950/30 border-red-900/40 hover:bg-red-950/50'
            }`}
          >
            <div className="font-mono text-[11px] font-bold text-red-300">
              Line {err.line}, Column {err.column}: {err.message}
            </div>
            <p className="text-slate-300 text-[11px] mt-1">{err.explanation}</p>
            {showRawError && (
              <pre className="mt-1 p-1 bg-black/40 rounded text-[10px] text-red-400 font-mono overflow-x-auto">
                {err.raw}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};