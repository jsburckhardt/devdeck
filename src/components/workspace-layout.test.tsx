import type React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

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
  TerminalPanel: () => <div data-testid="terminal-panel" />,
}));

vi.mock("@/components/file-viewer", () => ({
  default: () => <div data-testid="file-viewer" />,
}));

vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Panel: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Separator: () => <div />,
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
    showFileViewer: true,
    showTerminal: true,
    fileTree: [],
    fileTreeLoading: false,
    fileTreeError: null,
    fileTreeRefreshing: false,
    setProject: vi.fn(),
    selectFile: vi.fn(),
    toggleFolder: vi.fn(),
    toggleFileViewer: vi.fn(),
    toggleTerminal: vi.fn(),
    setFileTree: vi.fn(),
    setFileTreeLoading: vi.fn(),
    refreshFileTree: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ReturnType<typeof useWorkspace>;
}

beforeEach(() => {
  vi.clearAllMocks();
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
});
