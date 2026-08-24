import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { HeaderControls } from './components/HeaderControls';
import { FileExplorer } from './components/FileExplorer';
import { CodeEditor } from './components/CodeEditor';
import { interpretCompilerOutput } from './utils/error-interpreter';
import {
  applyMonacoMarkers,
  clearMonacoMarkers,
  goToLineColumn,
} from './utils/monacoDiagnostics';
import { ConsolePreviewPanel } from './components/ConsolePreviewPanel';
import { FriendlyErrorPanel } from './components/FriendlyErrorPanel';
import { NebCurriculumModal } from './components/NebCurriculumModal';
import { nebPrograms } from './data/nebGrade12Curriculum';
import { compilerClient } from './compiler/compiler-client';

import type {
  FileItem,
  SupportedLanguage,
  EditorTheme,
} from './types/byteplay';

import type { FriendlyError } from './utils/error-interpreter';

const INITIAL_FILES: FileItem[] = [
  {
    id: '1',
    name: 'main.c',
    language: 'c',
    content: `#include <stdio.h>

int main() {
    printf("Hello forgebyteX!\\n");
    return 0;
}`,
  },
  {
    id: '2',
    name: 'index.html',
    language: 'html',
    content: `<h1>Hello forgebyteX</h1>
<p>Interactive Web Sandbox</p>`,
  },
];

const INITIAL_TERMINAL_LOGS = [
  'forgebyteX Arena Environment Ready.',
  'Select a file or press "Run Code" to execute.',
];

const BUGGY_C_CODE = `#include <stdio.h>

int main() {
    printf("Hello forgebyteX!\\n")
    return 0;
}`;

const BUGGY_HTML_CODE = `<div>
  <h1>Hello forgebyteX</h1>
  <p style="color: cyan">Missing closing tags
</div>`;

const createFileId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getFileExtension = (language: SupportedLanguage) => {
  switch (language) {
    case 'c':
      return 'c';

    case 'html':
      return 'html';

    case 'python':
      return 'py';

    case 'sql':
      return 'sql';

    case 'plaintext':
    default:
      return 'txt';
  }
};

