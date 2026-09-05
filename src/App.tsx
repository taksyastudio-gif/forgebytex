import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from 'react-resizable-panels';
import type * as monaco from 'monaco-editor';

import { CodeEditor } from './components/CodeEditor';
import { ConsolePreviewPanel } from './components/ConsolePreviewPanel';
import {
  FileExplorer,
  type ProjectFile,
} from './components/FileExplorer';
import { FeedbackModal } from './components/FeedbackModal';
import { HeaderControls } from './components/HeaderControls';
import { NebCurriculumModal } from './components/NebCurriculumModal';
import { ExportModal } from './components/ExportModal';
import {
  WelcomeModal,
  shouldShowWelcome,
} from './components/WelcomeModal';

import { ExecutionClient } from './compiler/execution-client';
import type {
  ExecutionStatus,
  SupportedLanguage as RuntimeLanguage,
} from './compiler/execution-protocol';

import {
  nebPrograms,
  type NebProgram,
} from './data/nebGrade12Curriculum';

import {
  clearMonacoMarkers,
  goToLineColumn,
  parseAndApplyDiagnostics,
} from './utils/monacoDiagnostics';

import {
  buildWebPreview,
  isWebProjectFile,
} from './utils/webPreview';

import {
  getLanguageFromFilename,
  isPreviewLanguage,
} from './utils/fileUtils';

import type {
  EditorTheme,
  FileItem,
  SupportedLanguage,
  TerminalPosition,
} from './types/byteplay';

type ForgeProjectFile = FileItem;

