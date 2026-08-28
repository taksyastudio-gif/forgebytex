import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Square,
  Trash2,
  TriangleAlert,
  FilePlus2,
  Download,
  MessageSquare,
} from 'lucide-react';

import type {
  SupportedLanguage,
  EditorTheme,
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

  onLanguageSelect: (lang: SupportedLanguage) => void;
  onThemeSelect: (theme: EditorTheme) => void;
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
  onFeedbackClick: () => void;
}

type LanguageOption = {
  id: SupportedLanguage;
  label: string;
  shortLabel: string;
  subtitle: string;
  status: 'LIVE' | 'SOON';
};

const PRIMARY_LANGUAGES: LanguageOption[] = [
  {
    id: 'c',
    label: 'C Language',
    shortLabel: 'C',
    subtitle: 'Native GCC WebAssembly',
    status: 'LIVE',
  },
  {
    id: 'python',
    label: 'Python 3',
    shortLabel: 'PYTHON',
    subtitle: 'Pyodide 3.11 with REPL Stdin',
    status: 'LIVE',
  },
  {
    id: 'html',
    label: 'HTML Web Project',
    shortLabel: 'WEB (HTML)',
    subtitle: 'HTML5, CSS & JS Sandbox',
    status: 'LIVE',
  },
  {
    id: 'plaintext',
    label: 'Plain Text',
    shortLabel: 'TXT',
    subtitle: 'Text Notes & Scratches',
    status: 'LIVE',
  },
];

const THEMES: Array<{
  id: EditorTheme;
  label: string;
}> = [
  {
    id: 'black',
    label: 'Black',
  },
  {
    id: 'white',
    label: 'White',
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
  },
];

