import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileCode2,
  FileText,
  Globe2,
  Database,
  File,
  FolderGit2,
} from 'lucide-react';

import type { FileItem } from '../types/byteplay';

interface FileExplorerProps {
  files: FileItem[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const FileIcon: React.FC<{
  language: FileItem['language'];
}> = ({ language }) => {
  switch (language) {
    case 'c':
      return <FileCode2 size={14} className="text-blue-400 shrink-0" />;
    case 'html':
      return <Globe2 size={14} className="text-orange-400 shrink-0" />;
    case 'css':
      return <FileCode2 size={14} className="text-pink-400 shrink-0" />;
    case 'javascript':
      return <FileCode2 size={14} className="text-yellow-400 shrink-0" />;
    case 'python':
      return <FileText size={14} className="text-emerald-400 shrink-0" />;
    case 'sql':
      return <Database size={14} className="text-purple-400 shrink-0" />;
    case 'plaintext':
    default:
      return <File size={14} className="text-muted shrink-0" />;
  }
};

export const FileExplorer: React.FC<FileExplorerProps> = ({
  files,
  activeFileId,
  onSelectFile,
  isCollapsed,
  onToggleCollapse,
}) => {
  const webFiles = files.filter(
    (f) => f.language === 'html' || f.language === 'css' || f.language === 'javascript'
  );
  const otherFiles = files.filter(
    (f) => f.language !== 'html' && f.language !== 'css' && f.language !== 'javascript'
  );

  const renderFileRow = (file: FileItem) => {
    const isActive = activeFileId === file.id;

    return (
      <button
        type="button"
        key={file.id}
        onClick={() => onSelectFile(file.id)}
        title={isCollapsed ? file.name : undefined}
        className={[
          'w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-2.5 transition-colors cursor-pointer',
          isActive
            ? 'bg-indigo-600/15 text-indigo-400 border-l-2 border-indigo-500 font-semibold'
            : 'border-l-2 border-transparent text-secondary hover:bg-surface-raised hover:text-primary',
        ].join(' ')}
      >
        <FileIcon language={file.language} />
        {!isCollapsed && <span className="truncate">{file.name}</span>}
      </button>
    );
  };

  return (
    <aside
      className={[
        'app-sidebar border-r border-theme bg-surface flex flex-col transition-[width] duration-200 select-none shrink-0',
        isCollapsed ? 'w-12' : 'w-56',
      ].join(' ')}
    >
      <div className="h-10 px-3 border-b border-theme flex items-center justify-between text-xs font-semibold text-muted tracking-wider font-sans">
        {!isCollapsed && (
          <div className="flex items-center gap-1.5 truncate">
            <FolderGit2 size={14} className="text-indigo-400" />
            <span className="truncate uppercase text-[11px]">EXPLORER</span>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1 hover:bg-surface-raised rounded text-muted hover:text-primary transition-colors ml-auto cursor-pointer"
          title={isCollapsed ? 'Expand Explorer' : 'Collapse Explorer'}
          aria-label={isCollapsed ? 'Expand Explorer' : 'Collapse Explorer'}
        >
          {isCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      <div className="flex-1 py-2 overflow-y-auto">
        {/* WEB PROJECT GROUP */}
        {webFiles.length > 0 && (
          <div className="mb-3">
            {!isCollapsed && (
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted font-sans flex items-center justify-between">
                <span>WEB PROJECT</span>
                <span className="text-[9px] text-indigo-400 font-normal">HTML / CSS / JS</span>
              </div>
            )}
            {webFiles.map(renderFileRow)}
          </div>
        )}

        {/* OTHER FILES / PROGRAMS GROUP */}
        {otherFiles.length > 0 && (
          <div>
            {!isCollapsed && (
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted font-sans">
                {webFiles.length > 0 ? 'STANDALONE SCRIPTS' : 'WORKSPACE FILES'}
              </div>
            )}
            {otherFiles.map(renderFileRow)}
          </div>
        )}
      </div>
    </aside>
  );
};

export default FileExplorer;
