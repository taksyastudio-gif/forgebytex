import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  FilePlus2,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Square,
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
}

type LanguageOption = {
  id: SupportedLanguage;
  label: string;
  shortLabel: string;
  status: 'LIVE' | 'SOON';
};

const LANGUAGES: LanguageOption[] = [
  {
    id: 'c',
    label: 'C Language',
    shortLabel: 'C',
    status: 'LIVE',
  },
  {
    id: 'html',
    label: 'HTML5 Sandbox',
    shortLabel: 'HTML',
    status: 'LIVE',
  },
  {
    id: 'python',
    label: 'Python 3',
    shortLabel: 'PY',
    status: 'LIVE',
  },
  {
    id: 'css',
    label: 'CSS3 Styles',
    shortLabel: 'CSS',
    status: 'LIVE',
  },
  {
    id: 'javascript',
    label: 'JavaScript ES6+',
    shortLabel: 'JS',
    status: 'LIVE',
  },
  {
    id: 'sql',
    label: 'SQLite',
    shortLabel: 'SQL',
    status: 'SOON',
  },
  {
    id: 'plaintext',
    label: 'Plain Text',
    shortLabel: 'TXT',
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

const InstagramIcon: React.FC<{ size?: number; className?: string }> = ({ size = 14, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

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
}) => {
  const [isLangDropdownOpen, setIsLangDropdownOpen] =
    useState(false);

  const languageMenuRef = useRef<HTMLDivElement>(null);

  /*
   * Close language dropdown when clicking outside.
   */
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!languageMenuRef.current) return;

      if (
        !languageMenuRef.current.contains(
          event.target as Node
        )
      ) {
        setIsLangDropdownOpen(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handlePointerDown
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handlePointerDown
      );
    };
  }, []);

  /*
   * Close language dropdown with Escape.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLangDropdownOpen(false);
      }
    };

    document.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, []);

  const activeLanguageOption =
    LANGUAGES.find(
      (language) => language.id === activeLanguage
    ) ?? LANGUAGES[0];

  return (
    <header
      className={[
        'app-header z-30 flex w-full shrink-0 select-none flex-col border-b',
        isFocusMode ? 'is-compact' : '',
      ].join(' ')}
    >
      {/* =========================================================
          DEV UPDATE BANNER
      ========================================================== */}

      {!isFocusMode && (
      <div className="dev-banner flex min-h-[32px] w-full items-center justify-between gap-3 border-b px-3 py-1.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>

          <span className="shrink-0 rounded border border-indigo-500/30 bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-indigo-300 sm:text-[10px]">
            DEV UPDATES
          </span>

          <span className="hidden truncate text-[11px] font-medium text-slate-300 sm:block">
            Report bugs & get the latest feature patches
            directly from the dev!
          </span>
        </div>

        <a
          href="https://www.instagram.com/taksyastudio"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visit @taksyastudio on Instagram"
          className="group flex shrink-0 items-center gap-1.5 text-xs font-semibold text-indigo-400 transition-colors hover:text-indigo-300"
        >
          <InstagramIcon
            size={14}
            className="text-pink-400 transition-transform group-hover:scale-110"
          />

          <span className="hidden sm:inline">
            @taksyastudio →
          </span>
        </a>
      </div>
      )}

      {/* =========================================================
          MAIN HEADER
      ========================================================== */}

      <div className="main-header-row flex w-full items-center gap-3 px-3 py-2 sm:px-4">
        {/* -------------------------------------------------------
            BYTEPLAY BRAND
        -------------------------------------------------------- */}

        <div className="brand-block flex shrink-0 items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-[1.5px] shadow-lg shadow-indigo-500/20 sm:h-10 sm:w-10">
            <div className="flex h-full w-full items-center justify-center rounded-[10.5px] bg-[#0b0e17]">
              <svg
                className="h-5 w-5 text-indigo-400 sm:h-6 sm:w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
                />
              </svg>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-base font-black tracking-tight text-transparent sm:text-lg">
                forgebyteX
              </span>

              <span className="hidden rounded-full border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-indigo-400 min-[1100px]:inline-block">
                ARENA PRO
              </span>
            </div>

            <p className="text-[8px] font-mono uppercase tracking-[0.18em] text-slate-500 sm:text-[9px] sm:tracking-widest">
              TAKSYA STUDIO
            </p>
          </div>
        </div>

        {/* =======================================================
            TAKSYA PROMO / WORDMARK
        ======================================================== */}

        {!isFocusMode && (
        <div className="hidden min-w-0 flex-1 md:flex">
          <div className="promo-strip group relative flex h-11 min-w-0 w-full max-w-2xl items-center overflow-hidden rounded-xl border px-3 shadow-lg transition-colors duration-300">
            {/* Ambient glow */}

            <div className="pointer-events-none absolute -left-12 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full bg-cyan-400/5 blur-3xl transition-all duration-500 group-hover:bg-cyan-400/10" />

            <div className="relative z-10 flex min-w-0 flex-1 items-center gap-3">
              {/* =================================================
                  TAKSYA WORDMARK
              ================================================== */}

              <div className="flex h-9 w-[150px] shrink-0 items-center justify-center overflow-visible lg:w-[175px]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 560 120"
                  className="h-full w-full"
                  role="img"
                  aria-label="Taksya Studio"
                >
                  <defs>
                    <linearGradient
                      id="taksyaAccent"
                      x1="0%"
                      y1="100%"
                      x2="100%"
                      y2="0%"
                    >
                      <stop
                        offset="0%"
                        stopColor="#22d3ee"
                      />
                      <stop
                        offset="50%"
                        stopColor="#6366f1"
                      />
                      <stop
                        offset="100%"
                        stopColor="#c084fc"
                      />
                    </linearGradient>

                    <linearGradient
                      id="taksyaWhite"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      <stop
                        offset="0%"
                        stopColor="#ffffff"
                      />
                      <stop
                        offset="100%"
                        stopColor="#e2e8f0"
                      />
                    </linearGradient>

                    <filter
                      id="taksyaGlow"
                      x="-20%"
                      y="-30%"
                      width="140%"
                      height="160%"
                    >
                      <feGaussianBlur
                        stdDeviation="1.8"
                        result="blur"
                      />

                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* T */}

                  <path
                    d="M15 13H94V29H67V77H42V29H15Z"
                    fill="url(#taksyaWhite)"
                  />

                  <path
                    d="M42 55L55 42V77H42Z"
                    fill="url(#taksyaAccent)"
                    opacity="0.95"
                  />

                  {/* A */}

                  <path
                    d="M91 77L118 13H143L171 77H146L141 64H119L114 77ZM125 48H136L130.5 30Z"
                    fill="url(#taksyaWhite)"
                  />

                  <path
                    d="M119 64H141L146 77H114Z"
                    fill="url(#taksyaAccent)"
                  />

                  {/* K */}

                  <path
                    d="M170 13H195V36L220 13H249L218 44L251 77H222L195 51V77H170Z"
                    fill="url(#taksyaWhite)"
                  />

                  <path
                    d="M195 36L220 13H237L207 44L222 60L211 71L195 56Z"
                    fill="url(#taksyaAccent)"
                    opacity="0.95"
                  />

                  {/* S */}

                  <path
                    d="
                      M321 13
                      H267
                      C258 13 253 18 253 27
                      V33
                      C253 42 258 47 268 49
                      L299 56
                      C303 57 305 59 305 63
                      V64
                      C305 67 303 69 299 69
                      H253
                      V77
                      H310
                      C320 77 326 71 326 62
                      V55
                      C326 46 321 41 311 39
                      L280 32
                      C276 31 274 29 274 26
                      V25
                      C274 22 276 21 280 21
                      H321
                      Z
                    "
                    fill="url(#taksyaWhite)"
                  />

                  <path
                    d="
                      M321 13
                      H267
                      C258 13 253 18 253 27
                      V33
                      H274
                      V25
                      C274 22 276 21 280 21
                      H321
                      Z
                    "
                    fill="url(#taksyaAccent)"
                  />

                  <path
                    d="
                      M305 64
                      C305 67 303 69 299 69
                      H253
                      V77
                      H310
                      C320 77 326 71 326 62
                      V55
                      H305
                      Z
                    "
                    fill="url(#taksyaAccent)"
                    opacity="0.85"
                  />

                  {/* Y */}

                  <path
                    d="
                      M330 13
                      H356
                      L374 37
                      L392 13
                      H418
                      L386 54
                      V77
                      H362
                      V54
                      Z
                    "
                    fill="url(#taksyaWhite)"
                  />

                  <path
                    d="
                      M362 54
                      L374 37
                      L386 54
                      V77
                      H362
                      Z
                    "
                    fill="url(#taksyaAccent)"
                  />

                  {/* Final A */}

                  <path
                    d="
                      M407 77
                      L434 13
                      H459
                      L487 77
                      H462
                      L457 64
                      H435
                      L430 77
                      Z
                      M441 48
                      H452
                      L446.5 30
                      Z
                    "
                    fill="url(#taksyaWhite)"
                  />

                  <path
                    d="M435 64H457L462 77H430Z"
                    fill="url(#taksyaAccent)"
                  />

                  {/* STUDIO DIVIDER */}

                  <line
                    x1="52"
                    y1="96"
                    x2="205"
                    y2="96"
                    stroke="url(#taksyaAccent)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    filter="url(#taksyaGlow)"
                  />

                  <circle
                    cx="207"
                    cy="96"
                    r="3"
                    fill="#8b5cf6"
                    filter="url(#taksyaGlow)"
                  />

                  <line
                    x1="353"
                    y1="96"
                    x2="506"
                    y2="96"
                    stroke="url(#taksyaAccent)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    filter="url(#taksyaGlow)"
                  />

                  <circle
                    cx="351"
                    cy="96"
                    r="3"
                    fill="#8b5cf6"
                    filter="url(#taksyaGlow)"
                  />

                  <text
                    x="280"
                    y="101"
                    textAnchor="middle"
                    fill="#f8fafc"
                    fontFamily="Arial, Helvetica, sans-serif"
                    fontSize="15"
                    fontWeight="500"
                    letterSpacing="11"
                  >
                    STUDIO
                  </text>
                </svg>
              </div>

              <span className="hidden truncate text-xs font-semibold text-slate-300 lg:block">
                Something huge is cooking...
              </span>
            </div>

            {/* Coming Soon */}

            <div className="relative z-10 ml-2 flex shrink-0 items-center">
              <span className="whitespace-nowrap rounded-full border border-cyan-400/30 bg-cyan-500/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-cyan-300 sm:text-[9px]">
                COMING SOON 🚀
              </span>
            </div>
          </div>
        </div>
        )}

        {/* =======================================================
            RIGHT CONTROLS
        ======================================================== */}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Theme */}

          <div className="relative">
            <select
              value={activeTheme}
              onChange={(event) =>
                onThemeSelect(
                  event.target.value as EditorTheme
                )
              }
              aria-label="Application theme"
              className="select-control appearance-none cursor-pointer rounded-xl border px-2.5 py-1.5 pr-8 text-xs font-medium outline-none transition-all"
            >
              {THEMES.map((theme) => (
                <option
                  key={theme.id}
                  value={theme.id}
                >
                  {theme.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" size={14} />
          </div>

          <button
            type="button"
            onClick={onToggleFocusMode}
            className="icon-action h-8 w-8 rounded-xl"
            aria-label={isFocusMode ? 'Expand header' : 'Focus coding workspace'}
            title={isFocusMode ? 'Expand header' : 'Focus coding workspace'}
          >
            {isFocusMode ? (
              <Maximize2 size={14} />
            ) : (
              <Minimize2 size={14} />
            )}
          </button>

          {/* Language */}

          <div
            ref={languageMenuRef}
            className="relative"
          >
            <button
              type="button"
              onClick={() =>
                setIsLangDropdownOpen(
                  (previous) => !previous
                )
              }
              aria-haspopup="menu"
              aria-expanded={isLangDropdownOpen}
              aria-label="Select programming language"
              className="flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-950/50 px-3 py-1.5 text-xs font-bold text-indigo-300 transition-all hover:bg-indigo-900/60 active:scale-95"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-500/50" />

              <span className="uppercase">
                {activeLanguageOption.shortLabel}
              </span>

              <ChevronDown
                size={14}
                strokeWidth={2.5}
                className={`transition-transform duration-200 ${
                  isLangDropdownOpen
                    ? 'rotate-180'
                    : ''
                }`}
              />
            </button>

            {isLangDropdownOpen && (
              <div
                role="menu"
                className="dropdown-menu absolute right-0 top-full z-[100] mt-2 w-52 overflow-hidden rounded-2xl border py-1.5 shadow-2xl backdrop-blur-xl"
              >
                {LANGUAGES.map((language) => {
                  const isActive =
                    activeLanguage === language.id;

                  const isLive =
                    language.status === 'LIVE';

                  return (
                    <button
                      key={language.id}
                      type="button"
                      role="menuitem"
                      disabled={!isLive}
                      onClick={() => {
                        if (!isLive) return;

                        onLanguageSelect(
                          language.id
                        );

                        setIsLangDropdownOpen(false);
                      }}
                      className={[
                        'flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs transition-colors',
                        isActive
                          ? 'border-l-2 border-indigo-500 bg-indigo-600/20 font-bold text-indigo-300'
                          : isLive
                            ? 'text-slate-300 hover:bg-slate-800/70'
                            : 'cursor-not-allowed text-slate-600',
                      ].join(' ')}
                    >
                      <span className="font-medium">
                        {language.label}
                      </span>

                      <span
                        className={[
                          'rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold',
                          isLive
                            ? 'border border-emerald-800/40 bg-emerald-950/60 text-emerald-400'
                            : 'bg-slate-900 text-slate-600',
                        ].join(' ')}
                      >
                        {language.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================
          ACTION BAR
      ========================================================== */}

      <div className="action-bar flex w-full items-center justify-between gap-3 overflow-x-auto border-t px-3 py-2 sm:px-4">
        {/* Left Actions */}

        <div className="flex shrink-0 items-center gap-2">
          {!isRunning ? (
            <button
              type="button"
              onClick={onRun}
              aria-label="Run code"
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-500 active:scale-95"
            >
              <Play
                size={13}
                fill="currentColor"
              />

              <span className="hidden sm:inline">
                Run Code
              </span>

              <span className="sm:hidden">
                Run
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onRun}
              aria-label="Stop execution"
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg shadow-red-900/20 transition-all hover:bg-red-500 active:scale-95"
            >
              <Square
                size={12}
                fill="currentColor"
              />

              <span className="hidden sm:inline">
                Stop Execution
              </span>

              <span className="sm:hidden">
                Stop
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onClear}
            aria-label="Clear terminal"
            className="secondary-action gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium"
          >
            <Trash2 size={13} />

            <span className="hidden sm:inline">
              Clear
            </span>
          </button>

          <button
            type="button"
            onClick={onBuggySample}
            aria-label="Load buggy sample"
            className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-all hover:bg-amber-500/20 active:scale-95"
          >
            <TriangleAlert size={13} />

            <span className="hidden sm:inline">
              Buggy Sample
            </span>

            <span className="sm:hidden">
              Bug
            </span>
          </button>

          <button
            type="button"
            onClick={onReset}
            aria-label="Reset workspace"
            className="secondary-action gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium"
          >
            <RotateCcw size={13} />

            <span className="hidden sm:inline">
              Reset
            </span>
          </button>
        </div>

        {/* Right Actions */}

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onNewFile}
            aria-label="Create new file"
            className="secondary-action gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium"
          >
            <FilePlus2 size={13} />

            <span className="hidden sm:inline">
              New File
            </span>

            <span className="sm:hidden">
              New
            </span>
          </button>

          <button
            type="button"
            onClick={onExport}
            aria-label="Export code"
            className="flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600/20 px-3 py-1.5 text-xs font-semibold text-indigo-300 transition-all hover:bg-indigo-600/30 active:scale-95"
          >
            <Download size={13} />

            <span className="hidden sm:inline">
              Export Code
            </span>

            <span className="sm:hidden">
              Export
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default HeaderControls;
