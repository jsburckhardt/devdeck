"use client";

import { useEffect, useRef } from "react";
import {
  GitBranch,
  CaretRight,
  CaretDown,
  ArrowClockwise,
  Spinner,
  FolderOpen,
  Tree,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useWorktrees } from "@/hooks/use-worktrees";
import { useWorkspace } from "@/lib/workspace-context";

interface WorktreeTreeProps {
  slug: string;
}

export function WorktreeTree({ slug }: WorktreeTreeProps) {
  const workspace = useWorkspace();
  const activeWorktreeId = workspace.activeWorktreeId ?? workspace.activeWorktree ?? null;
  const setActiveWorktreeId = workspace.setActiveWorktreeId ?? workspace.setActiveWorktree;
  const { response, worktrees, loading, error, refresh } = useWorktrees(slug, activeWorktreeId, {
    pollingEnabled: workspace.fileTreeSyncFallbackActive,
  });
  const lastMissingNoticeRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading || error || !activeWorktreeId) return;

    if (activeWorktreeId.startsWith(".trees/")) {
      const migrated = worktrees.find(
        (worktree) => worktree.repoRelativeLabel === activeWorktreeId,
      );
      if (migrated) {
        setActiveWorktreeId(migrated.id);
        lastMissingNoticeRef.current = null;
        return;
      }
    }

    const stillExists = worktrees.some((worktree) => worktree.id === activeWorktreeId);
    if (stillExists) {
      lastMissingNoticeRef.current = null;
      return;
    }

    const noticeKey = `${slug}:${activeWorktreeId}`;
    if (lastMissingNoticeRef.current !== noticeKey) {
      toast.warning("Worktree no longer exists; showing project root instead.");
      lastMissingNoticeRef.current = noticeKey;
    }
    setActiveWorktreeId(null);
  }, [activeWorktreeId, error, loading, setActiveWorktreeId, slug, worktrees]);

  return (
    <div data-testid="worktree-tree" className="rounded-md border border-border bg-background/40">
      <div className="flex h-7 w-full items-center gap-1 px-3 text-xs font-medium text-muted-foreground">
        <button
          onClick={workspace.toggleWorktreesSection}
          className="flex flex-1 items-center gap-1 hover:bg-accent/50"
          aria-label="Toggle worktrees section"
          aria-expanded={!workspace.worktreesSectionCollapsed}
        >
          {workspace.worktreesSectionCollapsed ? <CaretRight size={12} /> : <CaretDown size={12} />}
          <GitBranch size={14} />
          <span className="flex-1 text-left">Worktrees</span>
        </button>
        {loading && <Spinner size={12} className="animate-spin" />}
        <button
          onClick={refresh}
          className="rounded p-0.5 hover:bg-accent"
          aria-label="Refresh worktrees"
        >
          <ArrowClockwise size={12} />
        </button>
      </div>

      {!workspace.worktreesSectionCollapsed && (
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

          <button
            onClick={() => setActiveWorktreeId(null)}
            className={`flex w-full items-center gap-1.5 px-3 py-1 font-mono text-xs transition-colors hover:bg-accent/30 ${
              activeWorktreeId === null ? "bg-accent/50 font-semibold ring-1 ring-border" : ""
            }`}
            aria-label="Switch to project root"
            aria-current={activeWorktreeId === null ? "true" : undefined}
          >
            <CaretDown size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <FolderOpen size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">Project root</span>
          </button>

          {response && worktrees.length === 0 && !loading && !error && (
            <div className="px-3 py-1 text-xs text-muted-foreground">No linked worktrees</div>
          )}

          {worktrees.map((wt) => {
            const worktreeId = wt.id ?? `.trees/${wt.name}`;
            const state = wt.state ?? "available";
            const isActive = activeWorktreeId === worktreeId;
            const disabled = state === "locked" || state === "prunable" || state === "missing";
            return (
              <button
                key={worktreeId}
                onClick={() => {
                  if (!disabled) setActiveWorktreeId(worktreeId);
                }}
                className={`flex w-full items-center gap-1.5 py-1 pr-3 font-mono text-xs transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50 ${
                  isActive ? "bg-accent/50 font-semibold ring-1 ring-border" : ""
                }`}
                style={{ paddingLeft: "1.75rem" }}
                aria-label={`Switch to worktree ${wt.name}`}
                aria-current={isActive ? "true" : undefined}
                aria-disabled={disabled ? "true" : undefined}
                disabled={disabled}
                tabIndex={disabled ? -1 : undefined}
              >
                <CaretRight
                  size={12}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <Tree size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate text-left">{wt.name}</span>
                {wt.branch && wt.branch !== wt.name && (
                  <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground">
                    {wt.branch}
                  </span>
                )}
                {state !== "available" && (
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {state}
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
