import {
  ChevronDown,
  Download,
  FilePlus2,
  Maximize2,
  MessageSquare,
  Play,
  RotateCcw,
  Square,
  Trash2,
  TriangleAlert,
  Minimize2,
} from 'lucide-react';
import { useEffect, useRef, useState, type FC } from 'react';

import type {
  EditorTheme,
  SupportedLanguage,
} from '../types/byteplay';

interface HeaderControlsProps {
  activeLanguage: SupportedLanguage;
  activeTheme: EditorTheme;
  isRunning: boolean;

  onRun: () => void;
  onClear: () => void;
  onBuggySample: () => void;
  onReset: () => void;
  onNewFile: () => void;
  onExport: () => void;

  onLanguageSelect: (language: SupportedLanguage) => void;
  onThemeSelect: (theme: EditorTheme) => void;

  isFocusMode: boolean;
  onToggleFocusMode: () => void;
  onFeedbackClick: () => void;
}

interface LanguageOption {
  id: SupportedLanguage;
  label: string;
  shortLabel: string;
  subtitle: string;
  status: 'LIVE' | 'SOON';
}

const PRIMARY_LANGUAGES: LanguageOption[] = [
  {
    id: 'c',
    label: 'C Language',
    shortLabel: 'C',
    subtitle: 'Native browser WebAssembly compiler',
    status: 'LIVE',
  },
  {
    id: 'cpp',
    label: 'C++ Language',
    shortLabel: 'C++',
    subtitle: 'Native browser WebAssembly compiler',
    status: 'LIVE',
  },
  {
    id: 'python',
    label: 'Python 3',
    shortLabel: 'PYTHON',
    subtitle: 'Pyodide with interactive stdin',
    status: 'LIVE',
  },
  {
    id: 'html',
    label: 'HTML Web Project',
    shortLabel: 'WEB',
    subtitle: 'HTML, CSS and JavaScript sandbox',
    status: 'LIVE',
  },
  {
    id: 'plaintext',
    label: 'Plain Text',
    shortLabel: 'TXT',
    subtitle: 'Notes and scratch files',
    status: 'LIVE',
  },
];

