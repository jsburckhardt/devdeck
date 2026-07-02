import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorktreeTree } from "./worktree-tree";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
  },
}));

const mockRefresh = vi.fn();
const mockSetActiveWorktree = vi.fn();
const mockSetActiveWorkspaceContext = vi.fn();
const mockToggleWorktreesSection = vi.fn();

let mockWorktrees: { name: string; branch: string }[] = [];
let mockChoices: unknown[] = [];
let mockResponse: unknown = null;
let mockLoading = false;
let mockError: string | null = null;
let mockActiveWorktree: string | null = null;
let mockActiveWorkspaceContextId = "root";
let mockActiveWorkspaceContextStatus = "active";
let mockCollapsed = false;
let mockFallbackActive = false;
const mockUseWorktrees = vi.fn(() => ({
  worktrees: mockWorktrees,
  choices: mockChoices,
  response: mockResponse,
  loading: mockLoading,
  error: mockError,
  refresh: mockRefresh,
}));

vi.mock("@/hooks/use-worktrees", () => ({
  useWorktrees: (slug: string | undefined, options?: { pollingEnabled?: boolean }) =>
    mockUseWorktrees(slug, options),
}));

vi.mock("@/lib/workspace-context", () => ({
  useWorkspace: () => ({
    activeWorktree: mockActiveWorktree,
    activeWorkspaceContextId: mockActiveWorkspaceContextId,
    activeWorkspaceContextStatus: mockActiveWorkspaceContextStatus,
    fileTreeSyncFallbackActive: mockFallbackActive,
    worktreesSectionCollapsed: mockCollapsed,
    setActiveWorkspaceContext: mockSetActiveWorkspaceContext,
    setActiveWorktree: mockSetActiveWorktree,
    toggleWorktreesSection: mockToggleWorktreesSection,
  }),
}));

