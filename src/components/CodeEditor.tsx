import React from 'react';
import Editor from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';
import { FileCode2, Globe2, FileText, File } from 'lucide-react';

import type {
  SupportedLanguage,
  EditorTheme,
  FileItem,
} from '../types/byteplay';

const registerMonacoThemes = (
  monacoInstance: typeof monaco
) => {
  const themes: Record<EditorTheme, monaco.editor.IStandaloneThemeData> = {
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

  for (const [themeName, themeData] of Object.entries(themes) as Array<[EditorTheme, monaco.editor.IStandaloneThemeData]>) {
    monacoInstance.editor.defineTheme(themeName, themeData);
  }
};

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
    monacoInstance: typeof monaco
  ) => void;
}

const MONACO_LANGUAGE_MAP: Record<
  SupportedLanguage,
  string
> = {
  c: 'c',
  html: 'html',
  python: 'python',
  css: 'css',
  javascript: 'javascript',
  sql: 'sql',
  plaintext: 'plaintext',
};

const FileTabIcon: React.FC<{ language: SupportedLanguage }> = ({ language }) => {
  switch (language) {
    case 'c':
      return <FileCode2 size={13} className="text-blue-400 shrink-0" />;
    case 'html':
      return <Globe2 size={13} className="text-orange-400 shrink-0" />;
    case 'css':
      return <FileCode2 size={13} className="text-pink-400 shrink-0" />;
    case 'javascript':
      return <FileCode2 size={13} className="text-yellow-400 shrink-0" />;
    case 'python':
      return <FileText size={13} className="text-emerald-400 shrink-0" />;
    default:
      return <File size={13} className="text-muted shrink-0" />;
  }
};

export const CodeEditor: React.FC<CodeEditorProps> = ({
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
  return (
    <div className="code-editor-frame relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-editor-bg">
      {/* FILE TABS BAR */}
      {files.length > 0 && (
        <div className="editor-tabs-bar flex items-center h-9 px-2 border-b border-theme bg-surface shrink-0 select-none overflow-x-auto gap-1">
          {files.map((file) => {
            const isActive = activeFileId === file.id;
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => onSelectFile?.(file.id)}
                className={[
                  'flex items-center gap-2 px-3 py-1 text-xs font-mono rounded-t-md transition-colors border-t-2 cursor-pointer',
                  isActive
                    ? 'bg-editor-bg text-primary border-indigo-500 font-semibold shadow-sm'
                    : 'border-transparent text-muted hover:text-secondary hover:bg-surface-soft',
                ].join(' ')}
              >
                <FileTabIcon language={file.language} />
                <span>{file.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* MONACO EDITOR */}
      <div className="flex-1 min-h-0 relative w-full h-full">
        <Editor
          height="100%"
          width="100%"
          language={MONACO_LANGUAGE_MAP[language]}
          theme={theme}
          beforeMount={(monacoInstance) => {
            registerMonacoThemes(monacoInstance as typeof monaco);
          }}
          value={code}
          onMount={(editor, monacoInstance) => {
            editor.onDidFocusEditorText(() => {
              onFocus?.();
            });

            if (onMount) onMount(editor, monacoInstance as unknown as typeof monaco);
          }}
          onChange={(value) => onChange(value ?? '')}
          options={{
            automaticLayout: true,
            minimap: {
              enabled: false,
            },
            scrollBeyondLastLine: false,
            scrollbar: {
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
              alwaysConsumeMouseWheel: false,
            },
            fontSize: 14,
            fontFamily:
              "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
            fontLigatures: true,
            lineHeight: 22,
            lineNumbers: 'on',
            lineNumbersMinChars: 3,
            glyphMargin: false,
            folding: true,
            foldingHighlight: true,
            showFoldingControls: 'mouseover',
            lineDecorationsWidth: 10,
            tabSize: 2,
            insertSpaces: true,
            detectIndentation: true,
            trimAutoWhitespace: true,
            autoIndent: 'full',
            formatOnPaste: false,
            formatOnType: false,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            tabCompletion: 'on',
            parameterHints: {
              enabled: true,
            },
            bracketPairColorization: {
              enabled: true,
            },
            matchBrackets: 'always',
            autoClosingBrackets: 'languageDefined',
            autoClosingQuotes: 'languageDefined',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            mouseWheelZoom: true,
            wordWrap: 'off',
            renderWhitespace: 'selection',
            renderControlCharacters: false,
            links: true,
            find: {
              addExtraSpaceOnTop: false,
              autoFindInSelection: 'never',
            },
            accessibilitySupport: 'auto',
            largeFileOptimizations: true,
            stickyScroll: {
              enabled: true,
            },
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditor;
