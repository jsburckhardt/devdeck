"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import { Spinner, FileCode, TerminalWindow, WarningCircle } from "@phosphor-icons/react";
import { ErrorBoundary } from "@/components/error-boundary";
import { FileTree } from "@/components/file-tree";
import { TerminalPanel } from "@/components/terminal-panel";

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

function PanelToggle({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
      title={`Toggle ${label}`}
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
}: {
  loading: boolean;
  error: string | null;
  nodes: import("@/lib/types").FileNode[];
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-8 shrink-0 items-center border-b border-border bg-card/50 px-3">
        <span className="font-mono text-xs font-medium text-muted-foreground">Explorer</span>
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
  const {
    setProject,
    fileTree,
    fileTreeLoading,
    fileTreeError,
    setFileTreeLoading,
    refreshFileTree,
    showFileViewer,
    showTerminal,
    toggleFileViewer,
    toggleTerminal,
  } = useWorkspace();

  const fileViewerPanelRef = useRef<PanelImperativeHandle>(null);
  const terminalPanelRef = useRef<PanelImperativeHandle>(null);

  useEffect(() => {
    setProject(project);
  }, [project, setProject]);

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

  // Initial file-tree load: toggle the spinner via `fileTreeLoading` only on
  // first mount (or project switch). All subsequent refreshes go through
  // `refreshFileTree` directly and remain silent (Decision #62).
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
  }, [project.slug, loadRootFileTree]);

  const handleRetry = useCallback(() => {
    void loadRootFileTree(project.slug);
  }, [loadRootFileTree, project.slug]);

  // Collapse/expand panels imperatively to preserve component lifecycle
  // across visibility toggles (Decision #84). useLayoutEffect prevents a
  // one-frame flash where the panel renders at defaultSize before collapsing.
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

  return (
    <div className="flex h-full flex-col">
      {/* Panel toggle bar */}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border bg-card/30 px-2">
        <PanelToggle
          icon={FileCode}
          label="File Preview"
          active={showFileViewer}
          onClick={toggleFileViewer}
        />
        <PanelToggle
          icon={TerminalWindow}
          label="Terminal"
          active={showTerminal}
          onClick={toggleTerminal}
        />
      </div>

      <Group orientation="horizontal" className="min-h-0 flex-1">
        {/* File Explorer — always visible. Spinner is gated SOLELY by
            `fileTreeLoading` (initial-load). `fileTreeRefreshing` is
            intentionally NOT surfaced here so background refreshes after
            in-portal edits stay silent (Decision #62). */}
        <Panel defaultSize={20} minSize={12}>
          <ExplorerContent
            loading={fileTreeLoading}
            error={fileTreeError}
            nodes={fileTree}
            onRetry={handleRetry}
          />
        </Panel>

        <Separator
          className={cn(
            "w-1 bg-border transition-colors hover:bg-primary/40",
            !showFileViewer && "hidden",
          )}
          disabled={!showFileViewer}
        />
        <Panel
          panelRef={fileViewerPanelRef}
          collapsible
          collapsedSize={0}
          defaultSize={48}
          minSize={20}
        >
          <ErrorBoundary>
            <FileViewer />
          </ErrorBoundary>
        </Panel>

        <Separator
          className={cn(
            "w-1 bg-border transition-colors hover:bg-primary/40",
            !showTerminal && "hidden",
          )}
          disabled={!showTerminal}
        />
        <Panel
          panelRef={terminalPanelRef}
          collapsible
          collapsedSize={0}
          defaultSize={32}
          minSize={15}
        >
          <ErrorBoundary>
            <TerminalPanel slug={project.slug} />
          </ErrorBoundary>
        </Panel>
      </Group>
    </div>
  );
}
