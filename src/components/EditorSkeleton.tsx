import React from 'react';

export const EditorSkeleton: React.FC = () => (
  <div className="code-editor-frame relative flex h-full min-h-[250px] sm:min-h-[300px] w-full flex-1 flex-col overflow-hidden bg-editor-bg">
    <div className="flex items-center h-9 px-2 border-b border-theme bg-surface shrink-0 gap-1 animate-pulse">
      <div className="h-5 w-20 bg-surface-soft rounded" />
      <div className="h-5 w-20 bg-surface-soft rounded" />
    </div>
    <div className="flex-1 min-h-0 relative w-full h-full flex items-center justify-center text-muted text-xs font-mono">
      <span>Loading editor…</span>
    </div>
  </div>
);

export default EditorSkeleton;
