import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FC,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  Bug,
  CheckCircle2,
  Heart,
  Lightbulb,
  Loader2,
  Send,
  X,
} from 'lucide-react';

import type {
  EditorTheme,
  SupportedLanguage,
} from '../types/byteplay';
import {
  submitUserFeedback,
  type FeedbackSubmission,
} from '../lib/supabase';

type FeedbackType = 'bug' | 'suggestion' | 'feedback';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: EditorTheme;
  currentLanguage: SupportedLanguage;
}

interface FeedbackTypeOption {
  value: FeedbackType;
  label: string;
  icon: ReactNode;
}

const FEEDBACK_TYPES: FeedbackTypeOption[] = [
  {
    value: 'bug',
    label: 'Bug',
    icon: <Bug aria-hidden="true" size={16} />,
  },
  {
    value: 'suggestion',
    label: 'Suggestion',
    icon: <Lightbulb aria-hidden="true" size={16} />,
  },
  {
    value: 'feedback',
    label: 'Feedback',
    icon: <Heart aria-hidden="true" size={16} />,
  },
];

const APP_VERSION = '0.0.0';
const MAX_MESSAGE_LENGTH = 5000;
const SUCCESS_CLOSE_DELAY_MS = 2000;

export const FeedbackModal: FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  currentLanguage,
}) => {
  const [selectedType, setSelectedType] =
    useState<FeedbackType>('bug');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeTimerRef = useRef<number | null>(null);
  const messageInputRef =
    useRef<HTMLTextAreaElement | null>(null);

  const handleClose = useCallback((): void => {
    if (isSubmitting) {
      return;
    }

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setIsSuccess(false);
    setError(null);
    setMessage('');
    onClose();
  }, [isSubmitting, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    messageInputRef.current?.focus();

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isSubmitting) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [handleClose, isOpen, isSubmitting]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (): Promise<void> => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      setError('Please enter a message.');
      messageInputRef.current?.focus();
      return;
    }

    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      setError(
        `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.`,
      );
      messageInputRef.current?.focus();
      return;
    }

    const payload: FeedbackSubmission = {
      type: selectedType,
      message: trimmedMessage,
      theme: currentTheme,
      language: currentLanguage,
      app_version: APP_VERSION,
    };

    setIsSubmitting(true);
    setError(null);

    try {
      await submitUserFeedback(payload);

      setIsSuccess(true);
      setMessage('');

      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setIsSuccess(false);
        onClose();
      }, SUCCESS_CLOSE_DELAY_MS);
    } catch (submissionError: unknown) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Failed to submit feedback. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropMouseDown = (
    event: MouseEvent<HTMLDivElement>,
  ): void => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  };

  return (
    <div
      aria-hidden={false}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        aria-labelledby="feedback-title"
        aria-modal="true"
        className="modal-panel w-full max-w-md rounded-xl border p-4 shadow-2xl"
        role="dialog"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2
              className="text-sm font-bold text-primary"
              id="feedback-title"
            >
              Feedback
            </h2>

            <p className="mt-1 text-[10px] text-secondary">
               Help improve VLNTOX with an optional feedback
              submission.
            </p>
          </div>

          <button
            aria-label="Close feedback dialog"
            className="icon-action rounded p-1"
            disabled={isSubmitting}
            onClick={handleClose}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        {isSuccess ? (
          <div
            className="flex flex-col items-center justify-center py-8 text-center"
            role="status"
          >
            <CheckCircle2
              aria-hidden="true"
              className="mb-2 text-emerald-500"
              size={32}
            />

            <p className="text-sm font-medium text-primary">
              Thank you for your feedback!
            </p>

            <p className="mt-1 text-xs text-secondary">
               Your message helps shape the next VLNTOX version.
            </p>
          </div>
        ) : (
          <>
            <div
              aria-label="Feedback type"
              className="mb-4 flex gap-2"
              role="radiogroup"
            >
              {FEEDBACK_TYPES.map((feedbackType) => {
                const isSelected =
                  selectedType === feedbackType.value;

                return (
                  <button
                    aria-checked={isSelected}
                    className={[
                      'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                      isSelected
                        ? 'border-indigo-500/30 bg-indigo-600/10 text-indigo-400'
                        : 'border-theme bg-surface-soft text-secondary hover:bg-surface-raised hover:text-primary',
                      isSubmitting
                        ? 'cursor-not-allowed opacity-50'
                        : '',
                    ].join(' ')}
                    disabled={isSubmitting}
                    key={feedbackType.value}
                    onClick={() =>
                      setSelectedType(feedbackType.value)
                    }
                    role="radio"
                    type="button"
                  >
                    {feedbackType.icon}
                    <span>{feedbackType.label}</span>
                  </button>
                );
              })}
            </div>

            <label
              className="mb-1 block text-[11px] font-semibold text-primary"
              htmlFor="feedback-message"
            >
              Message
            </label>

            <textarea
              aria-describedby={
                error
                  ? 'feedback-error feedback-count'
                  : 'feedback-count'
              }
              className="input-field w-full resize-none rounded-lg border px-3 py-2 text-xs outline-none placeholder:text-muted disabled:opacity-50"
              disabled={isSubmitting}
              id="feedback-message"
              maxLength={MAX_MESSAGE_LENGTH}
              onChange={(event) => {
                setMessage(event.target.value);
                setError(null);
              }}
              placeholder="Describe a bug, idea, or improvement..."
              ref={messageInputRef}
              rows={5}
              value={message}
            />

            <div className="mt-1 flex justify-between text-[10px] text-secondary">
              <span id="feedback-count">
                {message.length}/{MAX_MESSAGE_LENGTH}
              </span>

              <span>
                Current language: {currentLanguage}
              </span>
            </div>

            {error ? (
              <p
                className="mt-2 text-[11px] text-red-400"
                id="feedback-error"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <button
              className="primary-action mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting || !message.trim()}
              onClick={() => void handleSubmit()}
              type="button"
            >
              {isSubmitting ? (
                <>
                  <Loader2
                    aria-hidden="true"
                    className="animate-spin"
                    size={14}
                  />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send aria-hidden="true" size={14} />
                  <span>Send feedback</span>
                </>
              )}
            </button>
          </>
        )}
      </section>
    </div>
  );
};

export default FeedbackModal;