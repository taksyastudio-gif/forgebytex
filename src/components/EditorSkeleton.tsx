import type { FC } from 'react';

export const EditorSkeleton: FC = () => (
  <div
    aria-busy="true"
    aria-label="Loading code editor"
    className="code-editor-frame relative flex h-full min-h-[250px] w-full flex-1 flex-col overflow-hidden bg-editor-bg sm:min-h-[300px]"
  >
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-theme bg-surface px-2">
      <div className="h-5 w-20 animate-pulse rounded bg-surface-soft" />
      <div className="h-5 w-20 animate-pulse rounded bg-surface-soft" />
    </div>

    <div className="flex min-h-0 flex-1 items-center justify-center text-xs font-mono text-muted">
      Loading editor...
    </div>
  </div>
);

export default EditorSkeleton;