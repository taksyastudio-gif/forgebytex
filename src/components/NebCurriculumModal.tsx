import React from 'react';
import type { NebProgram } from '../data/nebGrade12Curriculum';

interface NebCurriculumModalProps {
  isOpen: boolean;
  onClose: () => void;
  programs: NebProgram[];
  onLoadProgram: (program: NebProgram) => void;
}

export const NebCurriculumModal: React.FC<NebCurriculumModalProps> = ({
  isOpen,
  onClose,
  programs,
  onLoadProgram,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="modal-panel w-[min(900px,95%)] max-h-[85vh] overflow-auto rounded-2xl p-4 shadow-2xl border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">NEB Grade 12 Curriculum Library</h2>
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-white">Close</button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {programs.map((p) => (
            <div key={p.id} className="rounded-lg border border-slate-800 p-3 hover:bg-slate-900/40">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{p.title}</div>
                  <div className="text-[12px] text-slate-400">{p.topic ?? p.language}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onLoadProgram(p)}
                    className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                  >
                    Load
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NebCurriculumModal;
