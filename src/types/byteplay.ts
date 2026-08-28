export type SupportedLanguage =
  | 'c'
  | 'html'
  | 'python'
  | 'css'
  | 'javascript'
  | 'sql'
  | 'plaintext';

export type EditorTheme =
  | 'black'
  | 'white'
  | 'cyberpunk';

export type ConsoleTab = 'terminal' | 'preview';

export interface FileItem {
  id: string;
  name: string;
  language: SupportedLanguage;
  content: string;
}

export type ProgramInputBaseId =
  | 'text'
  | 'integer'
  | 'decimal'
  | 'character'
  | 'boolean';

export interface ProgramInputItem {
  id: string;
  baseId: ProgramInputBaseId;
  value: string;
}