export const HeaderControls: React.FC<HeaderControlsProps> = ({
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
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        languageMenuRef.current &&
        !languageMenuRef.current.contains(event.target as Node)
      ) {
        setIsLangDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  // Close dropdown with Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLangDropdownOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Map active language (including css/js) to primary representation
  const displayLanguageId =
    activeLanguage === 'css' || activeLanguage === 'javascript'
      ? 'html'
      : activeLanguage;

  const activeOption =
    PRIMARY_LANGUAGES.find((lang) => lang.id === displayLanguageId) ??
    PRIMARY_LANGUAGES[0];

  return (
    <header className="app-header z-30 flex w-full shrink-0 select-none flex-col border-b border-theme bg-surface">
      <div className="main-header-row flex h-13 w-full items-center justify-between gap-3 px-4">
        {/* BRANDING & IDENTITY */}
        <div className="brand-block flex items-center gap-2.5 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm overflow-hidden">
            <img src="/favicon.svg" alt="ForgeByteX" className="w-6 h-6" />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-primary font-sans leading-tight">
                forgebyteX
              </span>
              <span className="text-[10px] text-muted font-sans leading-tight">
                by TAKSYA STUDIO
              </span>
            </div>
            <span className="rounded bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-400 uppercase tracking-wide">
              PRO
            </span>
          </div>
        </div>

        {/* CENTER / PRIMARY ACTIONS */}
        <div className="flex items-center gap-2">
          {/* RUN CODE BUTTON */}
          {!isRunning ? (
            <button
              type="button"
              onClick={onRun}
              aria-label="Run code"
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95 cursor-pointer"
            >
              <Play size={13} fill="currentColor" />
              <span>Run Code</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onRun}
              aria-label="Stop execution"
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-red-500 active:scale-95 cursor-pointer"
            >
              <Square size={12} fill="currentColor" />
              <span>Stop Execution</span>
            </button>
          )}

          {/* SECONDARY ACTION BUTTONS */}
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear terminal"
            title="Clear terminal"
            className="flex items-center gap-1.5 rounded-lg border border-theme bg-surface-soft px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-primary cursor-pointer"
          >
            <Trash2 size={13} />
            <span className="hidden sm:inline">Clear</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            aria-label="Reset workspace"
            title="Reset workspace"
            className="flex items-center gap-1.5 rounded-lg border border-theme bg-surface-soft px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-primary cursor-pointer"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            type="button"
            onClick={onBuggySample}
            aria-label="Load sample bug"
            title="Load sample bug"
            className="flex items-center gap-1.5 rounded-lg border border-theme bg-surface-soft px-3 py-1.5 text-xs font-medium text-amber-500/90 transition-colors hover:bg-amber-500/10 cursor-pointer"
          >
            <TriangleAlert size={13} />
            <span className="hidden sm:inline">Sample Bug</span>
          </button>

          <div className="h-4 w-[1px] bg-theme mx-1 hidden md:block" />

          <button
            type="button"
            onClick={onNewFile}
            aria-label="Create new file"
            className="hidden md:flex items-center gap-1.5 rounded-lg border border-theme bg-surface-soft px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-primary cursor-pointer"
          >
            <FilePlus2 size={13} />
            <span>New File</span>
          </button>

          <button
            type="button"
            onClick={onExport}
            aria-label="Export code"
            className="hidden md:flex items-center gap-1.5 rounded-lg border border-theme bg-surface-soft px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface-raised hover:text-primary cursor-pointer"
          >
            <Download size={13} />
            <span>Export</span>
          </button>
        </div>

        {/* RIGHT CONTROLS: LANGUAGE & THEME */}
        <div className="flex items-center gap-2 shrink-0">
          {/* FEEDBACK BUTTON */}
          <button
            type="button"
            onClick={onFeedbackClick}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-theme bg-surface-soft text-secondary transition-colors hover:bg-surface-raised hover:text-primary cursor-pointer"
            aria-label="Send feedback"
            title="Feedback"
          >
            <MessageSquare size={14} />
          </button>

          {/* PRIMARY LANGUAGE SELECTOR DROPDOWN */}
          <div ref={languageMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsLangDropdownOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={isLangDropdownOpen}
              aria-label="Select programming language"
              className="flex items-center gap-2 rounded-lg border border-theme bg-surface-soft px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-surface-raised cursor-pointer"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="uppercase">{activeOption.shortLabel}</span>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${
                  isLangDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isLangDropdownOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-theme bg-surface shadow-xl py-1"
              >
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted border-b border-theme">
                  Select Language Mode
                </div>
                {PRIMARY_LANGUAGES.map((lang) => {
                  const isActive = displayLanguageId === lang.id;
                  return (
                    <button
                      key={lang.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onLanguageSelect(lang.id);
                        setIsLangDropdownOpen(false);
                      }}
                      className={[
                        'flex w-full flex-col px-3.5 py-2 text-left text-xs transition-colors cursor-pointer',
                        isActive
                          ? 'bg-indigo-600/15 border-l-2 border-indigo-500 font-semibold text-indigo-400'
                          : 'border-l-2 border-transparent text-secondary hover:bg-surface-raised hover:text-primary',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-primary">
                          {lang.label}
                        </span>
                        <span className="text-[10px] font-mono text-muted uppercase">
                          {lang.shortLabel}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted font-normal mt-0.5">
                        {lang.subtitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* THEME SELECTOR */}
          <div className="relative">
            <select
              value={activeTheme}
              onChange={(e) => onThemeSelect(e.target.value as EditorTheme)}
              aria-label="Application theme"
              className="appearance-none rounded-lg border border-theme bg-surface-soft px-3 py-1.5 pr-7 text-xs font-medium text-primary outline-none transition-colors hover:bg-surface-raised cursor-pointer"
            >
              {THEMES.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
            />
          </div>

          {/* FOCUS MODE TOGGLE */}
          <button
            type="button"
            onClick={onToggleFocusMode}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-theme bg-surface-soft text-secondary transition-colors hover:bg-surface-raised hover:text-primary cursor-pointer"
            aria-label={isFocusMode ? 'Exit focus mode' : 'Focus mode'}
            title={isFocusMode ? 'Exit focus mode' : 'Focus mode'}
          >
            {isFocusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>
    </header>
  );
};

export default HeaderControls;