describe("WorktreeTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorktrees = [];
    mockChoices = [];
    mockResponse = null;
    mockLoading = false;
    mockError = null;
    mockActiveWorktree = null;
    mockActiveWorkspaceContextId = "root";
    mockActiveWorkspaceContextStatus = "active";
    mockCollapsed = false;
    mockFallbackActive = false;
  });

  it("T18: renders worktree list with names and branches", () => {
    mockWorktrees = [
      { name: "feat-login", branch: "feat-login" },
      { name: "fix-bug", branch: "fix/bug-123" },
    ];

    render(<WorktreeTree slug="demo" />);

    expect(screen.getByText("feat-login")).toBeInTheDocument();
    expect(mockUseWorktrees).toHaveBeenCalledWith("demo", { pollingEnabled: false });
    expect(screen.getByText("fix-bug")).toBeInTheDocument();
    // Branch shown only when different from name
    expect(screen.getByText("fix/bug-123")).toBeInTheDocument();
    expect(screen.getByText("Worktrees")).toBeInTheDocument();
  });

  it("Issue #81 T6: enables worktree list polling only during degraded fallback", () => {
    mockFallbackActive = true;
    mockWorktrees = [{ name: "feat", branch: "feat" }];

    render(<WorktreeTree slug="demo" />);

    expect(mockUseWorktrees).toHaveBeenCalledWith("demo", { pollingEnabled: true });
  });

  it("T19: clicking worktree calls setActiveWorktree", async () => {
    const user = userEvent.setup();
    mockWorktrees = [{ name: "feat", branch: "feat" }];

    render(<WorktreeTree slug="demo" />);

    await user.click(screen.getByRole("button", { name: "Switch to worktree feat" }));
    expect(mockSetActiveWorktree).toHaveBeenCalledWith(".trees/feat");
  });

  it("T19: clicking project root calls setActiveWorktree(null)", async () => {
    const user = userEvent.setup();
    mockWorktrees = [{ name: "feat", branch: "feat" }];

    render(<WorktreeTree slug="demo" />);

    await user.click(screen.getByRole("button", { name: "Switch to project root" }));
    expect(mockSetActiveWorktree).toHaveBeenCalledWith(null);
  });

  it("active worktree is highlighted with aria-current", () => {
    mockWorktrees = [{ name: "feat", branch: "feat" }];
    mockActiveWorktree = ".trees/feat";

    render(<WorktreeTree slug="demo" />);

    const worktreeButton = screen.getByRole("button", { name: "Switch to worktree feat" });
    expect(worktreeButton).toHaveAttribute("aria-current", "true");
  });

  it("resets a missing persisted active worktree to project root with a non-fatal notice", () => {
    mockWorktrees = [{ name: "feat", branch: "feat" }];
    mockActiveWorktree = ".trees/deleted";

    render(<WorktreeTree slug="demo" />);

    expect(mockSetActiveWorktree).toHaveBeenCalledWith(null);
    expect(toast.warning).toHaveBeenCalledWith(
      "Worktree no longer exists; showing project root instead.",
    );
  });

  it("does not reset active worktree while worktree refresh is loading", () => {
    mockLoading = true;
    mockActiveWorktree = ".trees/deleted";

    render(<WorktreeTree slug="demo" />);

    expect(mockSetActiveWorktree).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("shows a blocked stale context instead of falling back to project root", () => {
    mockChoices = [
      {
        id: "root",
        label: "Project root",
        kind: "root",
        status: "active",
        available: true,
        disabled: false,
      },
    ];
    mockActiveWorkspaceContextId = "wt_missing";

    render(<WorktreeTree slug="demo" />);

    expect(screen.getByText("Unavailable workspace")).toBeInTheDocument();
    expect(screen.getByText("Selected workspace is no longer available.")).toBeInTheDocument();
    expect(
      screen.queryByText("Project root", { selector: ".font-medium" }),
    ).not.toBeInTheDocument();
  });

  it("renders nested worktree names as selector-style filesystem nodes", () => {
    mockWorktrees = [{ name: "feature/login", branch: "feature/login" }];

    render(<WorktreeTree slug="demo" />);

    const node = screen.getByRole("button", { name: "Switch to worktree feature/login" });
    expect(node).toHaveClass("font-mono");
    expect(screen.getByText("feature/login")).toBeInTheDocument();
  });

  it("active state uses non-color affordances", () => {
    mockWorktrees = [{ name: "feat", branch: "feat" }];
    mockActiveWorktree = ".trees/feat";

    render(<WorktreeTree slug="demo" />);

    const worktreeButton = screen.getByRole("button", { name: "Switch to worktree feat" });
    expect(worktreeButton).toHaveClass("bg-accent/50");
    expect(worktreeButton).toHaveClass("font-semibold");
  });

  it("does not render nested inline file tree contents under worktree entries", () => {
    mockWorktrees = [{ name: "feat", branch: "feat" }];

    render(<WorktreeTree slug="demo" />);

    expect(screen.queryByRole("tree")).not.toBeInTheDocument();
    expect(screen.queryByText("src")).not.toBeInTheDocument();
  });

  it("T20: renders nothing visible when worktree list is empty", () => {
    mockWorktrees = [];

    render(<WorktreeTree slug="demo" />);

    // Component is mounted but hidden
    expect(screen.getByTestId("worktree-tree-empty")).toBeInTheDocument();
    expect(screen.queryByText("Worktrees")).not.toBeInTheDocument();
  });

  it("T21: collapse/expand toggle calls toggleWorktreesSection", async () => {
    const user = userEvent.setup();
    mockWorktrees = [{ name: "feat", branch: "feat" }];

    render(<WorktreeTree slug="demo" />);

    await user.click(screen.getByRole("button", { name: "Toggle worktrees section" }));
    expect(mockToggleWorktreesSection).toHaveBeenCalled();
  });

  it("loading state shows spinner", () => {
    mockLoading = true;
    mockWorktrees = [];

    render(<WorktreeTree slug="demo" />);

    // The component renders with Worktrees header + spinner when loading
    expect(screen.getByTestId("worktree-tree")).toBeInTheDocument();
  });

  it("error state shows error + retry", async () => {
    const user = userEvent.setup();
    mockError = "Network error";
    mockWorktrees = [];

    render(<WorktreeTree slug="demo" />);

    expect(screen.getByText("Network error")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry loading worktrees" }));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("section header has aria-expanded attribute", () => {
    mockWorktrees = [{ name: "feat", branch: "feat" }];

    render(<WorktreeTree slug="demo" />);

    const header = screen.getByRole("button", { name: "Toggle worktrees section" });
    expect(header).toHaveAttribute("aria-expanded", "true");
  });

  it("collapsed section hides content", () => {
    mockWorktrees = [{ name: "feat", branch: "feat" }];
    mockCollapsed = true;

    render(<WorktreeTree slug="demo" />);

    expect(screen.getByText("Worktrees")).toBeInTheDocument();
    expect(screen.queryByText("feat")).not.toBeInTheDocument();
    expect(screen.queryByText("Project root")).not.toBeInTheDocument();
  });
});
