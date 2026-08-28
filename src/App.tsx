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
import {
  compilerClient,
} from './compiler/compiler-client';
import {
  pythonClient,
} from './compiler/python-client';
import type { ExecutionStatus } from './compiler/execution-protocol';

import type {
  FileItem,
  ProgramInputItem,
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
  {
    id: '3',
    name: 'main.py',
    language: 'python',
    content: `print("Hello from Python in forgebyteX!")

for i in range(5):
    print(i)`,
  },
];

const INITIAL_TERMINAL_LOGS = [
  'forgebyteX ready. Open a file and click Run Code (or press F5).',
];

const THEME_STORAGE_KEY = 'forgebytex-theme';

const isEditorTheme = (value: string | null): value is EditorTheme =>
  value === 'black' || value === 'white' || value === 'cyberpunk';

const getInitialTheme = (): EditorTheme => {
  if (typeof window === 'undefined') {
    return 'black';
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  return isEditorTheme(storedTheme) ? storedTheme : 'black';
};

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
    useState<EditorTheme>(getInitialTheme);

  const [isRunning, setIsRunning] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>('idle');
  const [isNebModalOpen, setIsNebModalOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  const [terminalLogs, setTerminalLogs] = useState<string[]>(
    INITIAL_TERMINAL_LOGS
  );
  /**
   * Incrementing this counter tells InteractiveTerminal to hard-clear
   * itself, bypassing the append-only logic.
   */
  const [clearGeneration, setClearGeneration] = useState(0);

  const [queuedInput, setQueuedInput] = useState('');
  const [terminalInput, setTerminalInput] = useState('');
  const [programInputs, setProgramInputs] =
    useState<ProgramInputItem[]>([]);

  const [htmlPreviewDoc, setHtmlPreviewDoc] =
    useState<string | null>(null);

  const [isExplorerCollapsed, setIsExplorerCollapsed] =
    useState(false);

  const [terminalWidth, setTerminalWidth] =
    useState(560);

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
    document.documentElement.dataset.theme = activeTheme;
    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      activeTheme
    );
  }, [activeTheme]);

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
     KEYBOARD SHORTCUT — F5 to Run
  ============================================================ */

  // handleRun is defined below; use a ref so the keydown handler
  // always calls the latest version without needing to be re-registered.
  const handleRunRef = useRef<() => void>(() => {});

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F5') {
        e.preventDefault();
        handleRunRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
      [clearErrorState, files]
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
      [activeFile, clearErrorState]
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
    if (!activeFile) {
      return;
    }

    // ── Stop a running execution ──────────────────────────────
    if (isRunning) {
      if (activeLanguage === 'c') {
        compilerClient.stopCurrent();
      } else if (activeLanguage === 'python') {
        pythonClient.stopCurrent();
      }
      setIsRunning(false);
      setExecutionStatus('stopped');
      setTerminalLogs((prev) => [
        ...prev,
        '> Execution stopped.',
      ]);
      return;
    }

    setIsRunning(true);
    setExecutionStatus('compiling');
    clearErrorState();

    // ── HTML preview path ─────────────────────────────────────
    if (activeLanguage === 'html') {
      setHtmlPreviewDoc(activeFile.content);
      setTerminalLogs((prev) => [
        ...prev,
        `> Rendering ${activeFile.name}...`,
        'HTML preview updated.',
      ]);
      setIsRunning(false);
      setExecutionStatus('completed');
      return;
    }

    // ── C compilation path ────────────────────────────────────
    if (activeLanguage === 'c') {
      // Collect stdin. Use terminalInput / queuedInput / programInputs.
      const stdin = (
        terminalInput ||
        queuedInput ||
        programInputs
          .map((input) => input.value)
          .join('\n')
      ).trim();

      let baseLogLength = 0;
      let highestAttempt = 1;

      setTerminalLogs((prev) => {
        baseLogLength = prev.length + 1;
        return [...prev, `> Compiling ${activeFile.name}…`];
      });

      const code = activeFile.content;

      compilerClient
        .compile(
          code,
          stdin,
          // ── Streaming stdout/stderr callback ──────────────
          { onOutput: (_stream: 'stdout' | 'stderr', text: string, attempt = 1) => {
            if (!text) return;
            setTerminalLogs((prev) => {
              if (attempt > highestAttempt) {
                highestAttempt = attempt;
                return [...prev.slice(0, baseLogLength), text];
              }
              return [...prev, text];
            });
          },
          // ── Status update callback ────────────────────────
          onStatus: (status: ExecutionStatus) => {
            setExecutionStatus(status);
            if (
              status === 'completed' ||
              status === 'failed' ||
              status === 'stopped' ||
              status === 'timeout'
            ) {
              setIsRunning(false);
            }
          }}
        )
        .then((result) => {
          const finalStatus =
            result.status ??
            (result.success ? 'completed' : 'failed');

          setExecutionStatus(finalStatus);
          setIsRunning(false);

          // ── Show compilation errors ───────────────────────
          if (!result.success) {
            const errorText =
              result.error || result.output || 'Compilation failed.';

            // Always show raw error in terminal so nothing is hidden
            setTerminalLogs((prev) => [
              ...prev,
              errorText,
            ]);

            const friendly = interpretCompilerOutput(errorText);
            setErrors(friendly);

            if (monacoRef.current && editorRef.current) {
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

          // ── Show compiler warnings on success ─────────────
          if (result.warnings) {
            const friendly = interpretCompilerOutput(result.warnings);
            setErrors(friendly);

            if (monacoRef.current && editorRef.current) {
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

          // Show exit status only if no stdout was streamed (empty output)
          if (!result.output?.trim()) {
            setTerminalLogs((prev) => [
              ...prev,
              '> Process exited with code 0.',
            ]);
          }
        })
        .catch((err: unknown) => {
          setExecutionStatus('failed');
          setIsRunning(false);
          const message = err instanceof Error ? err.message : String(err);
          setTerminalLogs((prev) => [
            ...prev,
            `> Error: ${message}`,
          ]);
        });
      return;
    }

    // ── Python execution path ─────────────────────────────────
    if (activeLanguage === 'python') {
      const stdin = (
        terminalInput ||
        queuedInput ||
        programInputs
          .map((input) => input.value)
          .join('\n')
      ).trim();

      let baseLogLength = 0;
      let highestAttempt = 1;

      setTerminalLogs((prev) => {
        baseLogLength = prev.length + 1;
        return [...prev, `> Running ${activeFile.name}…`];
      });

      const code = activeFile.content;

      pythonClient
        .run(
          code,
          stdin,
          // ── Streaming stdout/stderr callback ──────────────
          { onOutput: (_stream: 'stdout' | 'stderr', text: string, attempt = 1) => {
            if (!text) return;
            setTerminalLogs((prev) => {
              if (attempt > highestAttempt) {
                highestAttempt = attempt;
                return [...prev.slice(0, baseLogLength), text];
              }
              return [...prev, text];
            });
          },
          // ── Status update callback ────────────────────────
          onStatus: (status: ExecutionStatus) => {
            setExecutionStatus(status);
            if (
              status === 'completed' ||
              status === 'failed' ||
              status === 'stopped' ||
              status === 'timeout'
            ) {
              setIsRunning(false);
            }
          }}
        )
        .then((result) => {
          const finalStatus =
            result.status ??
            (result.success ? 'completed' : 'failed');

          setExecutionStatus(finalStatus);
          setIsRunning(false);

          // ── Show Python errors ─────────────────────────────
          if (!result.success) {
            const errorText =
              result.error || result.output || 'Execution failed.';

            setTerminalLogs((prev) => [
              ...prev,
              errorText,
            ]);

            // For Python, we show the error directly in terminal
            // rather than using the C-specific error interpreter
            setErrors([]);
            clearErrorState();
            return;
          }

          clearErrorState();

          // Show exit status only if no stdout was streamed (empty output)
          if (!result.output?.trim()) {
            setTerminalLogs((prev) => [
              ...prev,
              '> Process exited with code 0.',
            ]);
          }
        })
        .catch((err: unknown) => {
          setExecutionStatus('failed');
          setIsRunning(false);
          const message = err instanceof Error ? err.message : String(err);
          setTerminalLogs((prev) => [
            ...prev,
            `> Error: ${message}`,
          ]);
        });
      return;
    }

    // ── Unsupported language ───────────────────────────────────
    setTerminalLogs((prev) => [
      ...prev,
      `> Language '${activeLanguage}' is not yet supported for execution.`,
    ]);
    setIsRunning(false);
    setExecutionStatus('failed');
  }, [
    activeFile,
    activeLanguage,
    clearErrorState,
    isRunning,
    programInputs,
    queuedInput,
    terminalInput,
  ]);

  // Keep the ref current so F5 always invokes the latest handleRun
  useEffect(() => {
    handleRunRef.current = handleRun;
  }, [handleRun]);

  /* ============================================================
     CLEAR TERMINAL
  ============================================================ */

  const handleClearTerminal = useCallback(() => {
    setTerminalLogs([]);
    setClearGeneration((g) => g + 1); // triggers hard clear in xterm
    setQueuedInput('');
    setTerminalInput('');
    setProgramInputs([]);
    setHtmlPreviewDoc(null);
    setExecutionStatus('idle');
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
  }, [activeFile, activeLanguage, clearErrorState]);

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
  }, [activeLanguage, clearErrorState, files]);

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
    <div className="app-shell flex flex-col h-screen w-screen bg-[#080b12] text-slate-100 overflow-hidden font-sans">

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
        isFocusMode={isFocusMode}
        onToggleFocusMode={() =>
          setIsFocusMode((previous) => !previous)
        }
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
            onSendInput={(input) => {
              if (activeLanguage === 'c') {
                compilerClient.sendInput(input);
              } else if (activeLanguage === 'python') {
                pythonClient.sendInput(input);
              }
              setQueuedInput((previous) => {
                const next = previous ? `${previous}\n${input}` : input;
                return next;
              });
              setTerminalInput(input);
            }}
            onClearTerminal={handleClearTerminal}
            isWaitingForInput={executionStatus === 'waiting-input'}
            executionStatus={executionStatus}
            clearGeneration={clearGeneration}
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