import { useCallback, type FC } from 'react';
import Editor from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';
import {
  File,
  FileCode2,
  FileText,
  Globe2,
} from 'lucide-react';

import EditorSkeleton from './EditorSkeleton';
import type {
  EditorTheme,
  FileItem,
  SupportedLanguage,
} from '../types/byteplay';

interface CodeEditorProps {
  code: string;
  language: SupportedLanguage;
  theme: EditorTheme;
  files?: FileItem[];
  activeFileId?: string;
  onSelectFile?: (id: string) => void;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onMount?: (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoInstance: typeof monaco,
  ) => void;
}

const MONACO_LANGUAGE_MAP: Record<SupportedLanguage, string> = {
  c: 'c',
  cpp: 'cpp',
  html: 'html',
  python: 'python',
  css: 'css',
  javascript: 'javascript',
  sql: 'sql',
  plaintext: 'plaintext',
};

const registerMonacoThemes = (
  monacoInstance: typeof monaco,
): void => {
  const themes: Record<
    EditorTheme,
    monaco.editor.IStandaloneThemeData
  > = {
    black: {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#f0f6fc',
        'editor.lineHighlightBackground': '#161b22',
        'editor.selectionBackground': '#1f6feb40',
        'editorCursor.foreground': '#58a6ff',
        'editorIndentGuide.background': '#21262d',
        'editorIndentGuide.activeBackground': '#30363d',
        'editorLineNumber.foreground': '#484f58',
        'editorLineNumber.activeForeground': '#c9d1d9',
      },
    },
    white: {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#0f172a',
        'editor.lineHighlightBackground': '#f8fafc',
        'editor.selectionBackground': '#bfdbfe80',
        'editorCursor.foreground': '#2563eb',
        'editorIndentGuide.background': '#f1f5f9',
        'editorIndentGuide.activeBackground': '#cbd5e1',
        'editorLineNumber.foreground': '#94a3b8',
        'editorLineNumber.activeForeground': '#0f172a',
      },
    },
    cyberpunk: {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0f0e17',
        'editor.foreground': '#f2f0ff',
        'editor.lineHighlightBackground': '#18152e',
        'editor.selectionBackground': '#00f0ff35',
        'editorCursor.foreground': '#00f0ff',
        'editorIndentGuide.background': '#251f47',
        'editorIndentGuide.activeBackground': '#00f0ff',
        'editorLineNumber.foreground': '#585189',
        'editorLineNumber.activeForeground': '#a5f3fc',
      },
    },
  };

  for (const [themeName, themeData] of Object.entries(themes)) {
    monacoInstance.editor.defineTheme(themeName, themeData);
  }
};

const FileTabIcon: FC<{ language: SupportedLanguage }> = ({
  language,
}) => {
  switch (language) {
    case 'c':
    case 'cpp':
      return (
        <FileCode2
          aria-hidden="true"
          className="shrink-0 text-blue-400"
          size={13}
        />
      );

    case 'html':
      return (
        <Globe2
          aria-hidden="true"
          className="shrink-0 text-orange-400"
          size={13}
        />
      );

    case 'css':
      return (
        <FileCode2
          aria-hidden="true"
          className="shrink-0 text-pink-400"
          size={13}
        />
      );

    case 'javascript':
      return (
        <FileCode2
          aria-hidden="true"
          className="shrink-0 text-yellow-400"
          size={13}
        />
      );

    case 'python':
      return (
        <FileText
          aria-hidden="true"
          className="shrink-0 text-emerald-400"
          size={13}
        />
      );

    default:
      return (
        <File
          aria-hidden="true"
          className="shrink-0 text-slate-500"
          size={13}
        />
      );
  }
};

export const CodeEditor: FC<CodeEditorProps> = ({
  code,
  language,
  theme,
  files = [],
  activeFileId,
  onSelectFile,
  onChange,
  onFocus,
  onMount,
}) => {
  const handleBeforeMount = useCallback(
    (monacoInstance: typeof monaco): void => {
      registerMonacoThemes(monacoInstance);
    },
    [],
  );

  const handleMount = useCallback(
    (
      editor: monaco.editor.IStandaloneCodeEditor,
      monacoInstance: typeof monaco,
    ): void => {
      editor.onDidFocusEditorText(() => {
        onFocus?.();
      });

      onMount?.(editor, monacoInstance);
    },
    [onFocus, onMount],
  );

  return (
    <div className="code-editor-frame relative flex h-full min-h-[250px] w-full flex-1 flex-col overflow-hidden bg-editor-bg sm:min-h-[300px]">
      {files.length > 0 ? (
        <div
          aria-label="Open files"
          className="editor-tabs-bar flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-theme bg-surface px-2 select-none"
          role="tablist"
        >
          {files.map((file) => {
            const isActive = file.id === activeFileId;

            return (
              <button
                aria-selected={isActive}
                className={[
                  'flex items-center gap-2 rounded-t-md border-t-2 px-3 py-1 text-xs font-mono transition-colors',
                  isActive
                    ? 'border-indigo-500 bg-editor-bg font-semibold text-primary shadow-sm'
                    : 'border-transparent text-muted hover:bg-surface-raised hover:text-primary',
                ].join(' ')}
                key={file.id}
                onClick={() => onSelectFile?.(file.id)}
                role="tab"
                type="button"
              >
                <FileTabIcon language={file.language} />
                <span className="max-w-48 truncate">{file.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="relative h-full min-h-0 w-full flex-1">
        <Editor
          beforeMount={handleBeforeMount}
          height="100%"
          language={MONACO_LANGUAGE_MAP[language]}
          loading={<EditorSkeleton />}
          onChange={(value) => onChange(value ?? '')}
          onMount={handleMount}
          options={{
            accessibilitySupport: 'auto',
            acceptSuggestionOnEnter: 'on',
            automaticLayout: true,
            autoClosingBrackets: 'languageDefined',
            autoClosingQuotes: 'languageDefined',
            autoIndent: 'full',
            bracketPairColorization: {
              enabled: true,
            },
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            detectIndentation: true,
            folding: true,
            foldingHighlight: true,
            fontFamily:
              "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
            fontLigatures: true,
            fontSize: 14,
            formatOnPaste: false,
            formatOnType: false,
            glyphMargin: false,
            largeFileOptimizations: true,
            lineDecorationsWidth: 10,
            lineHeight: 22,
            lineNumbers: 'on',
            lineNumbersMinChars: 3,
            matchBrackets: 'always',
            minimap: {
              enabled: false,
            },
            mouseWheelZoom: true,
            parameterHints: {
              enabled: true,
            },
            quickSuggestions: true,
            renderControlCharacters: false,
            renderWhitespace: 'selection',
            scrollBeyondLastLine: false,
            scrollbar: {
              alwaysConsumeMouseWheel: false,
              horizontalScrollbarSize: 10,
              verticalScrollbarSize: 10,
            },
            showFoldingControls: 'mouseover',
            smoothScrolling: true,
            stickyScroll: {
              enabled: true,
            },
            suggestOnTriggerCharacters: true,
            tabCompletion: 'on',
            tabSize: 2,
            trimAutoWhitespace: true,
            wordWrap: 'off',
          }}
          theme={theme}
          value={code}
          width="100%"
        />
      </div>
    </div>
  );
};

export default CodeEditor;