import React from 'react';
import Editor from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';

import type {
  SupportedLanguage,
  EditorTheme,
} from '../types/byteplay';

interface CodeEditorProps {
  code: string;
  language: SupportedLanguage;
  theme: EditorTheme;
  onChange: (value: string) => void;
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
  onMount,
}) => {
  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 overflow-hidden bg-[#1e1e1e]">
      <Editor
        height="100%"
        width="100%"
        language={MONACO_LANGUAGE_MAP[language]}
        theme={theme}
        value={code}
        onMount={(editor, monacoInstance) => {
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