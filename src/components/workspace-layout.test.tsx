import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Project } from "@/lib/types";

const mockUseWorkspace = vi.fn();
const mockUseFileTreeSync = vi.fn();
const mockUseOpenProjects = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/workspace-context", () => ({ useWorkspace: () => mockUseWorkspace() }));
vi.mock("@/hooks/use-file-tree-sync", () => ({
  useFileTreeSync: (options: unknown) => mockUseFileTreeSync(options),
}));
vi.mock("@/lib/open-projects-context", () => ({ useOpenProjects: () => mockUseOpenProjects() }));
vi.mock("@/components/file-tree", () => ({ FileTree: () => <div data-testid="file-tree" /> }));
vi.mock("@/components/file-viewer", () => ({ default: () => <div data-testid="file-viewer" /> }));
vi.mock("@/components/terminal-panel", () => ({
  TerminalPanel: (props: Record<string, unknown>) => (
    <div data-testid="terminal-panel" data-props={JSON.stringify(props)} />
  ),
}));
vi.mock("@/components/error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => null,
}));

import { WorkspaceLayout } from "./workspace-layout";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    slug: "demo",
    name: "Demo",
    path: "/workspace/demo",
    ...overrides,
  } as Project;
}

describe("WorkspaceLayout terminal decoupling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorkspace.mockReturnValue({
      setProject: vi.fn(),
      fileTree: [],
      fileTreeLoading: false,
      fileTreeError: null,
      setFileTreeLoading: vi.fn(),
      refreshFileTree: vi.fn(),
      showExplorer: true,
      showFileViewer: true,
      showTerminal: true,
      toggleExplorer: vi.fn(),
      toggleFileViewer: vi.fn(),
      toggleTerminal: vi.fn(),
      activeWorktree: ".trees/feat",
      activeWorkspaceContextId: "root",
      fileTreeSyncStatus: "ready",
      fileTreeSyncError: null,
      fileTreeSyncFallbackActive: false,
      fileTreeSyncRetryNonce: 0,
      retryFileTreeSync: vi.fn(),
      refreshFileTreeScope: vi.fn(),
      invalidateFileTreeScope: vi.fn(),
      updateFileTreeSyncState: vi.fn(),
      setFileTreeSyncFallbackActive: vi.fn(),
    });
    mockUseOpenProjects.mockReturnValue({
      requestProjectClose: vi.fn(),
      clearProjectCloseRequest: vi.fn(),
    });
  });

  it("passes project-scoped terminal context to the terminal panel", () => {
    render(<WorkspaceLayout project={makeProject()} />);

    const terminal = screen.getByTestId("terminal-panel");
    const props = JSON.parse(terminal.getAttribute("data-props") ?? "{}");
    expect(props).toEqual({
      projectSlug: "demo",
      workspaceContextId: "root",
    });
    expect(mockUseFileTreeSync).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "demo",
        worktree: ".trees/feat",
        workspaceContext: "root",
      }),
    );
  });
});
