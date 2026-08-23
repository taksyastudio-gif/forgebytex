import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileCode2,
  FileText,
  Globe2,
  Database,
  File,
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
  if (language === 'c') {
    return (
      <FileCode2
        size={14}
        className="text-sky-400 shrink-0"
      />
    );
  }

  if (language === 'html') {
    return (
      <Globe2
        size={14}
        className="text-orange-400 shrink-0"
      />
    );
  }

  if (language === 'sql') {
    return (
      <Database
        size={14}
        className="text-purple-400 shrink-0"
      />
    );
  }

  if (language === 'python') {
    return (
      <FileText
        size={14}
        className="text-yellow-400 shrink-0"
      />
    );
  }

  return (
    <File
      size={14}
      className="text-slate-400 shrink-0"
    />
  );
};

export const FileExplorer: React.FC<
  FileExplorerProps
> = ({
  files,
  activeFileId,
  onSelectFile,
  isCollapsed,
  onToggleCollapse,
}) => {
  return (
    <aside
      className={[
        'bg-[#0b0e17]',
        'border-r border-slate-800/80',
        'flex flex-col',
        'transition-[width]',
        'duration-200',
        'select-none',
        'shrink-0',
        isCollapsed ? 'w-12' : 'w-56',
      ].join(' ')}
    >
      <div
        className={[
          'h-9 px-3',
          'border-b border-slate-800/80',
          'flex items-center',
          'text-xs font-mono font-bold',
          'text-slate-400',
          'uppercase tracking-wider',
        ].join(' ')}
      >
        {!isCollapsed && (
          <span className="truncate">
            Workspace Files
          </span>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-100 transition-colors ml-auto"
          title={
            isCollapsed
              ? 'Expand File Explorer'
              : 'Collapse File Explorer'
          }
          aria-label={
            isCollapsed
              ? 'Expand File Explorer'
              : 'Collapse File Explorer'
          }
        >
          {isCollapsed ? (
            <ChevronRight size={15} />
          ) : (
            <ChevronLeft size={15} />
          )}
        </button>
      </div>

      <div className="flex-1 py-2 overflow-y-auto">
        {files.map((file) => {
          const isActive =
            activeFileId === file.id;

          return (
            <button
              type="button"
              key={file.id}
              onClick={() =>
                onSelectFile(file.id)
              }
              title={
                isCollapsed
                  ? file.name
                  : undefined
              }
              className={[
                'w-full text-left',
                'px-3 py-1.5',
                'text-xs font-mono',
                'flex items-center gap-2',
                'transition-colors',
                isActive
                  ? 'bg-indigo-600/20 text-indigo-300 border-l-2 border-indigo-500 font-semibold'
                  : 'border-l-2 border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
              ].join(' ')}
            >
              <FileIcon
                language={file.language}
              />

              {!isCollapsed && (
                <span className="truncate">
                  {file.name}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
};

export default FileExplorer;