const INITIAL_FILES: ForgeProjectFile[] = [
  {
    id: 'main-c',
    name: 'main.c',
    language: 'c',
    content: `#include <stdio.h>

int main(void) {
    printf("Hello ForgeByteX from C!\\n");
    return 0;
}
`,
  },
  {
    id: 'main-cpp',
    name: 'main.cpp',
    language: 'cpp',
    content: `#include <iostream>

int main() {
    std::cout << "Hello ForgeByteX from C++!" << std::endl;
    return 0;
}
`,
  },
  {
    id: 'main-py',
    name: 'main.py',
    language: 'python',
    content: `print("Hello ForgeByteX from Python!")

for index in range(5):
    print(index)
`,
  },
  {
    id: 'index-html',
    name: 'index.html',
    language: 'html',
    isWebProjectFile: true,
    content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ForgeByteX Web Project</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main class="card">
    <h1>Hello ForgeByteX!</h1>
    <p>Edit index.html, style.css, and script.js together.</p>
    <button id="demo-button" type="button">Click me</button>
    <p id="message"></p>
  </main>

  <script src="./script.js"></script>
</body>
</html>
`,
  },
  {
    id: 'style-css',
    name: 'style.css',
    language: 'css',
    isWebProjectFile: true,
    content: `:root {
  color-scheme: dark;
  font-family: Inter, system-ui, sans-serif;
  background: #0f172a;
  color: #f8fafc;
}

body {
  min-height: 100vh;
  display: grid;
  place-items: center;
  margin: 0;
  background: linear-gradient(135deg, #0f172a, #1e1b4b);
}

.card {
  width: min(90vw, 520px);
  padding: 2rem;
  border: 1px solid #475569;
  border-radius: 1rem;
  background: rgb(15 23 42 / 85%);
  text-align: center;
  box-shadow: 0 20px 60px rgb(0 0 0 / 35%);
}

button {
  border: 0;
  border-radius: 0.5rem;
  padding: 0.65rem 1rem;
  background: #2563eb;
  color: white;
  cursor: pointer;
}
`,
  },
  {
    id: 'script-js',
    name: 'script.js',
    language: 'javascript',
    isWebProjectFile: true,
    content: `const button = document.querySelector('#demo-button');
const message = document.querySelector('#message');

button?.addEventListener('click', () => {
  message.textContent = 'JavaScript is connected successfully.';
});
`,
  },
];

const INITIAL_TERMINAL_LOGS = [
  'ForgeByteX ready. Open a file and click Run Code.',
  'Tip: C and Python input is typed directly into this terminal.',
];

const THEME_STORAGE_KEY = 'forgebytex-theme';

const createFileId = (): string =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const isEditorTheme = (
  value: string | null,
): value is EditorTheme =>
  value === 'black' ||
  value === 'white' ||
  value === 'cyberpunk';

const getInitialTheme = (): EditorTheme => {
  if (typeof window === 'undefined') {
    return 'black';
  }

  const savedTheme = window.localStorage.getItem(
    THEME_STORAGE_KEY,
  );

  return isEditorTheme(savedTheme) ? savedTheme : 'black';
};

const getExtensionForLanguage = (
  language: SupportedLanguage,
): string => {
  switch (language) {
    case 'c':
      return 'c';
    case 'cpp':
      return 'cpp';
    case 'python':
      return 'py';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'javascript':
      return 'js';
    case 'sql':
      return 'sql';
    default:
      return 'txt';
  }
};

const toRuntimeLanguage = (
  language: SupportedLanguage,
): RuntimeLanguage => language;

export const App = (): ReactElement => {
  const [files, setFiles] =
    useState<ForgeProjectFile[]>(INITIAL_FILES);
  const [activeFileId, setActiveFileId] =
    useState(INITIAL_FILES[0].id);

  const [activeLanguage, setActiveLanguage] =
    useState<SupportedLanguage>(INITIAL_FILES[0].language);

  const [activeTheme, setActiveTheme] =
    useState<EditorTheme>(getInitialTheme);

  const [terminalPosition, setTerminalPosition] =
    useState<TerminalPosition>('bottom');

  const [terminalLogs, setTerminalLogs] = useState<string[]>(
    INITIAL_TERMINAL_LOGS,
  );

  const [clearGeneration, setClearGeneration] = useState(0);
  const [executionStatus, setExecutionStatus] =
    useState<ExecutionStatus>('idle');
  const [isRunning, setIsRunning] = useState(false);

  const [errorOutput, setErrorOutput] = useState('');

  const [htmlPreviewDoc, setHtmlPreviewDoc] = useState<
    string | null
  >(null);

  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] =
    useState(shouldShowWelcome);
  const [isCurriculumOpen, setIsCurriculumOpen] =
    useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const executionClientRef =
    useRef<ExecutionClient | null>(null);

  const monacoRef =
    useRef<typeof monaco | null>(null);

  const editorRef =
    useRef<monaco.editor.IStandaloneCodeEditor | null>(
      null,
    );

  const executionGenerationRef = useRef(0);

  const activeFile =
    files.find((file) => file.id === activeFileId) ??
    files[0];

  useEffect(() => {
    executionClientRef.current = new ExecutionClient();

    const handlePageHide = (): void => {
      executionClientRef.current?.terminate();
    };

    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener(
        'pagehide',
        handlePageHide,
      );
      executionClientRef.current?.terminate();
      executionClientRef.current = null;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = activeTheme;
    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      activeTheme,
    );
  }, [activeTheme]);

  const clearDiagnostics = useCallback((): void => {
    if (monacoRef.current && editorRef.current) {
      clearMonacoMarkers(
        monacoRef.current,
        editorRef.current,
      );
    }
  }, []);

  const appendTerminalLog = useCallback(
    (text: string): void => {
      if (!text) {
        return;
      }

      setTerminalLogs((currentLogs) => [
        ...currentLogs,
        text,
      ]);
    },
    [],
  );

  const handleSelectFile = useCallback(
    (fileId: string): void => {
      const selectedFile = files.find(
        (file) => file.id === fileId,
      );

      if (!selectedFile) {
        return;
      }

      setActiveFileId(fileId);
      setActiveLanguage(selectedFile.language);
      setHtmlPreviewDoc(null);
      setErrorOutput('');
      clearDiagnostics();
    },
    [clearDiagnostics, files],
  );

  const handleUpdateCode = useCallback(
    (content: string): void => {
      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          file.id === activeFileId
            ? { ...file, content }
            : file,
        ),
      );

      clearDiagnostics();
      setErrorOutput('');

      if (activeFile && isWebProjectFile(activeFile)) {
        setHtmlPreviewDoc(null);
      }
    },
    [activeFile, activeFileId, clearDiagnostics],
  );

  const handleAddFile = useCallback((): void => {
    const language: SupportedLanguage = 'javascript';
    const extension = getExtensionForLanguage(language);
    const fileName = `script-${files.length + 1}.${extension}`;

    const newFile: ForgeProjectFile = {
      id: createFileId(),
      name: fileName,
      language,
      isWebProjectFile: true,
      content: '// New ForgeByteX file\n',
    };

    setFiles((currentFiles) => [
      ...currentFiles,
      newFile,
    ]);
    setActiveFileId(newFile.id);
    setActiveLanguage(newFile.language);
    setHtmlPreviewDoc(null);
    setErrorOutput('');
    clearDiagnostics();
  }, [clearDiagnostics, files.length]);

  const handleRenameFile = useCallback(
    (fileId: string, newName: string): void => {
      const trimmedName = newName.trim();

      if (!trimmedName) {
        return;
      }

      setFiles((currentFiles) =>
        currentFiles.map((file) =>
          file.id === fileId
            ? {
                ...file,
                name: trimmedName,
                language:
                  getLanguageFromFilename(trimmedName),
                isWebProjectFile:
                  isWebProjectFile({
                    language:
                      getLanguageFromFilename(trimmedName),
                  }),
              }
            : file,
        ),
      );

      setHtmlPreviewDoc(null);
      setErrorOutput('');
    },
    [],
  );

  const handleDeleteFile = useCallback(
    (fileId: string): void => {
      if (files.length <= 1) {
        return;
      }

      const remainingFiles = files.filter(
        (file) => file.id !== fileId,
      );

      setFiles(remainingFiles);

      if (fileId === activeFileId) {
        const nextFile = remainingFiles[0];

        setActiveFileId(nextFile.id);
        setActiveLanguage(nextFile.language);
      }

      setHtmlPreviewDoc(null);
      setErrorOutput('');
      clearDiagnostics();
    },
    [
      activeFileId,
      clearDiagnostics,
      files,
    ],
  );

  const handleLanguageSelect = useCallback(
    (language: SupportedLanguage): void => {
      setActiveLanguage(language);
      setErrorOutput('');

      const matchingFile = files.find(
        (file) => file.language === language,
      );

      if (matchingFile) {
        setActiveFileId(matchingFile.id);
        return;
      }

      const extension = getExtensionForLanguage(language);
      const newFile: ForgeProjectFile = {
        id: createFileId(),
        name: `untitled-${files.length + 1}.${extension}`,
        language,
        isWebProjectFile: isWebProjectFile({ language }),
        content: '',
      };

      setFiles((currentFiles) => [
        ...currentFiles,
        newFile,
      ]);
      setActiveFileId(newFile.id);
    },
    [files],
  );

  const handleSendInput = useCallback(
    (input: string): void => {
      const sent =
        executionClientRef.current?.sendInput(input) ??
        false;

      if (!sent) {
        appendTerminalLog(
          '[ForgeByteX] No program is currently waiting for input.',
        );
      }
    },
    [appendTerminalLog],
  );

  const handleRun = useCallback(async (): Promise<void> => {
    const executionClient = executionClientRef.current;

    if (!activeFile || !executionClient) {
      return;
    }

    if (isRunning) {
      executionGenerationRef.current += 1;
      executionClient.stop();
      setIsRunning(false);
      setExecutionStatus('stopped');
      setErrorOutput('');
      appendTerminalLog(
        '[ForgeByteX] Execution stopped by the user.',
      );
      return;
    }

    clearDiagnostics();
    setErrorOutput('');

    const generation = ++executionGenerationRef.current;
    const isCurrentExecution = (): boolean =>
      executionGenerationRef.current === generation;

    if (isPreviewLanguage(activeFile.language)) {
      const preview = buildWebPreview(files);

      setHtmlPreviewDoc(preview.document || null);
      setExecutionStatus(
        preview.diagnostics.some(
          (diagnostic) => diagnostic.severity === 'error',
        )
          ? 'failed'
          : 'completed',
      );

      setTerminalLogs((currentLogs) => [
        ...currentLogs,
        `Rendered ${preview.entryFileName || 'web project'} preview.`,
      ]);

      return;
    }

    setIsRunning(true);
    setExecutionStatus('preparing');

    appendTerminalLog(
      `> Starting ${activeFile.name}...`,
    );

    try {
      const result = await executionClient.execute(
        {
          fileName: activeFile.name,
          code: activeFile.content,
          language: toRuntimeLanguage(
            activeFile.language,
          ),
        },
        {
          onOutput: (_stream, text, attempt) => {
            if (!isCurrentExecution() || !text) {
              return;
            }

            appendTerminalLog(
              attempt > 1
                ? `[input retry ${attempt}] ${text}`
                : text,
            );
          },
          onStatus: (status) => {
            if (isCurrentExecution()) {
              setExecutionStatus(status);
            }
          },
        },
      );

      if (!isCurrentExecution()) {
        return;
      }

      setExecutionStatus(result.status);
      setIsRunning(false);

      if (!result.success) {
        const diagnosticText =
          result.error ||
          result.output ||
          'Unknown execution error.';

        setErrorOutput(diagnosticText);

        if (monacoRef.current && editorRef.current) {
          parseAndApplyDiagnostics(
            monacoRef.current,
            editorRef.current,
            diagnosticText,
            activeFile.language,
          );
        }
      } else if (result.warnings) {
        appendTerminalLog(result.warnings);
      }
    } catch (error: unknown) {
      if (!isCurrentExecution()) {
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Execution failed unexpectedly.';

      setExecutionStatus('failed');
      setIsRunning(false);
      setErrorOutput(message);
    }
  }, [
    activeFile,
    appendTerminalLog,
    clearDiagnostics,
    files,
    isRunning,
  ]);

  const handleClearTerminal = useCallback((): void => {
    setTerminalLogs([]);
    setClearGeneration((generation) => generation + 1);
    setHtmlPreviewDoc(null);
    setErrorOutput('');
    setExecutionStatus('idle');
  }, []);

  const handleReset = useCallback((): void => {
    executionGenerationRef.current += 1;
    executionClientRef.current?.stop();

    setFiles(INITIAL_FILES);
    setActiveFileId(INITIAL_FILES[0].id);
    setActiveLanguage(INITIAL_FILES[0].language);
    setTerminalLogs(INITIAL_TERMINAL_LOGS);
    setClearGeneration((generation) => generation + 1);
    setHtmlPreviewDoc(null);
    setErrorOutput('');
    setExecutionStatus('idle');
    setIsRunning(false);

    clearDiagnostics();
  }, [clearDiagnostics]);

  const handleBuggySample = useCallback((): void => {
    if (!activeFile) {
      return;
    }

    const buggyContent =
      activeFile.language === 'html'
        ? `<div>
  <h1>Broken ForgeByteX sample</h1>
  <p>This HTML is intentionally incomplete.
</div>`
        : activeFile.language === 'python'
          ? `print("This sample has a syntax error"
`
          : `#include <stdio.h>

int main(void) {
    printf("Missing semicolon")
    return 0;
}
`;

    setFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.id === activeFile.id
          ? { ...file, content: buggyContent }
          : file,
      ),
    );

    clearDiagnostics();
    setErrorOutput('');
    setHtmlPreviewDoc(null);

    appendTerminalLog(
      `Loaded an intentional ${activeFile.language.toUpperCase()} sample error.`,
    );
  }, [activeFile, appendTerminalLog, clearDiagnostics]);

  const handleLoadProgram = useCallback(
    (program: NebProgram): void => {
      const extension =
        program.language === 'html'
          ? 'html'
          : getExtensionForLanguage(program.language);

      const loadedFile: ForgeProjectFile = {
        id: createFileId(),
        name: `${program.id}.${extension}`,
        language: program.language,
        content: program.content,
        isWebProjectFile: isWebProjectFile({
          language: program.language,
        }),
      };

      setFiles((currentFiles) => [
        ...currentFiles,
        loadedFile,
      ]);
      setActiveFileId(loadedFile.id);
      setActiveLanguage(loadedFile.language);
      setIsCurriculumOpen(false);
      setHtmlPreviewDoc(null);
      setErrorOutput('');
      clearDiagnostics();
    },
    [clearDiagnostics],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'F5') {
        event.preventDefault();
        void handleRun();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, [handleRun]);

  const editorFiles: ProjectFile[] = files.map((file) => ({
    id: file.id,
    name: file.name,
    language: file.language,
    content: file.content,
  }));

  const renderEditor = (): ReactElement => (
    <div className="flex h-full w-full flex-col overflow-hidden bg-editor-bg">
      <div className="relative min-h-0 flex-1">
        <CodeEditor
          activeFileId={activeFile?.id}
          code={activeFile?.content ?? ''}
          files={editorFiles}
          language={
            activeFile?.language ?? 'plaintext'
          }
          onChange={handleUpdateCode}
          onMount={(editor, monacoInstance) => {
            editorRef.current = editor;
            monacoRef.current = monacoInstance;
          }}
          onSelectFile={handleSelectFile}
          theme={activeTheme}
        />
      </div>
    </div>
  );

  const renderConsole = (): ReactElement => (
    <ConsolePreviewPanel
      activeLanguage={
        activeFile?.language ?? activeLanguage
      }
      activeTheme={activeTheme}
      clearGeneration={clearGeneration}
      errorFileName={activeFile?.name}
      errorOutput={errorOutput}
      executionStatus={executionStatus}
      files={files}
      htmlPreviewDoc={htmlPreviewDoc}
      isWaitingForInput={
        executionStatus === 'waiting-input'
      }
      onClearError={() => setErrorOutput('')}
      onClearTerminal={handleClearTerminal}
      onJumpToError={(line, column) => {
        goToLineColumn(editorRef.current, line, column);
      }}
      onSendInput={handleSendInput}
      onTerminalPositionChange={setTerminalPosition}
      terminalLogs={terminalLogs}
      terminalPosition={terminalPosition}
    />
  );

  return (
    <div className="app-shell flex h-screen w-screen flex-col overflow-hidden font-sans">
      <HeaderControls
        activeLanguage={
          activeFile?.language ?? activeLanguage
        }
        activeTheme={activeTheme}
        isFocusMode={isFocusMode}
        isRunning={isRunning}
        onBuggySample={handleBuggySample}
        onClear={handleClearTerminal}
        onExport={() => setIsExportOpen(true)}
        onFeedbackClick={() => setIsFeedbackOpen(true)}
        onLanguageSelect={handleLanguageSelect}
        onNewFile={handleAddFile}
        onReset={handleReset}
        onRun={() => void handleRun()}
        onThemeSelect={setActiveTheme}
        onToggleFocusMode={() =>
          setIsFocusMode((current) => !current)
        }
      />

      <main className="app-main relative min-h-0 flex-1 overflow-hidden">
        {isFocusMode ? (
          <PanelGroup
            className="h-full w-full"
            orientation="vertical"
          >
            <Panel defaultSize="60" minSize="30">
              {renderEditor()}
            </Panel>

            <PanelResizeHandle className="workspace-resizer h-1 cursor-row-resize" />

            <Panel defaultSize="40" minSize="20">
              {renderConsole()}
            </Panel>
          </PanelGroup>
        ) : (
          <PanelGroup
            className="h-full w-full"
            orientation="horizontal"
          >
            <Panel
              defaultSize="20"
              maxSize="35"
              minSize="15"
            >
              <FileExplorer
                activeFileId={activeFile?.id ?? ''}
                files={editorFiles}
                onAddFile={handleAddFile}
                onDeleteFile={handleDeleteFile}
                onRenameFile={handleRenameFile}
                onSelectFile={handleSelectFile}
              />
            </Panel>

            <PanelResizeHandle className="workspace-resizer w-1 cursor-col-resize" />

            <Panel defaultSize="80">
              <PanelGroup
                className="h-full w-full"
                orientation={
                  terminalPosition === 'right'
                    ? 'horizontal'
                    : 'vertical'
                }
              >
                <Panel defaultSize="60" minSize="30">
                  {renderEditor()}
                </Panel>

                <PanelResizeHandle
                  className={
                    terminalPosition === 'right'
                      ? 'workspace-resizer w-1 cursor-col-resize'
                      : 'workspace-resizer h-1 cursor-row-resize'
                  }
                />

                <Panel defaultSize="40" minSize="20">
                  {renderConsole()}
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        )}
      </main>

      <WelcomeModal
        isOpen={isWelcomeOpen}
        onClose={() => setIsWelcomeOpen(false)}
      />

      <NebCurriculumModal
        isOpen={isCurriculumOpen}
        onClose={() => setIsCurriculumOpen(false)}
        onLoadProgram={handleLoadProgram}
        programs={nebPrograms}
      />

      <FeedbackModal
        currentLanguage={
          activeFile?.language ?? activeLanguage
        }
        currentTheme={activeTheme}
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />

      <ExportModal
        activeFile={activeFile}
        files={files}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />
    </div>
  );
};

export default App;