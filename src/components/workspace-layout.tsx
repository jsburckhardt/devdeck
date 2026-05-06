"use client";

import { useEffect, useCallback } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Spinner, FileCode, TerminalWindow } from "@phosphor-icons/react";
import { ErrorBoundary } from "@/components/error-boundary";
import { FileTree } from "@/components/file-tree";
import { FileViewer } from "@/components/file-viewer";
import { TerminalPanel } from "@/components/terminal-panel";
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
  nodes,
}: {
  loading: boolean;
  nodes: import("@/lib/types").FileNode[];
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
          ) : (
            <FileTree nodes={nodes} />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}

/**
 * Builds the panel layout key based on which panels are visible.
 * Changing the key forces a full remount of the Group, ensuring the layout
 * constraints are recomputed correctly for the current panel combination.
 */
function layoutKey(showFileViewer: boolean, showTerminal: boolean): string {
  return `layout-${showFileViewer ? "f" : ""}-${showTerminal ? "t" : ""}`;
}

interface WorkspaceLayoutProps {
  project: Project;
}

export function WorkspaceLayout({ project }: WorkspaceLayoutProps) {
  const {
    setProject,
    fileTree,
    fileTreeLoading,
    setFileTree,
    setFileTreeLoading,
    showFileViewer,
    showTerminal,
    toggleFileViewer,
    toggleTerminal,
  } = useWorkspace();

  useEffect(() => {
    setProject(project);
  }, [project, setProject]);

  const fetchTree = useCallback(async () => {
    setFileTreeLoading(true);
    try {
      const res = await fetch(`/api/files?slug=${encodeURIComponent(project.slug)}`);
      if (!res.ok) throw new Error("Failed to fetch file tree");
      const data = await res.json();
      setFileTree(data);
    } catch (err) {
      console.error("Failed to load file tree:", err);
    } finally {
      setFileTreeLoading(false);
    }
  }, [project.slug, setFileTree, setFileTreeLoading]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // Compute panel sizes based on which panels are visible
  const rightPanelCount = (showFileViewer ? 1 : 0) + (showTerminal ? 1 : 0);
  const explorerSize = rightPanelCount === 0 ? 100 : 20;
  const remainingSize = 100 - explorerSize;

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

      {/* Key forces remount when panel visibility changes, ensuring correct layout */}
      <Group
        key={layoutKey(showFileViewer, showTerminal)}
        orientation="horizontal"
        className="min-h-0 flex-1"
      >
        {/* File Explorer — always visible */}
        <Panel defaultSize={explorerSize} minSize={12}>
          <ExplorerContent loading={fileTreeLoading} nodes={fileTree} />
        </Panel>

        {showFileViewer && (
          <>
            <Separator className="w-1 bg-border transition-colors hover:bg-primary/40" />
            <Panel defaultSize={showTerminal ? remainingSize * 0.6 : remainingSize} minSize={20}>
              <ErrorBoundary>
                <FileViewer />
              </ErrorBoundary>
            </Panel>
          </>
        )}

        {showTerminal && (
          <>
            <Separator className="w-1 bg-border transition-colors hover:bg-primary/40" />
            <Panel defaultSize={showFileViewer ? remainingSize * 0.4 : remainingSize} minSize={15}>
              <ErrorBoundary>
                <TerminalPanel />
              </ErrorBoundary>
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
}
