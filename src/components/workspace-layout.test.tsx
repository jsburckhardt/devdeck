import type React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

const panelMockState = vi.hoisted(() => ({
  panelHandles: [] as Array<{
    collapse: ReturnType<typeof vi.fn>;
    expand: ReturnType<typeof vi.fn>;
    isCollapsed: ReturnType<typeof vi.fn>;
    getSize: ReturnType<typeof vi.fn>;
  }>,
  panelIndex: 0,
  separatorIndex: 0,
}));

vi.mock("@/lib/workspace-context", () => ({
  useWorkspace: vi.fn(),
}));

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
  Group: ({ children }: React.PropsWithChildren) => {
    panelMockState.panelIndex = 0;
    panelMockState.separatorIndex = 0;
    return <div>{children}</div>;
  },
  Panel: ({
    children,
    panelRef,
    collapsible,
    collapsedSize,
  }: React.PropsWithChildren<{
    panelRef?: React.Ref<unknown>;
    collapsible?: boolean;
    collapsedSize?: number;
  }>) => {
    const index = panelMockState.panelIndex++;
    const handle =
      panelMockState.panelHandles[index] ??
      (panelMockState.panelHandles[index] = {
        collapse: vi.fn(),
        expand: vi.fn(),
        isCollapsed: vi.fn(() => false),
        getSize: vi.fn(() => ({ asPercentage: 50, inPixels: 500 })),
      });

    if (panelRef && typeof panelRef === "object" && panelRef !== null) {
      (panelRef as React.MutableRefObject<unknown>).current = handle;
    }
    return (
      <div
        data-testid={`panel-${index}`}
        data-collapsible={String(Boolean(collapsible))}
        data-collapsed-size={String(collapsedSize ?? "")}
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
import { WorkspaceLayout } from "./workspace-layout";

const mockUseWorkspace = vi.mocked(useWorkspace);

const project = {
  slug: "demo",
  name: "Demo",
  path: "/demo",
  description: "",
  source: "auto" as const,
};

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
  panelMockState.panelHandles = [];
  panelMockState.panelIndex = 0;
  panelMockState.separatorIndex = 0;
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
    mockUseWorkspace.mockReturnValue(
      makeContext({ showExplorer: true, showFileViewer: true, showTerminal: true }),
    );

    const { rerender } = render(<WorkspaceLayout project={project} />);

    expect(screen.getByTestId("separator-0")).not.toHaveClass("hidden");
    expect(screen.getByTestId("separator-0")).toHaveAttribute("data-disabled", "false");
    expect(screen.getByTestId("separator-1")).not.toHaveClass("hidden");
    expect(screen.getByTestId("separator-1")).toHaveAttribute("data-disabled", "false");

    mockUseWorkspace.mockReturnValue(
      makeContext({ showExplorer: false, showFileViewer: true, showTerminal: true }),
    );
    rerender(<WorkspaceLayout project={project} />);
    expect(screen.getByTestId("separator-0")).toHaveClass("hidden");
    expect(screen.getByTestId("separator-0")).toHaveAttribute("data-disabled", "true");
    expect(screen.getByTestId("separator-1")).not.toHaveClass("hidden");

    mockUseWorkspace.mockReturnValue(
      makeContext({ showExplorer: true, showFileViewer: false, showTerminal: true }),
    );
    rerender(<WorkspaceLayout project={project} />);
    expect(screen.getByTestId("separator-0")).toHaveClass("hidden");
    expect(screen.getByTestId("separator-1")).toHaveClass("hidden");

    mockUseWorkspace.mockReturnValue(
      makeContext({ showExplorer: true, showFileViewer: true, showTerminal: false }),
    );
    rerender(<WorkspaceLayout project={project} />);
    expect(screen.getByTestId("separator-0")).not.toHaveClass("hidden");
    expect(screen.getByTestId("separator-1")).toHaveClass("hidden");
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
