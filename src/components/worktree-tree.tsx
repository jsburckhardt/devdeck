"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  GitBranch,
  CaretRight,
  CaretDown,
  ArrowClockwise,
  Spinner,
  FolderOpen,
  Tree,
} from "@phosphor-icons/react";
import { useWorktrees } from "@/hooks/use-worktrees";
import { useWorkspace } from "@/lib/workspace-context";
import type { WorkspaceContextChoice, WorkspaceContextStatus } from "@/lib/types";

interface WorktreeTreeProps {
  slug: string;
  compact?: boolean;
}

function statusLabel(status: WorkspaceContextStatus): string {
  switch (status) {
    case "locked":
      return "Locked";
    case "prunable":
      return "Prunable";
    case "missing":
      return "Missing";
    case "conflict":
      return "Conflict";
    case "disabled":
    case "stale":
    case "unavailable":
    case "git-unavailable":
    case "repository-unavailable":
    case "error":
      return "Unavailable";
    case "active":
    default:
      return "Active";
  }
}

function choiceStatusText(choice: WorkspaceContextChoice | null | undefined): string {
  if (!choice) return "Active";
  if (choice.disabledReason) return choice.disabledReason;
  return statusLabel(choice.status);
}

export function WorktreeTree({ slug, compact = false }: WorktreeTreeProps) {
  const {
    activeWorkspaceContextId,
    activeWorkspaceContextStatus,
    activeWorktree,
    setActiveWorkspaceContext,
    setActiveWorktree,
    worktreesSectionCollapsed,
    toggleWorktreesSection,
    fileTreeSyncFallbackActive,
  } = useWorkspace();
  const {
    choices,
    response,
    loading,
    error,
    refresh,
    worktrees: legacyWorktrees,
  } = useWorktrees(slug, {
    pollingEnabled: fileTreeSyncFallbackActive,
  });
  const [announcement, setAnnouncement] = useState("");
  const lastAnnouncementRef = useRef<string | null>(null);

  const normalizedChoices = Array.isArray(choices) ? choices : [];
  const legacyChoiceSeeds: WorkspaceContextChoice[] = (legacyWorktrees ?? []).map((worktree) => ({
    id: `wt_${worktree.name}` as WorkspaceContextChoice["id"],
    label: worktree.name,
    kind: "worktree" as const,
    status: "active" as const,
    available: true,
    disabled: false,
    branch: worktree.branch,
    summary: worktree.branch,
  }));

  const visibleChoices =
    normalizedChoices.length > 0
      ? normalizedChoices
      : response?.choices?.length
        ? response.choices
        : legacyChoiceSeeds;

  const selectedChoice = (() => {
    if (activeWorkspaceContextId && activeWorkspaceContextId !== "root") {
      return (
        visibleChoices.find((choice) => choice.id === activeWorkspaceContextId) ?? {
          id: activeWorkspaceContextId,
          label: "Unavailable workspace",
          kind: "worktree" as const,
          status: "stale" as const,
          available: false,
          disabled: true,
          disabledReason: "Selected workspace is no longer available.",
          summary: "Selected workspace is unavailable",
        }
      );
    }
    if (activeWorktree && activeWorktree.startsWith(".trees/")) {
      const legacyName = activeWorktree.slice(".trees/".length);
      return visibleChoices.find(
        (choice) => choice.kind === "worktree" && choice.label === legacyName,
      );
    }
    return visibleChoices.find((choice) => choice.id === "root") ?? response?.root ?? null;
  })();

  useEffect(() => {
    if (!selectedChoice) return;
    const nextAnnouncement = `${selectedChoice.label} · ${choiceStatusText(selectedChoice)}`;
    if (lastAnnouncementRef.current === nextAnnouncement) {
      return;
    }
    lastAnnouncementRef.current = nextAnnouncement;
    setAnnouncement(nextAnnouncement);
  }, [selectedChoice]);

  useEffect(() => {
    if (!activeWorktree || loading || visibleChoices.length === 0) {
      return;
    }

    const targetName = activeWorktree.startsWith(".trees/")
      ? activeWorktree.slice(".trees/".length)
      : activeWorktree;
    const matchesSelection = visibleChoices.some((choice) => choice.label === targetName);
    if (!matchesSelection) {
      setActiveWorktree(null);
      toast.warning("Worktree no longer exists; showing project root instead.");
    }
  }, [activeWorktree, loading, setActiveWorktree, visibleChoices]);

  const currentStatus = selectedChoice?.status ?? activeWorkspaceContextStatus ?? "active";
  const currentLabel = selectedChoice?.label ?? response?.root?.label ?? "Project root";
  const currentSummary = selectedChoice?.summary ?? selectedChoice?.branch ?? currentLabel;
  const rootSelection = visibleChoices.find((choice) => choice.id === "root") ?? response?.root;
  const worktreeChoices = visibleChoices.filter((choice) => choice.id !== "root");

  const handleSelectContext = (nextContextId: "root" | string) => {
    if (nextContextId === "root") {
      if (typeof setActiveWorkspaceContext === "function") {
        setActiveWorkspaceContext("root");
      }
      setActiveWorktree(null);
      return;
    }

    const targetChoice = visibleChoices.find((choice) => choice.id === nextContextId);
    if (targetChoice?.kind !== "worktree") {
      return;
    }

    if (response?.choices?.length || normalizedChoices.length > 0) {
      if (typeof setActiveWorkspaceContext === "function") {
        setActiveWorkspaceContext(nextContextId as "root" | `wt_${string}`);
      }
      return;
    }

    setActiveWorktree(`.trees/${targetChoice.label}`);
  };

  if (visibleChoices.length === 0 && !loading && !error) {
    return <div data-testid="worktree-tree-empty" className="hidden" />;
  }

  if (compact) {
    return (
      <div className="rounded-md border border-border bg-card/40 p-2">
        <div className="sr-only" role="status" aria-live="polite">
          {announcement}
        </div>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent/60"
          onClick={() => handleSelectContext("root")}
          aria-label={`Selected workspace context ${currentLabel}`}
          title={`${currentLabel} · ${choiceStatusText(selectedChoice)}`}
        >
          <span className="truncate font-medium text-foreground">{currentLabel}</span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
            {rootSelection?.id === selectedChoice?.id ? "Root" : statusLabel(currentStatus)}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div data-testid="worktree-tree" className="border-b border-border">
      <div className="flex h-7 w-full items-center gap-1 px-3 text-xs font-medium text-muted-foreground">
        <button
          type="button"
          onClick={toggleWorktreesSection}
          className="flex flex-1 items-center gap-1 hover:bg-accent/50"
          aria-label="Toggle worktrees section"
          aria-expanded={!worktreesSectionCollapsed}
        >
          {worktreesSectionCollapsed ? <CaretRight size={12} /> : <CaretDown size={12} />}
          <GitBranch size={14} />
          <span className="flex-1 text-left">Worktrees</span>
        </button>
        {loading && <Spinner size={12} className="animate-spin" />}
        <button
          type="button"
          onClick={refresh}
          className="rounded p-0.5 hover:bg-accent"
          aria-label="Refresh workspaces"
        >
          <ArrowClockwise size={12} />
        </button>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {!worktreesSectionCollapsed && (
        <div className="max-h-48 overflow-y-auto">
          {error && (
            <div className="px-3 py-1 text-xs text-destructive">
              <span>{error}</span>
              <button
                type="button"
                onClick={refresh}
                className="ml-1 underline hover:no-underline"
                aria-label="Retry loading worktrees"
              >
                Retry
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => handleSelectContext("root")}
            className={`flex w-full items-center gap-1.5 px-3 py-1 font-mono text-xs transition-colors hover:bg-accent/30 ${
              activeWorkspaceContextId === "root"
                ? "bg-accent/50 font-semibold ring-1 ring-border"
                : ""
            }`}
            aria-label="Switch to project root"
            aria-current={activeWorkspaceContextId === "root" ? "true" : undefined}
          >
            <CaretDown size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <FolderOpen size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{rootSelection?.label ?? "Project root"}</span>
            {rootSelection?.summary && (
              <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground">
                {rootSelection.summary}
              </span>
            )}
          </button>

          {worktreeChoices.map((choice) => {
            const isActive =
              activeWorkspaceContextId === choice.id ||
              (!!activeWorktree &&
                activeWorktree.startsWith(".trees/") &&
                activeWorktree.slice(".trees/".length) === choice.label);
            const isDisabled = choice.disabled || choice.available === false;
            const buttonLabel = `Switch to worktree ${choice.label}`;
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => {
                  if (isDisabled) return;
                  handleSelectContext(choice.id);
                }}
                disabled={isDisabled}
                className={`flex w-full items-center gap-1.5 py-1 pr-3 font-mono text-xs transition-colors hover:bg-accent/30 ${
                  isActive ? "bg-accent/50 font-semibold ring-1 ring-border" : ""
                } ${isDisabled ? "cursor-not-allowed opacity-70" : ""}`}
                style={{ paddingLeft: "1.75rem" }}
                aria-label={buttonLabel}
                aria-current={isActive ? "true" : undefined}
              >
                <CaretRight
                  size={12}
                  className="shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <Tree size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate text-left">{choice.label}</span>
                {choice.branch && choice.branch !== choice.label && (
                  <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground">
                    {choice.branch}
                  </span>
                )}
                {isDisabled && choice.disabledReason && (
                  <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground">
                    {choice.disabledReason}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!worktreesSectionCollapsed && (
        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <div className="font-medium text-foreground">{currentLabel}</div>
          <div>{currentSummary}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide">
            {choiceStatusText(selectedChoice)}
          </div>
        </div>
      )}
    </div>
  );
}
