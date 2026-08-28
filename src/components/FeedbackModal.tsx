import React, { useState } from 'react';
import { Bug, Lightbulb, Heart, Send, X, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase, type FeedbackType } from '../lib/supabase';
import type { EditorTheme, SupportedLanguage } from '../types/byteplay';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: EditorTheme;
  currentLanguage: SupportedLanguage;
}

const FEEDBACK_TYPES: Array<{ value: FeedbackType; label: string; icon: React.ReactNode }> = [
  { value: 'bug', label: 'Bug', icon: <Bug size={16} /> },
  { value: 'suggestion', label: 'Suggestion', icon: <Lightbulb size={16} /> },
  { value: 'feedback', label: 'Feedback', icon: <Heart size={16} /> },
];

const APP_VERSION = '0.0.0';

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  currentLanguage,
}) => {
  const [selectedType, setSelectedType] = useState<FeedbackType>('bug');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError('Please enter a message');
      return;
    }

    if (!supabase) {
      setError('Feedback service is not configured');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('feedback')
        .insert({
          type: selectedType,
          message: message.trim(),
          theme: currentTheme,
          language: currentLanguage,
          app_version: APP_VERSION,
        });

      if (insertError) {
        throw insertError;
      }

      setIsSuccess(true);
      setMessage('');
      
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setIsSuccess(false);
      setError(null);
      onClose();
    }
  };

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="modal-panel w-[min(400px,95%)] rounded-xl p-4 shadow-2xl border bg-surface">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-primary">Feedback</h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-secondary hover:text-primary transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {isSuccess ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 size={32} className="text-emerald-500 mb-2" />
            <p className="text-sm text-primary font-medium">Thank you for your feedback!</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-4">
              {FEEDBACK_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setSelectedType(type.value)}
                  disabled={isSubmitting}
                  className={[
                    'flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                    selectedType === type.value
                      ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400'
                      : 'border-theme bg-surface-soft text-secondary hover:bg-surface-raised hover:text-primary',
                    isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                  ].join(' ')}
                >
                  {type.icon}
                  <span>{type.label}</span>
                </button>
              ))}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your feedback..."
              disabled={isSubmitting}
              rows={4}
              className="w-full rounded-lg border border-theme bg-surface-soft px-3 py-2 text-xs text-primary placeholder:text-muted outline-none focus:border-indigo-500/50 transition-colors resize-none disabled:opacity-50"
            />

            {error && (
              <p className="text-[11px] text-red-400 mt-2">{error}</p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !message.trim()}
              className={[
                'mt-4 flex items-center justify-center gap-2 w-full rounded-lg px-4 py-2 text-xs font-semibold text-white transition-all',
                isSubmitting || !message.trim()
                  ? 'bg-slate-600 cursor-not-allowed opacity-50'
                  : 'bg-indigo-600 hover:bg-indigo-500 active:scale-95 cursor-pointer',
              ].join(' ')}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Send</span>
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
