export type SupportedLanguage =
  | 'c'
  | 'html'
  | 'python'
  | 'sql'
  | 'plaintext';

export type EditorTheme =
  | 'vs-dark'
  | 'one-dark'
  | 'monokai'
  | 'github-dark';

export type ConsoleTab = 'terminal' | 'preview';

export interface FileItem {
  id: string;
  name: string;
  language: SupportedLanguage;
  content: string;
}