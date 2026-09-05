import { useEffect, type FC, type MouseEvent } from 'react';
import { X } from 'lucide-react';

import type { NebProgram } from '../data/nebGrade12Curriculum';

interface NebCurriculumModalProps {
  isOpen: boolean;
  onClose: () => void;
  programs: NebProgram[];
  onLoadProgram: (program: NebProgram) => void;
}

export const NebCurriculumModal: FC<NebCurriculumModalProps> = ({
  isOpen,
  onClose,
  programs,
  onLoadProgram,
}) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      aria-labelledby="neb-curriculum-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={handleBackdropClick}
      role="dialog"
    >
      <div className="modal-panel flex max-h-[85vh] w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-theme p-4">
          <div>
            <h2
              className="text-lg font-bold text-primary"
              id="neb-curriculum-title"
            >
              NEB Grade 12 Curriculum Library
            </h2>
            <p className="mt-1 text-xs text-muted">
              Load a starter program into the current VLNTOX workspace.
            </p>
          </div>

          <button
            aria-label="Close curriculum library"
            className="icon-action rounded-md p-1.5"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto p-4">
          {programs.length === 0 ? (
            <p className="rounded-lg border border-theme p-4 text-sm text-muted">
              No curriculum programs are available yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {programs.map((program) => (
                <article
                  className="rounded-lg border border-theme p-3 transition-colors hover:bg-surface-raised"
                  key={program.id}
                >
                  <div className="flex h-full flex-col justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-primary">
                        {program.title}
                      </h3>
                      <p className="mt-1 text-xs text-muted">
                        {program.topic ?? program.language.toUpperCase()}
                      </p>
                    </div>

                    <button
                      className="primary-action self-start rounded-md px-3 py-1.5 text-xs font-medium"
                      onClick={() => onLoadProgram(program)}
                      type="button"
                    >
                      Load program
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NebCurriculumModal;