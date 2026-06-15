import type React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project } from "@/lib/types";

const panelMockState = vi.hoisted(() => ({
  panelHandles: [] as Array<{
    collapse: ReturnType<typeof vi.fn>;
    expand: ReturnType<typeof vi.fn>;
    isCollapsed: ReturnType<typeof vi.fn>;
    getSize: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
  }>,
  panelIndex: 0,
  separatorIndex: 0,
}));

const routerMockState = vi.hoisted(() => ({
  push: vi.fn(),
}));

const openProjectsMockState = vi.hoisted(() => ({
  openProjects: [] as Project[],
  closeProject: vi.fn(),
  requestProjectClose: vi.fn(),
  clearProjectCloseRequest: vi.fn(),
}));

vi.mock("@/lib/workspace-context", () => ({
  useWorkspace: vi.fn(),
}));

vi.mock("@/hooks/use-file-tree-sync", () => ({
  useFileTreeSync: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerMockState.push,
  }),
}));

vi.mock("@/lib/open-projects-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/open-projects-context")>();
  return {
    ...actual,
    useOpenProjects: () => ({
      openProjects: openProjectsMockState.openProjects,
      closeProject: openProjectsMockState.closeProject,
      requestProjectClose: openProjectsMockState.requestProjectClose,
      clearProjectCloseRequest: openProjectsMockState.clearProjectCloseRequest,
      openProject: vi.fn(),
      saveWorkspaceState: vi.fn(),
      restoreWorkspaceState: vi.fn(),
      updateCopilotStatus: vi.fn(),
      getCopilotStatus: vi.fn(() => "idle" as const),
    }),
  };
});

// Stub heavy children so we can isolate the explorer behavior.
vi.mock("@/components/file-tree", () => ({
  FileTree: ({ nodes }: { nodes: unknown[] }) => (
    <div data-testid="file-tree">{`nodes:${nodes.length}`}</div>
  ),
}));

vi.mock("@/components/terminal-panel", () => ({
  TerminalPanel: ({ worktree }: { slug?: string; worktree?: string }) => (
    <div data-testid="terminal-panel" data-worktree={worktree ?? ""} />
  ),
}));

vi.mock("@/components/file-viewer", () => ({
  default: () => <div data-testid="file-viewer" />,
}));

vi.mock("react-resizable-panels", () => ({
  Group: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => {
    panelMockState.panelIndex = 0;
    panelMockState.separatorIndex = 0;
    return (
      <div data-testid="panel-group" className={className}>
        {children}
      </div>
    );
  },
  Panel: ({
    children,
    panelRef,
    collapsible,
    collapsedSize,
    className,
  }: React.PropsWithChildren<{
    panelRef?: React.Ref<unknown>;
    collapsible?: boolean;
    collapsedSize?: number;
    className?: string;
  }>) => {
    const index = panelMockState.panelIndex++;
    const handle =
      panelMockState.panelHandles[index] ??
      (panelMockState.panelHandles[index] = {
        collapse: vi.fn(),
        expand: vi.fn(),
        isCollapsed: vi.fn(() => false),
        getSize: vi.fn(() => ({ asPercentage: 50, inPixels: 500 })),
        resize: vi.fn(),
      });

    if (panelRef && typeof panelRef === "object" && panelRef !== null) {
      (panelRef as React.MutableRefObject<unknown>).current = handle;
    }
    return (
      <div
        data-testid={`panel-${index}`}
        data-collapsible={String(Boolean(collapsible))}
        data-collapsed-size={String(collapsedSize ?? "")}
        className={className}
      >
        {children}
      </div>
    );
  },
  Separator: ({ className, disabled }: { className?: string; disabled?: boolean }) => {
    const index = panelMockState.separatorIndex++;
    return (
      <div
        data-testid={`separator-${index}`}
        data-disabled={String(Boolean(disabled))}
        className={className}
      />
    );
  },
}));

import { useWorkspace } from "@/lib/workspace-context";
import { useFileTreeSync } from "@/hooks/use-file-tree-sync";
import { WorkspaceLayout } from "./workspace-layout";

const mockUseWorkspace = vi.mocked(useWorkspace);
const mockUseFileTreeSync = vi.mocked(useFileTreeSync);

const project: Project = {
  slug: "demo",
  name: "Demo",
  path: "/demo",
  description: "",
  source: "auto" as const,
};