export const App: React.FC = () => {
  /* ============================================================
     GLOBAL EDITOR STATE
  ============================================================ */

  const [activeLanguage, setActiveLanguage] =
    useState<SupportedLanguage>('c');

  const [activeTheme, setActiveTheme] =
    useState<EditorTheme>('vs-dark');

  const [isRunning, setIsRunning] = useState(false);
  const [isNebModalOpen, setIsNebModalOpen] = useState(false);

  const [terminalLogs, setTerminalLogs] = useState<string[]>(
    INITIAL_TERMINAL_LOGS
  );
  const [queuedInput, setQueuedInput] = useState('');
  const [terminalInput, setTerminalInput] = useState('');

  const [htmlPreviewDoc, setHtmlPreviewDoc] =
    useState<string | null>(null);

  const [isExplorerCollapsed, setIsExplorerCollapsed] =
    useState(false);

  const [terminalWidth, setTerminalWidth] =
    useState(450);

  /* ============================================================
     FILE STATE
  ============================================================ */

  const [files, setFiles] =
    useState<FileItem[]>(INITIAL_FILES);

  const [activeFileId, setActiveFileId] =
    useState<string>('1');

  /* ============================================================
     EDITOR REFERENCES
  ============================================================ */

  const monacoRef =
    useRef<typeof import('monaco-editor') | null>(
      null
    );
  const editorRef =
    useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(
      null
    );

  const handleEditorMount = useCallback(
    (
      editor: import('monaco-editor').editor.IStandaloneCodeEditor,
      monaco: typeof import('monaco-editor')
    ) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
    },
    []
  );

  /* ============================================================
     ERROR STATE
  ============================================================ */

  const [errors, setErrors] =
    useState<FriendlyError[]>([]);

  const [selectedErrorId, setSelectedErrorId] =
    useState<string | null>(null);

  const [showRawError, setShowRawError] =
    useState(false);

  const clearErrorState = useCallback(() => {
    setErrors([]);
    setSelectedErrorId(null);
    setShowRawError(false);

    if (monacoRef.current && editorRef.current) {
     clearMonacoMarkers(
       monacoRef.current,
       editorRef.current
     );
    }
  }, []);

  /* ============================================================
     RESIZER STATE
  ============================================================ */

  const isDraggingRef = useRef(false);

  /* ============================================================
     EXECUTION STATE
  ============================================================ */

  const executionTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ============================================================
     ACTIVE FILE
  ============================================================ */

  const activeFile =
    files.find((file) => file.id === activeFileId) ??
    files[0] ??
    null;

  /* ============================================================
     RESIZER
  ============================================================ */

  const handleMouseDown = useCallback(() => {
    isDraggingRef.current = true;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isDraggingRef.current) {
      return;
    }

    const minimumTerminalWidth = 250;
    const minimumEditorWidth = 320;

    const newWidth =
      window.innerWidth - event.clientX;

    const maximumTerminalWidth =
      Math.max(
        minimumTerminalWidth,
        window.innerWidth - minimumEditorWidth
      );

    const clampedWidth = Math.min(
      Math.max(newWidth, minimumTerminalWidth),
      maximumTerminalWidth
    );

    setTerminalWidth(clampedWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) {
      return;
    }

    isDraggingRef.current = false;

    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    const executionTimer = executionTimerRef.current;

    window.addEventListener(
      'mousemove',
      handleMouseMove
    );

    window.addEventListener(
      'mouseup',
      handleMouseUp
    );

    return () => {
      window.removeEventListener(
        'mousemove',
        handleMouseMove
      );

      window.removeEventListener(
        'mouseup',
        handleMouseUp
      );

      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (executionTimer) {
        clearTimeout(executionTimer);
      }
    };
  }, [handleMouseMove, handleMouseUp]);

  /* ============================================================
     FILE SELECTION
  ============================================================ */

  const handleFileSelect = useCallback(
    (fileId: string) => {
      const selectedFile = files.find(
        (file) => file.id === fileId
      );

      if (!selectedFile) {
        return;
      }

      setActiveFileId(fileId);

      /*
       * The file's language becomes the source of truth
       * whenever the user switches files.
       */
      setActiveLanguage(selectedFile.language);

      clearErrorState();

      /*
       * Avoid showing an old HTML preview after changing files.
       */
      setHtmlPreviewDoc(null);
    },
    [files]
  );

  /* ============================================================
     CODE CHANGE
  ============================================================ */

  const handleCodeChange = useCallback(
    (newContent: string) => {
      if (!activeFile) {
        return;
      }

      setFiles((previousFiles) =>
        previousFiles.map((file) =>
          file.id === activeFile.id
            ? {
                ...file,
                content: newContent,
              }
            : file
        )
      );

      /*
       * Editing invalidates previous diagnostics.
       * Clear UI markers as well.
       */
      clearErrorState();
    },
    [activeFile]
  );

  /* ============================================================
     LANGUAGE SELECTION
  ============================================================ */

  const handleLanguageSelect = useCallback(
    (language: SupportedLanguage) => {
      setActiveLanguage(language);

      /*
       * We intentionally do NOT change the FileItem.language
       * here. The language selector represents the current
       * editor/execution mode.
       *
       * File switching will restore the file's own language.
       */
      setErrors([]);
      setSelectedErrorId(null);
      setHtmlPreviewDoc(null);
    },
    []
  );

  /* ============================================================
     RUN CODE
  ============================================================ */

  const handleRun = useCallback(() => {
    if (!activeFile || isRunning) {
      return;
    }

    setIsRunning(true);

    clearErrorState();

    setTerminalLogs((previousLogs) => [
      ...previousLogs,
      `> Executing ${activeFile.name}...`,
    ]);

    /*
     * HTML execution is handled immediately by the preview.
     */
    if (activeLanguage === 'html') {
      setHtmlPreviewDoc(activeFile.content);

      setTerminalLogs((previousLogs) => [
        ...previousLogs,
        'HTML preview updated successfully.',
      ]);

      setIsRunning(false);
      return;
    }

    /*
     * OTHER LANGUAGES: invoke real compiler client to compile and run.
     */

    const stdin = (terminalInput || queuedInput).trim();
    setQueuedInput('');
    setTerminalInput('');

    compilerClient
      .compile(activeFile.content, stdin)
      .then((result) => {
        setTerminalLogs((previousLogs) => [
          ...previousLogs,
          result.output || 'No output.',
        ]);

        if (result.success && result.warnings) {
          const friendly = interpretCompilerOutput(result.warnings);
          setErrors(friendly);

          if (
            monacoRef.current &&
            editorRef.current
          ) {
            applyMonacoMarkers(
              monacoRef.current,
              editorRef.current,
              friendly
            );

            if (friendly.length > 0) {
              const first = friendly[0];
              goToLineColumn(
                editorRef.current,
                first.line,
                first.column
              );
              setSelectedErrorId(first.id);
            }
          }
          return;
        }

        if (!result.success) {
          const friendly = interpretCompilerOutput(
            result.error || result.output || 'Compilation failed.'
          );

          setErrors(friendly);

          if (
            monacoRef.current &&
            editorRef.current
          ) {
            applyMonacoMarkers(
              monacoRef.current,
              editorRef.current,
              friendly
            );

            if (friendly.length > 0) {
              const first = friendly[0];
              goToLineColumn(
                editorRef.current,
                first.line,
                first.column
              );
              setSelectedErrorId(first.id);
            }
          }
        } else {
          clearErrorState();
        }
      })
      .catch((err) => {
        setTerminalLogs((previousLogs) => [
          ...previousLogs,
          `Compiler error: ${String(err)}`,
        ]);
      })
      .finally(() => {
        setIsRunning(false);
      });
  }, [
    activeFile,
    activeLanguage,
    isRunning,
    queuedInput,
    terminalInput,
  ]);
  /* ============================================================
     CLEAR TERMINAL
  ============================================================ */

  const handleClearTerminal = useCallback(() => {
    setTerminalLogs([]);
    setQueuedInput('');
    setTerminalInput('');
    setHtmlPreviewDoc(null);
  }, []);

  /* ============================================================
     BUGGY SAMPLE
  ============================================================ */

  const handleBuggySample = useCallback(() => {
    if (!activeFile) {
      return;
    }

    const buggyContent =
      activeLanguage === 'html'
        ? BUGGY_HTML_CODE
        : BUGGY_C_CODE;

    setFiles((previousFiles) =>
      previousFiles.map((file) =>
        file.id === activeFile.id
          ? {
              ...file,
              content: buggyContent,
            }
          : file
      )
    );

    clearErrorState();
    setHtmlPreviewDoc(null);

    setTerminalLogs((previousLogs) => [
      ...previousLogs,
      `Buggy ${activeLanguage.toUpperCase()} sample loaded.`,
    ]);
  }, [activeFile, activeLanguage]);

  /* ============================================================
     RESET CURRENT FILE
  ============================================================ */

  const handleReset = useCallback(() => {
    if (!activeFile) {
      return;
    }

    const originalFile = INITIAL_FILES.find(
      (file) => file.id === activeFile.id
    );

    if (originalFile) {
      setFiles((previousFiles) =>
        previousFiles.map((file) =>
          file.id === activeFile.id
            ? {
                ...file,
                content: originalFile.content,
                language: originalFile.language,
                name: originalFile.name,
              }
            : file
        )
      );

      setActiveLanguage(originalFile.language);
    } else {
      setFiles((previousFiles) =>
        previousFiles.map((file) =>
          file.id === activeFile.id
            ? {
                ...file,
                content: '',
              }
            : file
        )
      );
    }

    setErrors([]);
    setSelectedErrorId(null);
    setShowRawError(false);
    setHtmlPreviewDoc(null);

    setTerminalLogs((previousLogs) => [
      ...previousLogs,
      `Reset ${activeFile.name}.`,
    ]);
  }, [activeFile]);

  /* ============================================================
     CREATE NEW FILE
  ============================================================ */

  const handleNewFile = useCallback(() => {
    const extension =
      getFileExtension(activeLanguage);

    const languageLabel =
      activeLanguage === 'plaintext'
        ? 'text'
        : activeLanguage;

    const existingNames = new Set(
      files.map((file) => file.name)
    );

    let index = 1;

    let filename =
      `untitled-${index}.${extension}`;

    while (existingNames.has(filename)) {
      index += 1;
      filename =
        `untitled-${index}.${extension}`;
    }

    const newFile: FileItem = {
      id: createFileId(),
      name: filename,
      language: activeLanguage,
      content: '',
    };

    setFiles((previousFiles) => [
      ...previousFiles,
      newFile,
    ]);

    setActiveFileId(newFile.id);
    clearErrorState();
    setHtmlPreviewDoc(null);

    setTerminalLogs((previousLogs) => [
      ...previousLogs,
      `Created new ${languageLabel} file: ${filename}`,
    ]);
  }, [activeLanguage, files]);

  const handleLoadNebProgram = (program: { id: string; title: string; language: SupportedLanguage; content: string }) => {
    const extension = program.language === 'c' ? 'c' : 'html';

    const filename = `${program.id}.${extension}`;

    const newFile: FileItem = {
      id: createFileId(),
      name: filename,
      language: program.language,
      content: program.content,
    };

    setFiles((previousFiles) => [
      ...previousFiles,
      newFile,
    ]);

    setActiveFileId(newFile.id);
    setActiveLanguage(newFile.language);

    clearErrorState();
    setHtmlPreviewDoc(null);

    setTerminalLogs((previousLogs) => [
      ...previousLogs,
      `Loaded NEB program: ${program.title}`,
    ]);

    setIsNebModalOpen(false);
  };

  /* ============================================================
     EXPORT CURRENT FILE
  ============================================================ */

  const handleExport = useCallback(() => {
    if (!activeFile) {
      return;
    }

    const blob = new Blob(
      [activeFile.content],
      {
        type:
          activeFile.language === 'html'
            ? 'text/html'
            : 'text/plain',
      }
    );

    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = activeFile.name;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);

    setTerminalLogs((previousLogs) => [
      ...previousLogs,
      `Exported ${activeFile.name}.`,
    ]);
  }, [activeFile]);

  /* ============================================================
     RENDER
  ============================================================ */

  return (
    <div className="flex flex-col h-screen w-screen bg-[#080b12] text-slate-100 overflow-hidden font-sans">

      {/* ========================================================
          HEADER
      ========================================================= */}

      <HeaderControls
        activeLanguage={activeLanguage}
        activeTheme={activeTheme}
        isRunning={isRunning}
        onRun={handleRun}
        onClear={handleClearTerminal}
        onBuggySample={handleBuggySample}
        onReset={handleReset}
        onNewFile={handleNewFile}
        onExport={handleExport}
        onLanguageSelect={handleLanguageSelect}
        onThemeSelect={setActiveTheme}
      />

      {/* ========================================================
          MAIN WORKSPACE
      ======================================================== */}

      <div className="flex-1 flex overflow-hidden w-full h-full relative">

        {/* ======================================================
            FILE EXPLORER
        ======================================================= */}

        <FileExplorer
          files={files}
          activeFileId={activeFileId}
          onSelectFile={handleFileSelect}
          isCollapsed={isExplorerCollapsed}
          onToggleCollapse={() =>
            setIsExplorerCollapsed(
              (previous) => !previous
            )
          }
        />

        {/* ======================================================
            CODE EDITOR
        ======================================================= */}

        <div className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">

          {activeFile ? (
            <CodeEditor
              code={activeFile.content}
              language={activeLanguage}
              theme={activeTheme}
              onChange={handleCodeChange}
              onMount={handleEditorMount}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              No file selected.
            </div>
          )}

          {/* ====================================================
              FRIENDLY ERROR PANEL
          ===================================================== */}

          {errors.length > 0 && (
            <FriendlyErrorPanel
              errors={errors}
              selectedErrorId={selectedErrorId}
              showRawError={showRawError}
              onErrorSelect={(error) =>
                setSelectedErrorId(error.id)
              }
              onToggleRawError={() =>
                setShowRawError(
                  (previous) => !previous
                )
              }
            />
          )}

        </div>

        {/* ======================================================
            TERMINAL RESIZER
        ======================================================= */}

        <div
          onMouseDown={handleMouseDown}
          className="w-1 bg-slate-800/80 hover:bg-indigo-500 cursor-col-resize flex items-center justify-center transition-colors group z-20 shrink-0"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize terminal panel"
        >
          <div className="w-0.5 h-8 bg-slate-600 group-hover:bg-white rounded-full transition-colors" />
        </div>

        {/* ======================================================
            TERMINAL / PREVIEW PANEL
        ======================================================= */}

        <div
          style={{
            width: `${terminalWidth}px`,
          }}
          className="shrink-0 flex flex-col min-w-0 h-full bg-[#0b0e17] border-l border-slate-800"
        >
          <ConsolePreviewPanel
            activeLanguage={activeLanguage}
            terminalLogs={terminalLogs}
            htmlPreviewDoc={htmlPreviewDoc}
            inputValue={terminalInput}
            onInputChange={setTerminalInput}
            onSendInput={(input) => {
              setQueuedInput((previous) => {
                const next = previous ? `${previous}\n${input}` : input;
                return next;
              });
              setTerminalLogs((previousLogs) => [
                ...previousLogs,
                `> ${input}`,
              ]);
            }}
            onClearTerminal={handleClearTerminal}
          />

          <NebCurriculumModal
            isOpen={isNebModalOpen}
            onClose={() => setIsNebModalOpen(false)}
            programs={nebPrograms}
            onLoadProgram={handleLoadNebProgram}
          />

        </div>

      </div>
    </div>
  );
};

export default App;