/**
 * Languages supported by the editor, preview layer, and execution dispatcher.
 */
export type SupportedLanguage =
  | 'c'
  | 'cpp'
  | 'html'
  | 'python'
  | 'css'
  | 'javascript'
  | 'sql'
  | 'plaintext';

/**
 * Languages with a primary workspace workflow.
 */
export type PrimaryLanguage =
  | 'c'
  | 'cpp'
  | 'python'
  | 'html'
  | 'plaintext';

/**
 * Themes registered by the Monaco editor and terminal.
 */
export type EditorTheme =
  | 'black'
  | 'white'
  | 'cyberpunk';

/**
 * Available output surface modes.
 */
export type ConsoleTab =
  | 'terminal'
  | 'preview';

/**
 * Supported side-panel layout positions.
 */
export type TerminalPosition =
  | 'bottom'
  | 'right';

/**
 * Layout modes used by the resizable workspace.
 */
export type WorkspaceLayout =
  | 'bottom'
  | 'aside'
  | 'fullscreen';

/**
 * Source file managed by the ForgeByteX workspace.
 *
 * Project state remains the source of truth; Monaco models are derived from it.
 */
export interface FileItem {
  id: string;
  name: string;
  language: SupportedLanguage;
  content: string;
  isWebProjectFile?: boolean;
}

/**
 * Primitive input types supported by the stdin builder.
 */
export type ProgramInputBaseId =
  | 'text'
  | 'integer'
  | 'decimal'
  | 'character'
  | 'boolean';

/**
 * One validated stdin value supplied to a program run.
 */
export interface ProgramInputItem {
  id: string;
  baseId: ProgramInputBaseId;
  value: string;
}