import React from 'react';
import Editor from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';

import type {
  SupportedLanguage,
  EditorTheme,
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
        'editor.background': '#05070b',
        'editor.foreground': '#f8fafc',
        'editor.lineHighlightBackground': '#10151f',
        'editor.selectionBackground': '#1e40af70',
        'editorCursor.foreground': '#38bdf8',
        'editorIndentGuide.background': '#1f2937',
        'editorIndentGuide.activeBackground': '#475569',
      },
    },
    white: {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#0f172a',
        'editor.lineHighlightBackground': '#f1f5f9',
        'editor.selectionBackground': '#bfdbfe',
        'editorCursor.foreground': '#2563eb',
        'editorIndentGuide.background': '#dbe2ea',
        'editorIndentGuide.activeBackground': '#94a3b8',
        'editorLineNumber.foreground': '#94a3b8',
        'editorLineNumber.activeForeground': '#334155',
      },
    },
    cyberpunk: {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#080716',
        'editor.foreground': '#e2e8f0',
        'editor.lineHighlightBackground': '#151226',
        'editor.selectionBackground': '#0e749060',
        'editorCursor.foreground': '#22d3ee',
        'editorIndentGuide.background': '#243044',
        'editorIndentGuide.activeBackground': '#d946ef',
        'editorLineNumber.foreground': '#64748b',
        'editorLineNumber.activeForeground': '#67e8f9',
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
  sql: 'sql',
  plaintext: 'plaintext',
};

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  language,
  theme,
  onChange,
  onFocus,
  onMount,
}) => {
  return (
    <div className="code-editor-frame relative flex h-full min-h-0 w-full flex-1 overflow-hidden">
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
          lineHeight: 21,

          lineNumbers: 'on',
          lineNumbersMinChars: 3,
          glyphMargin: true,
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
  );
};

export default CodeEditor;
