"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import {
  Spinner,
  FileCode,
  FolderOpen,
  TerminalWindow,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { ErrorBoundary } from "@/components/error-boundary";
import { FileTree } from "@/components/file-tree";
import { TerminalPanel } from "@/components/terminal-panel";
import { useFileTreeSync } from "@/hooks/use-file-tree-sync";
import { useOpenProjects } from "@/lib/open-projects-context";

const FileViewer = dynamic(() => import("@/components/file-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Spinner size={24} className="animate-spin text-muted-foreground" />
    </div>
  ),
});
import { useWorkspace } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

const ROOT_FILE_TREE_POLL_INTERVAL_MS = 5000;

function PanelToggle({
  icon: Icon,
  label,
  active,
  guarded = false,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active: boolean;
  guarded?: boolean;
  onClick: () => void;
}) {
  const ariaLabel = `${active ? "Hide" : "Show"} ${label}`;

  return (
    <button
      onClick={(event) => {
        if (guarded) {
          event.preventDefault();
          return;
        }
        onClick();
      }}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        guarded && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground",
      )}
      title={ariaLabel}
      aria-label={ariaLabel}
      aria-pressed={active}
      aria-disabled={guarded ? "true" : undefined}
      tabIndex={guarded ? -1 : undefined}
    >
      <Icon size={14} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ExplorerContent({
  loading,
  error,
  nodes,
  onRetry,
  syncStatus,
  syncError,
  onSyncRetry,
}: {
  loading: boolean;
  error: string | null;
  nodes: import("@/lib/types").FileNode[];
  onRetry: () => void;
  syncStatus: import("@/lib/types").FileTreeSyncStatus;
  syncError: import("@/lib/types").FileTreeSyncError | null;
  onSyncRetry: () => void;
}) {
  const syncText =
    syncStatus === "connecting"
      ? "File sync connecting…"
      : syncStatus === "ready"
        ? "File sync ready"
        : syncStatus === "syncing"
          ? "File sync applying changes…"
          : syncStatus === "degraded"
            ? (syncError?.message ?? "File sync degraded — polling every 5 seconds.")
            : syncStatus === "unauthorized"
              ? "File sync unauthorized — reopen DevDeck with a valid token."
              : (syncError?.message ?? "File sync error.");
  const canRetry = Boolean(syncError?.retryable);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-card/50 px-3">
        <span className="font-mono text-xs font-medium text-muted-foreground">Explorer</span>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <span
            className="truncate text-[10px] text-muted-foreground"
            role="status"
            aria-live="polite"
            title={syncText}
          >
            {syncText}
          </span>
          {canRetry && (
            <button
              type="button"
              onClick={onSyncRetry}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Retry file tree sync"
            >
              Retry Sync
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ErrorBoundary>
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : error && nodes.length === 0 ? (
            <div
              className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center"
              role="status"
              aria-live="polite"
            >
              <WarningCircle size={32} className="text-destructive" />
              <p className="text-sm text-destructive">Failed to load files</p>
              <p className="text-xs text-muted-foreground">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-accent"
                aria-label="Retry loading file tree"
              >
                Retry
              </button>
            </div>
          ) : (
            <FileTree nodes={nodes} />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}

interface WorkspaceLayoutProps {
  project: Project;
}

export function WorkspaceLayout({ project }: WorkspaceLayoutProps) {
  const router = useRouter();
  const { requestProjectClose, clearProjectCloseRequest } = useOpenProjects();
  const {
    setProject,
    fileTree,
    fileTreeLoading,
    fileTreeError,
    setFileTreeLoading,
    refreshFileTree,
    fileTreeSyncStatus,
    fileTreeSyncError,
    fileTreeSyncFallbackActive,
    fileTreeSyncRetryNonce,
    retryFileTreeSync,
    refreshFileTreeScope,
    invalidateFileTreeScope,
    updateFileTreeSyncState,
    setFileTreeSyncFallbackActive,
    showExplorer,
    showFileViewer,
    showTerminal,
    activeWorkspaceContextId,
    toggleExplorer,
    toggleFileViewer,
    toggleTerminal,
    activeWorktree,
  } = useWorkspace();

  const explorerPanelRef = useRef<PanelImperativeHandle>(null);
  const fileViewerPanelRef = useRef<PanelImperativeHandle>(null);
  const terminalPanelRef = useRef<PanelImperativeHandle>(null);

  useEffect(() => {
    setProject(project);
  }, [project, setProject]);

  useFileTreeSync({
    slug: project.slug,
    worktree: activeWorktree,
    workspaceContext: activeWorkspaceContextId,
    retryNonce: fileTreeSyncRetryNonce,
    onStatusChange: updateFileTreeSyncState,
    onFallbackChange: setFileTreeSyncFallbackActive,
    onReady: refreshFileTreeScope,
    onChanged: invalidateFileTreeScope,
  });

  const loadCountRef = useRef(0);

  const loadRootFileTree = useCallback(
    async (slug: string) => {
      loadCountRef.current += 1;
      setFileTreeLoading(true);
      try {
        await refreshFileTree(slug);
      } finally {
        loadCountRef.current -= 1;
        if (loadCountRef.current === 0) {
          setFileTreeLoading(false);
        }
      }
    },
    [refreshFileTree, setFileTreeLoading],
  );

  // Root file-tree load: toggle the spinner via `fileTreeLoading` on first
  // mount, project switch, or active worktree switch. All other refreshes go
  // through `refreshFileTree` directly and remain silent (Decision #62).
  //
  // Pass `project.slug` explicitly so the fetch does NOT depend on the
  // context `project` state having propagated from the `setProject` effect
  // above — this avoids a no-op + double-pass spinner flicker on cold mount
  // (Decision #63).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadRootFileTree(project.slug);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceContextId, activeWorktree, project.slug, loadRootFileTree]);

  useEffect(() => {
    if (!fileTreeSyncFallbackActive) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let intervalId: number | undefined;
    const refresh = () => {
      void refreshFileTree(project.slug);
    };
    const stopPolling = () => {
      if (intervalId === undefined) return;
      window.clearInterval(intervalId);
      intervalId = undefined;
    };
    const startPolling = () => {
      if (document.visibilityState === "hidden" || intervalId !== undefined) return;
      intervalId = window.setInterval(refresh, ROOT_FILE_TREE_POLL_INTERVAL_MS);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
        return;
      }

      refresh();
      startPolling();
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    activeWorkspaceContextId,
    activeWorktree,
    fileTreeSyncFallbackActive,
    project.slug,
    refreshFileTree,
  ]);

  const handleRetry = useCallback(() => {
    void loadRootFileTree(project.slug);
  }, [loadRootFileTree, project.slug]);

  const visiblePanelCount = [showExplorer, showFileViewer, showTerminal].filter(Boolean).length;
  const explorerGuarded = showExplorer && visiblePanelCount === 1;
  const fileViewerGuarded = showFileViewer && visiblePanelCount === 1;
  const terminalGuarded = showTerminal && visiblePanelCount === 1;

  // Collapse/expand panels imperatively to preserve component lifecycle
  // across visibility toggles (Decision #84). useLayoutEffect prevents a
  // one-frame flash where the panel renders at defaultSize before collapsing.
  useLayoutEffect(() => {
    if (showExplorer) {
      explorerPanelRef.current?.expand();
    } else {
      explorerPanelRef.current?.collapse();
    }
  }, [showExplorer]);

  useLayoutEffect(() => {
    if (showFileViewer) {
      fileViewerPanelRef.current?.expand();
    } else {
      fileViewerPanelRef.current?.collapse();
    }
  }, [showFileViewer]);

  useLayoutEffect(() => {
    if (showTerminal) {
      terminalPanelRef.current?.expand();
    } else {
      terminalPanelRef.current?.collapse();
    }
  }, [showTerminal]);

  useLayoutEffect(() => {
    const visiblePanels = [
      showExplorer ? explorerPanelRef.current : null,
      showFileViewer ? fileViewerPanelRef.current : null,
      showTerminal ? terminalPanelRef.current : null,
    ].filter((panel): panel is PanelImperativeHandle => panel !== null);

    if (visiblePanels.length === 1) {
      visiblePanels[0].resize("100%");
    }
  }, [activeWorktree, project.slug, showExplorer, showFileViewer, showTerminal]);

  const normalizedProjectSlug = project.slug.trim();
  const safeProjectName = (project.name ?? "").trim() || normalizedProjectSlug;
  const closeProjectLabel = `Close project ${safeProjectName}`;
  const closeProjectDisabled = normalizedProjectSlug.length === 0;
  const handleCloseProject = useCallback(() => {
    if (closeProjectDisabled) {
      return;
    }

    const request = requestProjectClose(project.slug, project.slug);
    if (!request.accepted || !request.target) {
      return;
    }

    try {
      router.push(request.target);
    } catch {
      clearProjectCloseRequest(normalizedProjectSlug);
      console.error("Failed to navigate after closing project", {
        slug: normalizedProjectSlug,
        target: request.target,
      });
    }
  }, [
    clearProjectCloseRequest,
    closeProjectDisabled,
    normalizedProjectSlug,
    project.slug,
    requestProjectClose,
    router,
  ]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Panel toggle bar */}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border bg-card/30 px-2">
        <PanelToggle
          icon={FolderOpen}
          label="Explorer"
          active={showExplorer}
          guarded={explorerGuarded}
          onClick={toggleExplorer}
        />
        <PanelToggle
          icon={FileCode}
          label="File Preview"
          active={showFileViewer}
          guarded={fileViewerGuarded}
          onClick={toggleFileViewer}
        />
        <PanelToggle
          icon={TerminalWindow}
          label="Terminal"
          active={showTerminal}
          guarded={terminalGuarded}
          onClick={toggleTerminal}
        />
        <div aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={closeProjectDisabled ? undefined : handleCloseProject}
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40",
            closeProjectDisabled &&
              "cursor-not-allowed border-border text-muted-foreground opacity-50 hover:bg-transparent hover:text-muted-foreground",
          )}
          aria-label={closeProjectLabel}
          title={closeProjectLabel}
          aria-disabled={closeProjectDisabled ? "true" : undefined}
          tabIndex={closeProjectDisabled ? -1 : undefined}
        >
          <X size={14} weight="bold" aria-hidden="true" />
          <span className="hidden sm:inline">Close Project</span>
        </button>
      </div>

      <Group orientation="horizontal" className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* File Explorer stays mounted even when collapsed. Spinner is gated SOLELY by
            `fileTreeLoading` (initial-load). `fileTreeRefreshing` is
            intentionally NOT surfaced here so background refreshes after
            in-portal edits stay silent (Decision #62). */}
        <Panel
          panelRef={explorerPanelRef}
          collapsible
          collapsedSize={0}
          defaultSize={20}
          minSize={12}
          className="min-h-0 min-w-0 overflow-hidden"
        >
          <ExplorerContent
            loading={fileTreeLoading}
            error={fileTreeError}
            nodes={fileTree}
            onRetry={handleRetry}
            syncStatus={fileTreeSyncStatus}
            syncError={fileTreeSyncError}
            onSyncRetry={retryFileTreeSync}
          />
        </Panel>

        <Separator
          className={cn(
            "w-1 bg-border transition-colors hover:bg-primary/40",
            !(showExplorer && showFileViewer) && "hidden",
          )}
          disabled={!(showExplorer && showFileViewer)}
        />
        <Panel
          panelRef={fileViewerPanelRef}
          collapsible
          collapsedSize={0}
          defaultSize={48}
          minSize={20}
          className="min-h-0 min-w-0 overflow-hidden"
        >
          <ErrorBoundary>
            <FileViewer />
          </ErrorBoundary>
        </Panel>

        <Separator
          className={cn(
            "w-1 bg-border transition-colors hover:bg-primary/40",
            !(showTerminal && (showFileViewer || showExplorer)) && "hidden",
          )}
          disabled={!(showTerminal && (showFileViewer || showExplorer))}
        />
        <Panel
          panelRef={terminalPanelRef}
          collapsible
          collapsedSize={0}
          defaultSize={32}
          minSize={15}
          className="min-h-0 min-w-0 overflow-hidden"
        >
          <ErrorBoundary>
            <TerminalPanel
              projectSlug={project.slug}
              workspaceContextId={activeWorkspaceContextId}
            />
          </ErrorBoundary>
        </Panel>
      </Group>
    </div>
  );
}
