import React from 'react';
import { X } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WELCOME_DISMISSED_KEY = 'forgebytex-welcome-dismissed';

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleStartCoding = () => {
    localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
    onClose();
  };

  const handleClose = () => {
    localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
    onClose();
  };

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="modal-panel w-[min(450px,95%)] rounded-xl p-6 shadow-2xl border bg-surface">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm overflow-hidden">
              <img src="/favicon.svg" alt="ForgeByteX" className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-primary">Welcome to ForgeByteX</h2>
              <p className="text-xs text-muted">by TAKSYA STUDIO</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-secondary hover:text-primary transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-sm text-secondary leading-relaxed">
            ForgeByteX is a powerful web-based code editor supporting C, Python, HTML, CSS, and JavaScript. 
            Built for developers who need a clean, fast coding environment.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted">
            <span>Made with modern web technologies by TAKSYA STUDIO</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleStartCoding}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-95 cursor-pointer"
          >
            <span>Start Coding</span>
          </button>
          <button
            onClick={handleClose}
            className="flex-1 rounded-lg border border-theme bg-surface-soft px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-primary cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export const shouldShowWelcome = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !localStorage.getItem(WELCOME_DISMISSED_KEY);
};

export default WelcomeModal;