function makeProject(overrides: Partial<Project>): Project {
  return {
    ...project,
    ...overrides,
  };
}

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    project: null,
    selectedFile: null,
    expandedFolders: new Set<string>(),
    showExplorer: true,
    showFileViewer: true,
    showTerminal: true,
    fileTree: [],
    fileTreeLoading: false,
    fileTreeError: null,
    fileTreeRefreshing: false,
    fileTreeSyncStatus: "ready",
    fileTreeSyncError: null,
    fileTreeSyncFallbackActive: false,
    fileTreeSyncRetryNonce: 0,
    retryFileTreeSync: vi.fn(),
    invalidateFileTreeScope: vi.fn().mockResolvedValue(undefined),
    updateFileTreeSyncState: vi.fn(),
    setFileTreeSyncFallbackActive: vi.fn(),
    activeWorktree: null,
    worktreesSectionCollapsed: false,
    setProject: vi.fn(),
    selectFile: vi.fn(),
    toggleFolder: vi.fn(),
    toggleExplorer: vi.fn(),
    toggleFileViewer: vi.fn(),
    toggleTerminal: vi.fn(),
    setFileTree: vi.fn(),
    setFileTreeLoading: vi.fn(),
    refreshFileTree: vi.fn().mockResolvedValue(undefined),
    loadDirectoryChildren: vi.fn().mockResolvedValue(undefined),
    directoryLoading: new Set<string>(),
    directoryErrors: new Map<string, string>(),
    setActiveWorktree: vi.fn(),
    toggleWorktreesSection: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useWorkspace>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseFileTreeSync.mockImplementation(() => undefined);
  panelMockState.panelHandles = [];
  panelMockState.panelIndex = 0;
  panelMockState.separatorIndex = 0;
  openProjectsMockState.openProjects = [project];
  openProjectsMockState.requestProjectClose.mockImplementation(
    (slug: string, activeSlug: string | null) => {
      const normalizedSlug = slug.trim();
      if (!normalizedSlug) {
        return { accepted: false, target: null, reason: "invalid-slug" as const };
      }

      openProjectsMockState.closeProject(normalizedSlug);
      if (activeSlug?.trim() !== normalizedSlug) {
        return { accepted: true, target: null };
      }

      const closedIndex = openProjectsMockState.openProjects.findIndex(
        (openProject) => openProject.slug.trim() === normalizedSlug,
      );
      if (closedIndex === -1) {
        return { accepted: true, target: "/" };
      }

      const remainingProjects = openProjectsMockState.openProjects.filter(
        (openProject) => openProject.slug.trim() !== normalizedSlug,
      );
      if (remainingProjects.length === 0) {
        return { accepted: true, target: "/" };
      }

      const targetProject = remainingProjects[closedIndex] ?? remainingProjects[closedIndex - 1];
      return {
        accepted: true,
        target: `/project/${encodeURIComponent(targetProject.slug.trim())}`,
      };
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("WorkspaceLayout", () => {
  it("T7: initial mount calls refreshFileTree once and toggles fileTreeLoading true→false", async () => {
    let resolveRefresh: () => void = () => {};
    const refreshFileTree = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const setFileTreeLoading = vi.fn();

    mockUseWorkspace.mockReturnValue(
      makeContext({
        fileTreeLoading: true,
        refreshFileTree,
        setFileTreeLoading,
      }),
    );

    render(<WorkspaceLayout project={project} />);

    // Spinner is visible while fileTreeLoading=true (no FileTree yet).
    expect(screen.queryByTestId("file-tree")).not.toBeInTheDocument();
    expect(refreshFileTree).toHaveBeenCalledTimes(1);
    expect(refreshFileTree).toHaveBeenCalledWith(project.slug);
    expect(setFileTreeLoading).toHaveBeenCalledWith(true);

    await act(async () => {
      resolveRefresh();
    });

    await waitFor(() => {
      expect(setFileTreeLoading).toHaveBeenCalledWith(false);
    });
  });

  it("T8: ExplorerContent spinner is NOT rendered when only fileTreeRefreshing is true", () => {
    mockUseWorkspace.mockReturnValue(
      makeContext({
        fileTreeLoading: false,
        fileTreeRefreshing: true,
        fileTree: [{ name: "a", path: "a", type: "file" }],
      }),
    );

    render(<WorkspaceLayout project={project} />);

    // FileTree rendered (no spinner gating from refreshing flag).
    expect(screen.getByTestId("file-tree")).toBeInTheDocument();
  });

  it("Issue #81 T4/T5: wires EventSource hook and renders accessible sync status UI", () => {
    const retryFileTreeSync = vi.fn();
    const invalidateFileTreeScope = vi.fn().mockResolvedValue(undefined);
    const updateFileTreeSyncState = vi.fn();
    const setFileTreeSyncFallbackActive = vi.fn();

    mockUseWorkspace.mockReturnValue(
      makeContext({
        activeWorktree: ".trees/feat",
        fileTree: [{ name: "a", path: "a", type: "file" }],
        fileTreeSyncStatus: "degraded",
        fileTreeSyncError: {
          code: "WATCHER_ERROR",
          message: "File sync degraded — polling every 5 seconds.",
          retryable: true,
          pollIntervalMs: 5000,
        },
        retryFileTreeSync,
        invalidateFileTreeScope,
        updateFileTreeSyncState,
        setFileTreeSyncFallbackActive,
      }),
    );

    render(<WorkspaceLayout project={project} />);

    expect(mockUseFileTreeSync).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "demo",
        worktree: ".trees/feat",
        onChanged: invalidateFileTreeScope,
        onStatusChange: updateFileTreeSyncState,
        onFallbackChange: setFileTreeSyncFallbackActive,
      }),
    );
    const status = screen.getByRole("status", {
      name: "File sync degraded — polling every 5 seconds.",
    });
    expect(status).toHaveAttribute("aria-live", "polite");

    fireEvent.click(screen.getByRole("button", { name: "Retry file tree sync" }));
    expect(retryFileTreeSync).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["connecting", "File sync connecting…", null],
    ["ready", "File sync ready", null],
    ["syncing", "File sync applying changes…", null],
    [
      "error",
      "Invalid file sync parameters.",
      { code: "INVALID_PARAMETERS", message: "Invalid file sync parameters.", retryable: false },
    ],
    [
      "unauthorized",
      "File sync unauthorized — reopen DevDeck with a valid token.",
      { code: "AUTH_REQUIRED", message: "Unauthorized", retryable: false },
    ],
  ] as const)(
    "Issue #81 T5: renders %s sync status without retry when not retryable",
    (status, text, error) => {
      mockUseWorkspace.mockReturnValue(
        makeContext({
          fileTree: [{ name: "a", path: "a", type: "file" }],
          fileTreeSyncStatus: status,
          fileTreeSyncError: error,
        }),
      );

      render(<WorkspaceLayout project={project} />);

      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.getByText(text)).toHaveAttribute("role", "status");
      expect(
        screen.queryByRole("button", { name: "Retry file tree sync" }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("file-tree")).toBeInTheDocument();
    },
  );

  it("Issue #81 T6: does not run primary 5000 ms polling while SSE is ready", async () => {
    vi.useFakeTimers();
    const refreshFileTree = vi.fn().mockResolvedValue(undefined);

    mockUseWorkspace.mockReturnValue(
      makeContext({
        fileTreeSyncStatus: "ready",
        fileTreeSyncFallbackActive: false,
        refreshFileTree,
      }),
    );

    render(<WorkspaceLayout project={project} />);
    await act(async () => {});
    refreshFileTree.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(15000);
    });

    expect(refreshFileTree).not.toHaveBeenCalled();
  });

  it("Issue #81 T6: fallback polls the root file tree every 5000 ms without mutating fileTreeLoading", async () => {
    vi.useFakeTimers();
    const refreshFileTree = vi.fn().mockResolvedValue(undefined);
    const setFileTreeLoading = vi.fn();

    mockUseWorkspace.mockReturnValue(
      makeContext({
        fileTreeSyncStatus: "degraded",
        fileTreeSyncFallbackActive: true,
        refreshFileTree,
        setFileTreeLoading,
      }),
    );

    render(<WorkspaceLayout project={project} />);

    expect(refreshFileTree).toHaveBeenCalledWith(project.slug);
    await act(async () => {});
    refreshFileTree.mockClear();
    setFileTreeLoading.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(refreshFileTree).toHaveBeenCalledTimes(1);
    expect(refreshFileTree).toHaveBeenCalledWith(project.slug);
    expect(setFileTreeLoading).not.toHaveBeenCalled();
  });

  it("Issue #81 T6: pauses fallback polling while hidden and catches up immediately when visible", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const addListener = vi.spyOn(document, "addEventListener");
    const removeListener = vi.spyOn(document, "removeEventListener");
    const refreshFileTree = vi.fn().mockResolvedValue(undefined);

    mockUseWorkspace.mockReturnValue(
      makeContext({
        fileTreeSyncStatus: "degraded",
        fileTreeSyncFallbackActive: true,
        refreshFileTree,
      }),
    );

    const { unmount } = render(<WorkspaceLayout project={project} />);
    await act(async () => {});
    refreshFileTree.mockClear();

    visibility.mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    expect(refreshFileTree).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(refreshFileTree).toHaveBeenCalledTimes(1);
    expect(refreshFileTree).toHaveBeenCalledWith(project.slug);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(refreshFileTree).toHaveBeenCalledTimes(2);

    unmount();
    expect(addListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });

  it("Issue #81 T6: cleans up fallback polling on worktree changes, project changes, and unmount", async () => {
    vi.useFakeTimers();
    const refreshFileTree = vi.fn().mockResolvedValue(undefined);
    const setFileTreeLoading = vi.fn();

    mockUseWorkspace.mockReturnValue(
      makeContext({
        activeWorktree: null,
        fileTreeSyncStatus: "degraded",
        fileTreeSyncFallbackActive: true,
        refreshFileTree,
        setFileTreeLoading,
      }),
    );
    const { rerender, unmount } = render(<WorkspaceLayout project={project} />);
    await act(async () => {});

    mockUseWorkspace.mockReturnValue(
      makeContext({
        activeWorktree: ".trees/feat",
        fileTreeSyncStatus: "degraded",
        fileTreeSyncFallbackActive: true,
        refreshFileTree,
        setFileTreeLoading,
      }),
    );
    rerender(<WorkspaceLayout project={project} />);
    await act(async () => {});
    refreshFileTree.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(refreshFileTree).toHaveBeenCalledTimes(1);
    expect(refreshFileTree).toHaveBeenCalledWith(project.slug);

    const nextProject = makeProject({ slug: "other", name: "Other", path: "/other" });
    mockUseWorkspace.mockReturnValue(
      makeContext({
        activeWorktree: ".trees/feat",
        fileTreeSyncStatus: "degraded",
        fileTreeSyncFallbackActive: true,
        refreshFileTree,
        setFileTreeLoading,
      }),
    );
    rerender(<WorkspaceLayout project={nextProject} />);
    await act(async () => {});
    refreshFileTree.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(refreshFileTree).toHaveBeenCalledTimes(1);
    expect(refreshFileTree).toHaveBeenCalledWith("other");
    expect(refreshFileTree).not.toHaveBeenCalledWith(project.slug);

    unmount();
    refreshFileTree.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(refreshFileTree).not.toHaveBeenCalled();
  });

  it("Issue #81 T6: overlapping initial loads still use fallback refreshFileTree directly", async () => {
    vi.useFakeTimers();
    let resolveInitialRefresh: () => void = () => {};
    const refreshFileTree = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveInitialRefresh = resolve;
        }),
    );
    const setFileTreeLoading = vi.fn();

    mockUseWorkspace.mockReturnValue(
      makeContext({
        fileTreeSyncStatus: "degraded",
        fileTreeSyncFallbackActive: true,
        refreshFileTree,
        setFileTreeLoading,
      }),
    );

    render(<WorkspaceLayout project={project} />);
    expect(refreshFileTree).toHaveBeenCalledTimes(1);
    setFileTreeLoading.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(refreshFileTree).toHaveBeenCalledTimes(2);
    expect(refreshFileTree).toHaveBeenLastCalledWith(project.slug);
    expect(setFileTreeLoading).not.toHaveBeenCalled();

    await act(async () => {
      resolveInitialRefresh();
    });
  });

  it("does not render the worktree selector inside the file explorer", () => {
    mockUseWorkspace.mockReturnValue(makeContext());

    render(<WorkspaceLayout project={project} />);

    expect(screen.queryByTestId("worktree-tree")).not.toBeInTheDocument();
  });

  it("Issue #52: reloads the root file tree when activeWorktree changes", async () => {
    const refreshFileTree = vi.fn().mockResolvedValue(undefined);
    const setFileTreeLoading = vi.fn();

    mockUseWorkspace.mockReturnValue(
      makeContext({
        activeWorktree: null,
        refreshFileTree,
        setFileTreeLoading,
      }),
    );

    const { rerender } = render(<WorkspaceLayout project={project} />);

    await waitFor(() => {
      expect(refreshFileTree).toHaveBeenCalledTimes(1);
    });

    mockUseWorkspace.mockReturnValue(
      makeContext({
        activeWorktree: ".trees/feat",
        refreshFileTree,
        setFileTreeLoading,
      }),
    );
    rerender(<WorkspaceLayout project={project} />);

    await waitFor(() => {
      expect(refreshFileTree).toHaveBeenCalledTimes(2);
    });
    expect(refreshFileTree).toHaveBeenLastCalledWith(project.slug);
  });

  it("T2-layout-1: shows error+retry when root load fails and tree is empty", () => {
    mockUseWorkspace.mockReturnValue(
      makeContext({
        fileTreeLoading: false,
        fileTreeError: "HTTP 500",
        fileTree: [],
      }),
    );

    render(<WorkspaceLayout project={project} />);

    expect(screen.getByText("Failed to load files")).toBeInTheDocument();
    expect(screen.getByText("HTTP 500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry loading file tree" })).toBeInTheDocument();
    expect(screen.queryByTestId("file-tree")).not.toBeInTheDocument();
  });

  it("T2-layout-2: retry button triggers refreshFileTree", async () => {
    const refreshFileTree = vi.fn().mockResolvedValue(undefined);
    const setFileTreeLoading = vi.fn();

    mockUseWorkspace.mockReturnValue(
      makeContext({
        fileTreeLoading: false,
        fileTreeError: "HTTP 500",
        fileTree: [],
        refreshFileTree,
        setFileTreeLoading,
      }),
    );

    render(<WorkspaceLayout project={project} />);

    await act(async () => {
      screen.getByRole("button", { name: "Retry loading file tree" }).click();
    });

    expect(setFileTreeLoading).toHaveBeenCalledWith(true);
    expect(refreshFileTree).toHaveBeenCalledWith(project.slug);
  });

  it("T2-layout-3: shows spinner during loading, hides error UI", () => {
    mockUseWorkspace.mockReturnValue(
      makeContext({
        fileTreeLoading: true,
        fileTreeError: "HTTP 500",
        fileTree: [],
      }),
    );

    render(<WorkspaceLayout project={project} />);

    expect(screen.queryByText("Failed to load files")).not.toBeInTheDocument();
    expect(screen.queryByTestId("file-tree")).not.toBeInTheDocument();
  });

  it("T2-layout-4: shows file tree on success, no error UI", () => {
    mockUseWorkspace.mockReturnValue(
      makeContext({
        fileTreeLoading: false,
        fileTreeError: null,
        fileTree: [{ name: "a", path: "a", type: "file" }],
      }),
    );

    render(<WorkspaceLayout project={project} />);

    expect(screen.getByTestId("file-tree")).toBeInTheDocument();
    expect(screen.queryByText("Failed to load files")).not.toBeInTheDocument();
  });

  it("T2-layout-5: shows file tree when there are nodes even if error exists", () => {
    mockUseWorkspace.mockReturnValue(
      makeContext({
        fileTreeLoading: false,
        fileTreeError: "HTTP 500",
        fileTree: [{ name: "a", path: "a", type: "file" }],
      }),
    );

    render(<WorkspaceLayout project={project} />);

    expect(screen.getByTestId("file-tree")).toBeInTheDocument();
    expect(screen.queryByText("Failed to load files")).not.toBeInTheDocument();
  });

  it("T9: TerminalPanel stays mounted when showTerminal toggles off and back on", () => {
    const ctx = makeContext({ showTerminal: true });
    mockUseWorkspace.mockReturnValue(ctx);

    const { rerender } = render(<WorkspaceLayout project={project} />);
    expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();

    // Toggle terminal off
    mockUseWorkspace.mockReturnValue(makeContext({ showTerminal: false }));
    rerender(<WorkspaceLayout project={project} />);

    // TerminalPanel should still be in the DOM (collapsed, not unmounted)
    expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();

    // Toggle terminal back on
    mockUseWorkspace.mockReturnValue(makeContext({ showTerminal: true }));
    rerender(<WorkspaceLayout project={project} />);

    expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();
  });

  it("Issue #67: workspace terminal layout chain remains bounded while terminal stays mounted", () => {
    mockUseWorkspace.mockReturnValue(makeContext({ showTerminal: true }));

    const { container, rerender } = render(<WorkspaceLayout project={project} />);

    expect(container.firstElementChild).toHaveClass("min-h-0", "min-w-0", "overflow-hidden");
    expect(screen.getByTestId("panel-group")).toHaveClass("min-h-0", "min-w-0", "overflow-hidden");
    expect(screen.getByTestId("panel-2")).toHaveClass("min-h-0", "min-w-0", "overflow-hidden");
    expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();

    mockUseWorkspace.mockReturnValue(makeContext({ showTerminal: false }));
    rerender(<WorkspaceLayout project={project} />);

    expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();
    expect(panelMockState.panelHandles[2].collapse).toHaveBeenCalled();
  });

  it("T10: FileViewer stays mounted when showFileViewer toggles off and back on", () => {
    mockUseWorkspace.mockReturnValue(makeContext({ showFileViewer: true }));

    const { rerender } = render(<WorkspaceLayout project={project} />);
    expect(screen.getByTestId("file-viewer")).toBeInTheDocument();

    // Toggle file viewer off
    mockUseWorkspace.mockReturnValue(makeContext({ showFileViewer: false }));
    rerender(<WorkspaceLayout project={project} />);

    // FileViewer should still be in the DOM (collapsed, not unmounted)
    expect(screen.getByTestId("file-viewer")).toBeInTheDocument();

    // Toggle file viewer back on
    mockUseWorkspace.mockReturnValue(makeContext({ showFileViewer: true }));
    rerender(<WorkspaceLayout project={project} />);

    expect(screen.getByTestId("file-viewer")).toBeInTheDocument();
  });

  it("Issue #59: renders Explorer toggle before File Preview and Terminal", () => {
    mockUseWorkspace.mockReturnValue(makeContext());

    render(<WorkspaceLayout project={project} />);

    const toggleNames = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"))
      .filter(
        (name) =>
          name?.includes("Explorer") ||
          name?.includes("File Preview") ||
          name?.includes("Terminal"),
      );

    expect(toggleNames).toEqual(["Hide Explorer", "Hide File Preview", "Hide Terminal"]);
  });

  it("82-T1: renders a visible close project action with accessible semantics", () => {
    mockUseWorkspace.mockReturnValue(makeContext());

    render(<WorkspaceLayout project={project} />);

    const closeButton = screen.getByRole("button", { name: "Close project Demo" });
    expect(closeButton).toBeInTheDocument();
    expect(closeButton).toBeVisible();
    expect(closeButton).toHaveAttribute("type", "button");
    expect(closeButton).toHaveAttribute("title", "Close project Demo");
    expect(closeButton).not.toHaveAttribute("aria-pressed");
    expect(closeButton.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("82-T2: preserves panel toggle order and pressed semantics", () => {
    mockUseWorkspace.mockReturnValue(makeContext());

    const { container } = render(<WorkspaceLayout project={project} />);

    const panelToggleLabels = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"))
      .filter(
        (label) =>
          label?.includes("Explorer") ||
          label?.includes("File Preview") ||
          label?.includes("Terminal"),
      );

    expect(panelToggleLabels).toEqual(["Hide Explorer", "Hide File Preview", "Hide Terminal"]);
    expect(
      screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Hide Explorer", "Hide File Preview", "Hide Terminal", "Close project Demo"]);
    expect(screen.getByRole("button", { name: "Hide Explorer" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Hide File Preview" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Hide Terminal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Close project Demo" })).not.toHaveAttribute(
      "aria-pressed",
    );

    const divider = container.querySelector('div[aria-hidden="true"].mx-1.h-4.w-px.bg-border');
    expect(divider).toBeInTheDocument();
  });

  it("82-T2b: falls back to the normalized slug when the project name is blank", () => {
    mockUseWorkspace.mockReturnValue(makeContext());

    render(<WorkspaceLayout project={makeProject({ name: "  ", slug: "demo" })} />);

    const closeButton = screen.getByRole("button", { name: "Close project demo" });
    expect(closeButton).toHaveAttribute("title", "Close project demo");
  });

  it("82-T2c: disables the close action when the normalized slug is empty", async () => {
    const user = userEvent.setup();
    mockUseWorkspace.mockReturnValue(makeContext());

    render(<WorkspaceLayout project={makeProject({ name: "Whitespace", slug: "   " })} />);

    const closeButton = screen.getByRole("button", { name: "Close project Whitespace" });
    expect(closeButton).toHaveAttribute("aria-disabled", "true");
    expect(closeButton).toHaveAttribute("tabIndex", "-1");

    await user.click(closeButton);

    expect(openProjectsMockState.requestProjectClose).not.toHaveBeenCalled();
    expect(openProjectsMockState.closeProject).not.toHaveBeenCalled();
    expect(routerMockState.push).not.toHaveBeenCalled();
  });

  it("82-T3: close project action navigates to the adjacent open project", async () => {
    const user = userEvent.setup();
    openProjectsMockState.openProjects = [
      makeProject({ slug: "alpha", name: "Alpha", path: "/alpha" }),
      project,
      makeProject({ slug: "beta", name: "Beta", path: "/beta" }),
    ];
    mockUseWorkspace.mockReturnValue(makeContext());

    render(<WorkspaceLayout project={project} />);

    await user.click(screen.getByRole("button", { name: "Close project Demo" }));

    expect(openProjectsMockState.requestProjectClose).toHaveBeenCalledWith("demo", "demo");
    expect(openProjectsMockState.closeProject).toHaveBeenCalledTimes(1);
    expect(openProjectsMockState.closeProject).toHaveBeenCalledWith("demo");
    expect(routerMockState.push).toHaveBeenCalledTimes(1);
    expect(routerMockState.push).toHaveBeenCalledWith("/project/beta");
  });

  it("82-T4: close project action navigates home for the final open project", async () => {
    const user = userEvent.setup();
    openProjectsMockState.openProjects = [project];
    mockUseWorkspace.mockReturnValue(makeContext());

    render(<WorkspaceLayout project={project} />);

    await user.click(screen.getByRole("button", { name: "Close project Demo" }));

    expect(openProjectsMockState.requestProjectClose).toHaveBeenCalledWith("demo", "demo");
    expect(openProjectsMockState.closeProject).toHaveBeenCalledTimes(1);
    expect(openProjectsMockState.closeProject).toHaveBeenCalledWith("demo");
    expect(routerMockState.push).toHaveBeenCalledTimes(1);
    expect(routerMockState.push).toHaveBeenCalledWith("/");
  });

  it("82-T5: clears pending close state when navigation throws", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    openProjectsMockState.requestProjectClose.mockReturnValue({
      accepted: true,
      target: "/project/beta",
    });
    routerMockState.push.mockImplementationOnce(() => {
      throw new Error("mock navigation failure");
    });
    mockUseWorkspace.mockReturnValue(makeContext());

    try {
      render(<WorkspaceLayout project={project} />);

      await user.click(screen.getByRole("button", { name: "Close project Demo" }));

      expect(openProjectsMockState.clearProjectCloseRequest).toHaveBeenCalledWith("demo");
      expect(consoleError).toHaveBeenCalledWith("Failed to navigate after closing project", {
        slug: "demo",
        target: "/project/beta",
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("Issue #59: Explorer remains mounted while hidden and uses collapsible zero-size panel behavior", () => {
    mockUseWorkspace.mockReturnValue(makeContext({ showExplorer: true }));

    const { rerender } = render(<WorkspaceLayout project={project} />);

    expect(screen.getByTestId("file-tree")).toBeInTheDocument();
    expect(screen.getByTestId("panel-0")).toHaveAttribute("data-collapsible", "true");
    expect(screen.getByTestId("panel-0")).toHaveAttribute("data-collapsed-size", "0");
    expect(panelMockState.panelHandles[0].expand).toHaveBeenCalled();

    mockUseWorkspace.mockReturnValue(makeContext({ showExplorer: false }));
    rerender(<WorkspaceLayout project={project} />);

    expect(screen.getByTestId("file-tree")).toBeInTheDocument();
    expect(panelMockState.panelHandles[0].collapse).toHaveBeenCalled();

    mockUseWorkspace.mockReturnValue(makeContext({ showExplorer: true }));
    rerender(<WorkspaceLayout project={project} />);

    expect(panelMockState.panelHandles[0].expand).toHaveBeenCalledTimes(2);
  });

  it("Issue #59: separators are visible only between adjacent expanded panels", () => {
    const renderState = (state: {
      showExplorer: boolean;
      showFileViewer: boolean;
      showTerminal: boolean;
    }) => {
      mockUseWorkspace.mockReturnValue(makeContext(state));
    };
    const expectSeparator = (index: 0 | 1, visible: boolean) => {
      const separator = screen.getByTestId(`separator-${index}`);
      if (visible) {
        expect(separator).not.toHaveClass("hidden");
        expect(separator).toHaveAttribute("data-disabled", "false");
      } else {
        expect(separator).toHaveClass("hidden");
        expect(separator).toHaveAttribute("data-disabled", "true");
      }
    };

    renderState({ showExplorer: true, showFileViewer: true, showTerminal: true });

    const { rerender } = render(<WorkspaceLayout project={project} />);

    expectSeparator(0, true);
    expectSeparator(1, true);

    renderState({ showExplorer: false, showFileViewer: true, showTerminal: true });
    rerender(<WorkspaceLayout project={project} />);
    expectSeparator(0, false);
    expectSeparator(1, true);

    renderState({ showExplorer: true, showFileViewer: false, showTerminal: true });
    rerender(<WorkspaceLayout project={project} />);
    expectSeparator(0, false);
    expectSeparator(1, true);

    renderState({ showExplorer: true, showFileViewer: true, showTerminal: false });
    rerender(<WorkspaceLayout project={project} />);
    expectSeparator(0, true);
    expectSeparator(1, false);

    renderState({ showExplorer: false, showFileViewer: false, showTerminal: true });
    rerender(<WorkspaceLayout project={project} />);
    expectSeparator(0, false);
    expectSeparator(1, false);
  });

  it("Issue #69: keeps the terminal separator active after hiding File Preview before Explorer", () => {
    const renderState = (state: {
      showExplorer: boolean;
      showFileViewer: boolean;
      showTerminal: boolean;
    }) => {
      mockUseWorkspace.mockReturnValue(makeContext(state));
    };
    const expectSeparator = (index: 0 | 1, visible: boolean) => {
      const separator = screen.getByTestId(`separator-${index}`);
      if (visible) {
        expect(separator).not.toHaveClass("hidden");
        expect(separator).toHaveAttribute("data-disabled", "false");
      } else {
        expect(separator).toHaveClass("hidden");
        expect(separator).toHaveAttribute("data-disabled", "true");
      }
    };

    renderState({ showExplorer: true, showFileViewer: true, showTerminal: true });

    const { rerender } = render(<WorkspaceLayout project={project} />);

    expect(screen.getByTestId("file-tree")).toBeInTheDocument();
    expect(screen.getByTestId("file-viewer")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();
    expectSeparator(0, true);
    expectSeparator(1, true);

    renderState({ showExplorer: true, showFileViewer: false, showTerminal: true });
    rerender(<WorkspaceLayout project={project} />);

    expect(screen.getByTestId("file-viewer")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();
    expect(panelMockState.panelHandles[1].collapse).toHaveBeenCalled();
    expect(panelMockState.panelHandles[0].expand).toHaveBeenCalled();
    expect(panelMockState.panelHandles[2].expand).toHaveBeenCalled();
    expectSeparator(0, false);
    expectSeparator(1, true);

    renderState({ showExplorer: false, showFileViewer: false, showTerminal: true });
    rerender(<WorkspaceLayout project={project} />);

    expect(screen.getByTestId("file-tree")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();
    expect(panelMockState.panelHandles[0].collapse).toHaveBeenCalled();
    expect(panelMockState.panelHandles[2].expand).toHaveBeenCalled();
    expectSeparator(0, false);
    expectSeparator(1, false);
  });

  it.each([
    {
      label: "Explorer",
      state: { showExplorer: true, showFileViewer: false, showTerminal: false },
      handler: "toggleExplorer",
    },
    {
      label: "File Preview",
      state: { showExplorer: false, showFileViewer: true, showTerminal: false },
      handler: "toggleFileViewer",
    },
    {
      label: "Terminal",
      state: { showExplorer: false, showFileViewer: false, showTerminal: true },
      handler: "toggleTerminal",
    },
  ] as const)(
    "Issue #59: last-panel guard blocks hiding $label without native disabled",
    ({ label, state, handler }) => {
      const toggleHandler = vi.fn();
      mockUseWorkspace.mockReturnValue(makeContext({ ...state, [handler]: toggleHandler }));

      render(<WorkspaceLayout project={project} />);

      const button = screen.getByRole("button", { name: `Hide ${label}` });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAttribute("tabindex", "-1");
      expect(button).toHaveAttribute("aria-pressed", "true");
      expect(button).toHaveClass("opacity-50");
      expect(button).not.toHaveAttribute("disabled");

      fireEvent.click(button);
      expect(toggleHandler).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      label: "Explorer",
      state: { showExplorer: true, showFileViewer: false, showTerminal: false },
      panelIndex: 0,
    },
    {
      label: "File Preview",
      state: { showExplorer: false, showFileViewer: true, showTerminal: false },
      panelIndex: 1,
    },
    {
      label: "Terminal",
      state: { showExplorer: false, showFileViewer: false, showTerminal: true },
      panelIndex: 2,
    },
  ] as const)("Issue #69: single visible $label resizes to 100%", ({ state, panelIndex }) => {
    mockUseWorkspace.mockReturnValue(makeContext(state));

    render(<WorkspaceLayout project={project} />);

    panelMockState.panelHandles.forEach((handle, index) => {
      if (index === panelIndex) {
        expect(handle.resize).toHaveBeenCalledWith("100%");
      } else {
        expect(handle.resize).not.toHaveBeenCalled();
      }
    });
  });

  it.each([
    { showExplorer: true, showFileViewer: true, showTerminal: true },
    { showExplorer: true, showFileViewer: true, showTerminal: false },
    { showExplorer: true, showFileViewer: false, showTerminal: true },
    { showExplorer: false, showFileViewer: true, showTerminal: true },
  ])("Issue #69: multi-panel states do not force resize normalization", (state) => {
    mockUseWorkspace.mockReturnValue(makeContext(state));

    render(<WorkspaceLayout project={project} />);

    panelMockState.panelHandles.forEach((handle) => {
      expect(handle.resize).not.toHaveBeenCalled();
    });
  });

  it.each([
    {
      label: "File Preview then Explorer",
      steps: [
        { showExplorer: true, showFileViewer: false, showTerminal: true },
        { showExplorer: false, showFileViewer: false, showTerminal: true },
      ],
    },
    {
      label: "Explorer then File Preview",
      steps: [
        { showExplorer: false, showFileViewer: true, showTerminal: true },
        { showExplorer: false, showFileViewer: false, showTerminal: true },
      ],
    },
  ] as const)("Issue #69: reported order $label leaves Terminal resized to 100%", ({ steps }) => {
    mockUseWorkspace.mockReturnValue(makeContext());
    const { rerender } = render(<WorkspaceLayout project={project} />);
    panelMockState.panelHandles.forEach((handle) => handle.resize.mockClear());

    mockUseWorkspace.mockReturnValue(makeContext(steps[0]));
    rerender(<WorkspaceLayout project={project} />);
    expect(panelMockState.panelHandles[2].resize).not.toHaveBeenCalled();

    mockUseWorkspace.mockReturnValue(makeContext(steps[1]));
    rerender(<WorkspaceLayout project={project} />);

    expect(screen.getByTestId("terminal-panel")).toBeInTheDocument();
    expect(panelMockState.panelHandles[2].resize).toHaveBeenCalledWith("100%");
  });

  it.each([
    {
      label: "Explorer after File Preview then Terminal",
      steps: [
        { showExplorer: true, showFileViewer: false, showTerminal: true },
        { showExplorer: true, showFileViewer: false, showTerminal: false },
      ],
      panelIndex: 0,
    },
    {
      label: "Explorer after Terminal then File Preview",
      steps: [
        { showExplorer: true, showFileViewer: true, showTerminal: false },
        { showExplorer: true, showFileViewer: false, showTerminal: false },
      ],
      panelIndex: 0,
    },
    {
      label: "File Preview after Explorer then Terminal",
      steps: [
        { showExplorer: false, showFileViewer: true, showTerminal: true },
        { showExplorer: false, showFileViewer: true, showTerminal: false },
      ],
      panelIndex: 1,
    },
    {
      label: "File Preview after Terminal then Explorer",
      steps: [
        { showExplorer: true, showFileViewer: true, showTerminal: false },
        { showExplorer: false, showFileViewer: true, showTerminal: false },
      ],
      panelIndex: 1,
    },
    {
      label: "Terminal after Explorer then File Preview",
      steps: [
        { showExplorer: false, showFileViewer: true, showTerminal: true },
        { showExplorer: false, showFileViewer: false, showTerminal: true },
      ],
      panelIndex: 2,
    },
    {
      label: "Terminal after File Preview then Explorer",
      steps: [
        { showExplorer: true, showFileViewer: false, showTerminal: true },
        { showExplorer: false, showFileViewer: false, showTerminal: true },
      ],
      panelIndex: 2,
    },
  ] as const)(
    "Issue #69: ordered two-step transition leaving only $label resizes remaining panel",
    ({ steps, panelIndex }) => {
      mockUseWorkspace.mockReturnValue(makeContext());
      const { rerender } = render(<WorkspaceLayout project={project} />);
      panelMockState.panelHandles.forEach((handle) => handle.resize.mockClear());

      for (const step of steps) {
        mockUseWorkspace.mockReturnValue(makeContext(step));
        rerender(<WorkspaceLayout project={project} />);
      }

      expect(panelMockState.panelHandles[panelIndex].resize).toHaveBeenCalledWith("100%");
    },
  );

  it("Issue #69: project slug and active worktree changes retrigger single-panel normalization", () => {
    const singleTerminal = {
      showExplorer: false,
      showFileViewer: false,
      showTerminal: true,
    };
    mockUseWorkspace.mockReturnValue(makeContext(singleTerminal));
    const { rerender } = render(<WorkspaceLayout project={project} />);

    expect(panelMockState.panelHandles[2].resize).toHaveBeenCalledTimes(1);

    rerender(<WorkspaceLayout project={{ ...project, slug: "demo-2" }} />);
    expect(panelMockState.panelHandles[2].resize).toHaveBeenCalledTimes(2);

    mockUseWorkspace.mockReturnValue(
      makeContext({ ...singleTerminal, activeWorktree: ".trees/feat" }),
    );
    rerender(<WorkspaceLayout project={{ ...project, slug: "demo-2" }} />);
    expect(panelMockState.panelHandles[2].resize).toHaveBeenCalledTimes(3);
  });

  it("Issue #69: rapid visibility sequence settles to the final single-panel resize", () => {
    mockUseWorkspace.mockReturnValue(makeContext());
    const { rerender } = render(<WorkspaceLayout project={project} />);
    panelMockState.panelHandles.forEach((handle) => handle.resize.mockClear());

    for (const state of [
      { showExplorer: true, showFileViewer: false, showTerminal: true },
      { showExplorer: false, showFileViewer: true, showTerminal: true },
      { showExplorer: false, showFileViewer: false, showTerminal: true },
    ]) {
      mockUseWorkspace.mockReturnValue(makeContext(state));
      rerender(<WorkspaceLayout project={project} />);
    }

    expect(panelMockState.panelHandles[0].resize).not.toHaveBeenCalled();
    expect(panelMockState.panelHandles[1].resize).not.toHaveBeenCalled();
    expect(panelMockState.panelHandles[2].resize).toHaveBeenCalledWith("100%");
  });

  it("Issue #59: PanelToggle exposes aria-label and aria-pressed for visible and hidden panels", () => {
    mockUseWorkspace.mockReturnValue(
      makeContext({ showExplorer: true, showFileViewer: false, showTerminal: true }),
    );

    render(<WorkspaceLayout project={project} />);

    expect(screen.getByRole("button", { name: "Hide Explorer" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Show File Preview" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Hide Terminal" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("T22: file explorer renders FileTree without the project-panel WorktreeTree", () => {
    mockUseWorkspace.mockReturnValue(
      makeContext({
        fileTreeLoading: false,
        fileTree: [{ name: "a", path: "a", type: "file" }],
      }),
    );

    render(<WorkspaceLayout project={project} />);

    const fileTree = screen.getByTestId("file-tree");
    expect(fileTree).toBeInTheDocument();
    expect(screen.queryByTestId("worktree-tree")).not.toBeInTheDocument();
  });

  it("T23: terminal receives worktree prop when activeWorktree is set", () => {
    mockUseWorkspace.mockReturnValue(
      makeContext({
        activeWorktree: ".trees/feat",
      }),
    );

    render(<WorkspaceLayout project={project} />);

    const terminal = screen.getByTestId("terminal-panel");
    expect(terminal).toHaveAttribute("data-worktree", ".trees/feat");
  });

  it("T23: terminal receives empty worktree when activeWorktree is null", () => {
    mockUseWorkspace.mockReturnValue(
      makeContext({
        activeWorktree: null,
      }),
    );

    render(<WorkspaceLayout project={project} />);

    const terminal = screen.getByTestId("terminal-panel");
    expect(terminal).toHaveAttribute("data-worktree", "");
  });
});
