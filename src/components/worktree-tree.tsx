"use client";

import { GitBranch, CaretRight, CaretDown, ArrowClockwise, Spinner } from "@phosphor-icons/react";
import { useWorktrees } from "@/hooks/use-worktrees";
import { useWorkspace } from "@/lib/workspace-context";

interface WorktreeTreeProps {
  slug: string;
}

export function WorktreeTree({ slug }: WorktreeTreeProps) {
  const { worktrees, loading, error, refresh } = useWorktrees(slug);
  const { activeWorktree, worktreesSectionCollapsed, setActiveWorktree, toggleWorktreesSection } =
    useWorkspace();

  // Render nothing visible when worktree list is empty (stays mounted per Decision #84)
  if (worktrees.length === 0 && !loading && !error) {
    return <div data-testid="worktree-tree-empty" className="hidden" />;
  }

  return (
    <div data-testid="worktree-tree" className="border-b border-border">
      {/* Section header */}
      <button
        onClick={toggleWorktreesSection}
        className="flex h-7 w-full items-center gap-1 px-3 text-xs font-medium text-muted-foreground hover:bg-accent/50"
        aria-label="Toggle worktrees section"
        aria-expanded={!worktreesSectionCollapsed}
      >
        {worktreesSectionCollapsed ? <CaretRight size={12} /> : <CaretDown size={12} />}
        <GitBranch size={14} />
        <span className="flex-1 text-left">Worktrees</span>
        {loading && <Spinner size={12} className="animate-spin" />}
        <button
          onClick={(e) => {
            e.stopPropagation();
            refresh();
          }}
          className="rounded p-0.5 hover:bg-accent"
          aria-label="Refresh worktrees"
        >
          <ArrowClockwise size={12} />
        </button>
      </button>

      {/* Content */}
      {!worktreesSectionCollapsed && (
        <div className="max-h-48 overflow-y-auto">
          {error && (
            <div className="px-3 py-1 text-xs text-destructive">
              <span>{error}</span>
              <button
                onClick={refresh}
                className="ml-1 underline hover:no-underline"
                aria-label="Retry loading worktrees"
              >
                Retry
              </button>
            </div>
          )}

          {/* Project root entry */}
          <button
            onClick={() => setActiveWorktree(null)}
            className={`flex w-full items-center gap-1.5 px-3 py-1 text-xs transition-colors hover:bg-accent/30 ${
              activeWorktree === null ? "bg-accent/50 font-medium" : ""
            }`}
            aria-label="Switch to project root"
            aria-current={activeWorktree === null ? "true" : undefined}
          >
            <GitBranch size={12} className="shrink-0 text-muted-foreground" />
            <span className="truncate">Project root</span>
          </button>

          {/* Worktree entries */}
          {worktrees.map((wt) => {
            const worktreePath = `.trees/${wt.name}`;
            const isActive = activeWorktree === worktreePath;
            return (
              <button
                key={wt.name}
                onClick={() => setActiveWorktree(worktreePath)}
                className={`flex w-full items-center gap-1.5 px-3 py-1 text-xs transition-colors hover:bg-accent/30 ${
                  isActive ? "bg-accent/50 font-medium" : ""
                }`}
                aria-label={`Switch to worktree ${wt.name}`}
                aria-current={isActive ? "true" : undefined}
              >
                <GitBranch size={12} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{wt.name}</span>
                {wt.branch !== wt.name && (
                  <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground">
                    {wt.branch}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