const THEMES: Array<{ id: EditorTheme; label: string }> = [
  { id: 'black', label: 'Black' },
  { id: 'white', label: 'White' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
];

export const HeaderControls: FC<HeaderControlsProps> = ({
  activeLanguage,
  activeTheme,
  isRunning,
  onRun,
  onClear,
  onBuggySample,
  onReset,
  onNewFile,
  onExport,
  onLanguageSelect,
  onThemeSelect,
  isFocusMode,
  onToggleFocusMode,
  onFeedbackClick,
}) => {
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] =
    useState(false);

  const languageMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target;

      if (
        languageMenuRef.current &&
        target instanceof Node &&
        !languageMenuRef.current.contains(target)
      ) {
        setIsLanguageMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);

    return () => {
      document.removeEventListener(
        'mousedown',
        handlePointerDown,
      );
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsLanguageMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const displayLanguage =
    activeLanguage === 'css' ||
    activeLanguage === 'javascript'
      ? 'html'
      : activeLanguage;

  const activeLanguageOption =
    PRIMARY_LANGUAGES.find(
      (language) => language.id === displayLanguage,
    ) ?? PRIMARY_LANGUAGES[0];

  return (
    <header className="app-header z-30 flex w-full shrink-0 select-none flex-col border-b border-theme bg-surface">
      <div className="main-header-row flex min-h-[52px] w-full items-center justify-between gap-3 px-3 sm:px-4">
        <div className="brand-block flex min-w-0 shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-indigo-600 text-white shadow-sm">
            <img
              alt="ForgeByteX"
              className="h-6 w-6"
              src="/favicon.svg"
            />
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold leading-tight tracking-tight text-primary sm:text-base">
                ForgeByteX
              </span>
              <span className="hidden text-[10px] leading-tight text-muted sm:block">
                by TAKSYA STUDIO
              </span>
            </div>

            <span className="hidden rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-400 md:inline">
              Browser IDE
            </span>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-center gap-1.5 sm:gap-2">
          <button
            aria-label={
              isRunning ? 'Stop execution' : 'Run code'
            }
            className={[
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4',
              isRunning
                ? 'bg-red-700 hover:bg-red-600 focus-visible:ring-red-500'
                : 'bg-emerald-700 hover:bg-emerald-600 focus-visible:ring-emerald-500',
            ].join(' ')}
            onClick={onRun}
            type="button"
          >
            {isRunning ? (
              <Square
                aria-hidden="true"
                fill="currentColor"
                size={12}
              />
            ) : (
              <Play
                aria-hidden="true"
                fill="currentColor"
                size={13}
              />
            )}

            <span className="hidden sm:inline">
              {isRunning ? 'Stop Execution' : 'Run Code'}
            </span>
          </button>

          <button
            aria-label="Clear terminal"
            className="secondary-action flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium sm:px-3"
            onClick={onClear}
            title="Clear terminal"
            type="button"
          >
            <Trash2 aria-hidden="true" size={13} />
            <span className="hidden sm:inline">Clear</span>
          </button>

          <button
            aria-label="Reset workspace"
            className="secondary-action flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium sm:px-3"
            onClick={onReset}
            title="Reset workspace"
            type="button"
          >
            <RotateCcw aria-hidden="true" size={13} />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            aria-label="Load debugging sample"
            className="secondary-action hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-amber-500/90 hover:bg-amber-500/10 md:flex"
            onClick={onBuggySample}
            title="Load sample with an intentional error"
            type="button"
          >
            <TriangleAlert aria-hidden="true" size={13} />
            <span>Sample Bug</span>
          </button>

          <span
            aria-hidden="true"
            className="mx-1 hidden h-4 w-px bg-[var(--border)] md:block"
          />

          <button
            aria-label="Create new file"
            className="secondary-action hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium md:flex"
            onClick={onNewFile}
            type="button"
          >
            <FilePlus2 aria-hidden="true" size={13} />
            <span>New File</span>
          </button>

          <button
            aria-label="Export project"
            className="secondary-action hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium md:flex"
            onClick={onExport}
            type="button"
          >
            <Download aria-hidden="true" size={13} />
            <span>Export</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            aria-label="Send feedback"
            className="secondary-action flex h-8 w-8 items-center justify-center rounded-lg border"
            onClick={onFeedbackClick}
            title="Feedback"
            type="button"
          >
            <MessageSquare aria-hidden="true" size={14} />
          </button>

          <div
            className="relative"
            ref={languageMenuRef}
          >
            <button
              aria-expanded={isLanguageMenuOpen}
              aria-haspopup="menu"
              aria-label="Select programming language"
              className="secondary-action flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold sm:gap-2 sm:px-3"
              onClick={() =>
                setIsLanguageMenuOpen((current) => !current)
              }
              type="button"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-emerald-500"
              />
              <span className="uppercase">
                {activeLanguageOption.shortLabel}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={[
                  'transition-transform',
                  isLanguageMenuOpen ? 'rotate-180' : '',
                ].join(' ')}
                size={14}
              />
            </button>

            {isLanguageMenuOpen ? (
              <div
                aria-label="Language modes"
                className="absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-theme bg-surface py-1 shadow-xl"
                role="menu"
              >
                <div className="border-b border-theme px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                  Select Language Mode
                </div>

                {PRIMARY_LANGUAGES.map((language) => {
                  const isActive =
                    displayLanguage === language.id;

                  return (
                    <button
                      className={[
                        'flex w-full flex-col border-l-2 px-3.5 py-2 text-left text-xs transition-colors',
                        isActive
                          ? 'border-indigo-500 bg-indigo-600/15 font-semibold text-indigo-400'
                          : 'border-transparent text-secondary hover:bg-surface-raised hover:text-primary',
                      ].join(' ')}
                      key={language.id}
                      onClick={() => {
                        onLanguageSelect(language.id);
                        setIsLanguageMenuOpen(false);
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <span className="flex items-center justify-between">
                        <span className="font-semibold text-primary">
                          {language.label}
                        </span>
                        <span className="font-mono text-[10px] uppercase text-muted">
                          {language.shortLabel}
                        </span>
                      </span>

                      <span className="mt-0.5 text-[11px] font-normal text-muted">
                        {language.subtitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="relative hidden sm:block">
            <select
              aria-label="Application theme"
              className="secondary-action appearance-none rounded-lg border bg-surface-soft px-3 py-1.5 pr-7 text-xs font-medium text-primary outline-none"
              onChange={(event) =>
                onThemeSelect(
                  event.target.value as EditorTheme,
                )
              }
              value={activeTheme}
            >
              {THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>

            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
              size={13}
            />
          </div>

          <button
            aria-label={
              isFocusMode
                ? 'Exit focus mode'
                : 'Enter focus mode'
            }
            className="secondary-action flex h-8 w-8 items-center justify-center rounded-lg border"
            onClick={onToggleFocusMode}
            title={
              isFocusMode
                ? 'Exit focus mode'
                : 'Focus mode'
            }
            type="button"
          >
            {isFocusMode ? (
              <Minimize2 aria-hidden="true" size={14} />
            ) : (
              <Maximize2 aria-hidden="true" size={14} />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-theme px-3 py-1 text-[10px] text-muted sm:px-4">
        <span>
          {isRunning
            ? 'Execution active'
            : 'Browser-native development environment'}
        </span>

        <span className="hidden sm:inline">
          F5 to run
        </span>
      </div>
    </header>
  );
};

export default HeaderControls;