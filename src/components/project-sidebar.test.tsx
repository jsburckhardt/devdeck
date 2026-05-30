import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSidebar } from "./project-sidebar";
import type { Project } from "@/lib/types";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "devdeck-sidebar-collapsed";

const mockPush = vi.fn();
let mockPathname = "/project/proj-b";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => mockPathname,
}));

vi.mock("@/components/worktree-tree", () => ({
  WorktreeTree: ({ slug }: { slug: string }) => (
    <div data-testid="project-panel-worktree-tree">{slug}</div>
  ),
}));

const mockCloseProject = vi.fn();
let mockGetCopilotStatus = vi.fn(() => "idle" as const);
const defaultOpenProjects: Project[] = [
  {
    slug: "proj-a",
    name: "Alpha",
    description: "Alpha project",
    language: "TypeScript",
    path: "/workspaces/proj-a",
    source: "auto",
  },
  {
    slug: "proj-b",
    name: "Beta",
    description: "Beta project",
    language: "Python",
    path: "/workspaces/proj-b",
    source: "auto",
  },
  {
    slug: "proj-c",
    name: "Charlie",
    description: "Charlie project",
    language: "Rust",
    path: "/workspaces/proj-c",
    source: "auto",
  },
];
let mockOpenProjects: Project[] = defaultOpenProjects;

vi.mock("@/lib/open-projects-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/open-projects-context")>();
  return {
    ...actual,
    useOpenProjects: () => ({
      openProjects: mockOpenProjects,
      closeProject: mockCloseProject,
      openProject: vi.fn(),
      saveWorkspaceState: vi.fn(),
      restoreWorkspaceState: vi.fn(),
      updateCopilotStatus: vi.fn(),
      getCopilotStatus: mockGetCopilotStatus,
    }),
  };
});

describe("ProjectSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/project/proj-b";
    mockOpenProjects = defaultOpenProjects;
    mockGetCopilotStatus = vi.fn(() => "idle" as const);
    window.localStorage.clear();
  });

  it("T8: renders correct number of tabs with first letters, names and titles", () => {
    render(<ProjectSidebar />);

    const tabs = screen.getAllByRole("button", { name: /Open project/ });
    expect(tabs).toHaveLength(3);

    expect(tabs[0]).toHaveTextContent("A");
    expect(tabs[0]).toHaveTextContent("Alpha");
    expect(tabs[1]).toHaveTextContent("B");
    expect(tabs[1]).toHaveTextContent("Beta");
    expect(tabs[2]).toHaveTextContent("C");
    expect(tabs[2]).toHaveTextContent("Charlie");

    expect(tabs[0]).toHaveAttribute("title", "Alpha");
    expect(tabs[1]).toHaveAttribute("title", "Beta");
    expect(tabs[2]).toHaveAttribute("title", "Charlie");
  });

  it("T9: active tab has aria-current='page', others do not", () => {
    render(<ProjectSidebar />);

    const tabs = screen.getAllByRole("button", { name: /Open project/ });
    // proj-b is active
    expect(tabs[1]).toHaveAttribute("aria-current", "page");
    expect(tabs[0]).not.toHaveAttribute("aria-current");
    expect(tabs[2]).not.toHaveAttribute("aria-current");
  });

  it("T10: clicking a tab navigates to the project page", async () => {
    const user = userEvent.setup();
    render(<ProjectSidebar />);

    const tabs = screen.getAllByRole("button", { name: /Open project/ });
    await user.click(tabs[2]); // Click Charlie (proj-c)

    expect(mockPush).toHaveBeenCalledWith("/project/proj-c");
  });

  it("P36-5: inactive close button calls closeProject and does not navigate", async () => {
    const user = userEvent.setup();
    render(<ProjectSidebar />);

    const closeButtons = screen.getAllByRole("button", { name: /Close project/ });
    expect(closeButtons).toHaveLength(3);

    await user.click(closeButtons[0]); // Close Alpha

    expect(mockCloseProject).toHaveBeenCalledWith("proj-a");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("P36-1: closing active first tab navigates to right neighbor exactly once", async () => {
    const user = userEvent.setup();
    mockPathname = "/project/proj-a";
    render(<ProjectSidebar />);

    await user.click(screen.getAllByRole("button", { name: /Close project/ })[0]);

    expect(mockCloseProject).toHaveBeenCalledWith("proj-a");
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/project/proj-b");
  });

  it("P36-2: closing active middle tab navigates to same-index right neighbor exactly once", async () => {
    const user = userEvent.setup();
    mockPathname = "/project/proj-b";
    render(<ProjectSidebar />);

    await user.click(screen.getAllByRole("button", { name: /Close project/ })[1]);

    expect(mockCloseProject).toHaveBeenCalledWith("proj-b");
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/project/proj-c");
  });

  it("P36-3: closing active last tab navigates to previous remaining project exactly once", async () => {
    const user = userEvent.setup();
    mockPathname = "/project/proj-c";
    render(<ProjectSidebar />);

    await user.click(screen.getAllByRole("button", { name: /Close project/ })[2]);

    expect(mockCloseProject).toHaveBeenCalledWith("proj-c");
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/project/proj-b");
  });

  it("P36-4: closing only active tab navigates home exactly once", async () => {
    const user = userEvent.setup();
    mockOpenProjects = [defaultOpenProjects[0]];
    mockPathname = "/project/proj-a";
    render(<ProjectSidebar />);

    await user.click(screen.getByRole("button", { name: /Close project/ }));

    expect(mockCloseProject).toHaveBeenCalledWith("proj-a");
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("P36-6: closing active tab navigates to encoded adjacent slug", async () => {
    const user = userEvent.setup();
    const encodedTargetSlug = "project with/slash";
    mockOpenProjects = [
      defaultOpenProjects[0],
      {
        ...defaultOpenProjects[1],
        slug: encodedTargetSlug,
        name: "Encoded Target",
      },
    ];
    mockPathname = "/project/proj-a";
    render(<ProjectSidebar />);

    await user.click(screen.getAllByRole("button", { name: /Close project/ })[0]);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(`/project/${encodeURIComponent(encodedTargetSlug)}`);
  });

  it("T12: home button navigates to /", async () => {
    const user = userEvent.setup();
    render(<ProjectSidebar />);

    const homeButton = screen.getByRole("button", { name: "Go to home page" });
    await user.click(homeButton);

    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("T13: all interactive elements have aria-label", () => {
    render(<ProjectSidebar />);

    const homeButton = screen.getByRole("button", { name: "Go to home page" });
    expect(homeButton).toHaveAttribute("aria-label");

    const tabs = screen.getAllByRole("button", { name: /Open project/ });
    tabs.forEach((tab) => {
      expect(tab).toHaveAttribute("aria-label");
      expect(tab.getAttribute("aria-label")).toMatch(/Open project/);
    });

    const closeButtons = screen.getAllByRole("button", { name: /Close project/ });
    closeButtons.forEach((btn) => {
      expect(btn).toHaveAttribute("aria-label");
      expect(btn.getAttribute("aria-label")).toMatch(/Close project/);
    });

    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(toggle).toHaveAttribute("aria-label");
  });

  it("T14: keyboard navigation — Tab focuses elements, Enter activates tabs", async () => {
    const user = userEvent.setup();
    render(<ProjectSidebar />);

    // Tab to home button
    await user.tab();
    expect(screen.getByRole("button", { name: "Go to home page" })).toHaveFocus();

    // Tab to first project tab
    await user.tab();
    const tabs = screen.getAllByRole("button", { name: /Open project/ });
    expect(tabs[0]).toHaveFocus();

    // Press Enter to navigate
    await user.keyboard("{Enter}");
    expect(mockPush).toHaveBeenCalledWith("/project/proj-a");

    // Tab to an inactive close button and activate it from the keyboard.
    // It should close without also triggering the tab's project navigation.
    mockPush.mockClear();
    await user.tab(); // close button for Alpha
    const closeButtons = screen.getAllByRole("button", { name: /Close project/ });
    expect(closeButtons[0]).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(mockCloseProject).toHaveBeenCalledWith("proj-a");
    expect(mockPush).not.toHaveBeenCalled();

    // Tab to Beta tab and press Space to navigate
    await user.tab();
    expect(tabs[1]).toHaveFocus();
    await user.keyboard(" ");
    expect(mockPush).toHaveBeenCalledWith("/project/proj-b");
  });

  it("T24: sidebar renders at w-44 width", () => {
    render(<ProjectSidebar />);
    const nav = screen.getByRole("navigation", { name: "Open projects" });
    expect(nav.className).toContain("w-44");
  });

  it("T25: renders project name as visible text", () => {
    render(<ProjectSidebar />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("T25: renders Home text in home button", () => {
    render(<ProjectSidebar />);
    const homeButton = screen.getByRole("button", { name: "Go to home page" });
    expect(homeButton).toHaveTextContent("Home");
  });

  it("TP1: defaults expanded and persists collapsed state globally", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ProjectSidebar />);

    const nav = screen.getByRole("navigation", { name: "Open projects" });
    expect(nav.className).toContain("w-44");

    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);

    expect(nav.className).toContain("w-12");
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("true");

    unmount();
    render(<ProjectSidebar />);

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Open projects" }).className).toContain("w-12");
    });
  });

  it("TP1: invalid persisted collapse state falls back to expanded", async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "not-a-boolean");
    render(<ProjectSidebar />);

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Open projects" }).className).toContain("w-44");
    });
  });

  it("TP1: unavailable storage reads fall back to expanded", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
      if (key === SIDEBAR_COLLAPSED_STORAGE_KEY) {
        throw new DOMException("Storage blocked", "SecurityError");
      }
      return null;
    });

    try {
      render(<ProjectSidebar />);

      expect(screen.getByRole("navigation", { name: "Open projects" }).className).toContain("w-44");
    } finally {
      getItemSpy.mockRestore();
    }
  });

  it("TP1: unavailable storage writes still toggle the sidebar in memory", async () => {
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation((key) => {
      if (key === SIDEBAR_COLLAPSED_STORAGE_KEY) {
        throw new DOMException("Storage unavailable", "QuotaExceededError");
      }
    });

    try {
      render(<ProjectSidebar />);

      const nav = screen.getByRole("navigation", { name: "Open projects" });
      await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

      expect(nav.className).toContain("w-12");
      expect(setItemSpy).toHaveBeenCalledWith(SIDEBAR_COLLAPSED_STORAGE_KEY, "true");
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("TP2: expanded and collapsed widths use CSS transition classes", async () => {
    const user = userEvent.setup();
    render(<ProjectSidebar />);

    const nav = screen.getByRole("navigation", { name: "Open projects" });
    expect(nav.className).toContain("w-44");
    expect(nav.className).toContain("transition-[width]");

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(nav.className).toContain("w-12");
    expect(nav.className).toContain("transition-[width]");
  });

  it("TP3: collapsed mode hides labels while keeping badge initials", async () => {
    const user = userEvent.setup();
    render(<ProjectSidebar />);

    expect(screen.getByRole("button", { name: "Go to home page" })).toHaveTextContent("Home");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getByRole("button", { name: "Go to home page" })).not.toHaveTextContent("Home");
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();

    const tabs = screen.getAllByRole("button", { name: /Open project/ });
    expect(tabs[0]).toHaveTextContent("A");
    expect(tabs[1]).toHaveTextContent("B");
    expect(tabs[2]).toHaveTextContent("C");
  });

  it("TP4: collapse toggle exposes aria-expanded and meaningful title in both modes", async () => {
    const user = userEvent.setup();
    render(<ProjectSidebar />);

    const collapseToggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(collapseToggle).toHaveAttribute("aria-expanded", "true");
    expect(collapseToggle).toHaveAttribute("title", "Collapse sidebar");

    await user.click(collapseToggle);

    const expandToggle = screen.getByRole("button", { name: "Expand sidebar" });
    expect(expandToggle).toHaveAttribute("aria-expanded", "false");
    expect(expandToggle).toHaveAttribute("title", "Expand sidebar");
  });

  it("TP5: close buttons retain hover reveal expanded and are visible collapsed", async () => {
    const user = userEvent.setup();
    render(<ProjectSidebar />);

    const expandedCloseButtons = screen.getAllByRole("button", { name: /Close project/ });
    expandedCloseButtons.forEach((btn) => {
      expect(btn.className).toContain("opacity-0");
      expect(btn.className).toContain("group-hover:opacity-100");
      expect(btn.className).toContain("focus:opacity-100");
    });

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    const collapsedCloseButtons = screen.getAllByRole("button", { name: /Close project/ });
    collapsedCloseButtons.forEach((btn) => {
      expect(btn.className).toContain("opacity-100");
      expect(btn.className).not.toContain("opacity-0");
    });

    await user.click(collapsedCloseButtons[0]);
    expect(mockCloseProject).toHaveBeenCalledWith("proj-a");
  });

  it("TP6: keeps active WorktreeTree mounted and CSS-hidden when collapsed", async () => {
    const user = userEvent.setup();
    render(<ProjectSidebar />);

    const worktreeTree = screen.getByTestId("project-panel-worktree-tree");
    const wrapper = screen.getByTestId("active-worktree-wrapper");
    expect(worktreeTree).toHaveTextContent("proj-b");
    expect(wrapper.className).not.toContain("hidden");

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getByTestId("project-panel-worktree-tree")).toBe(worktreeTree);
    expect(wrapper.className).toContain("hidden");
  });

  it("TP7: keeps Copilot status visible on badges when collapsed", async () => {
    const user = userEvent.setup();
    mockGetCopilotStatus = vi.fn((slug: string) =>
      slug === "proj-b" ? ("running" as const) : ("idle" as const),
    );
    render(<ProjectSidebar />);

    expect(screen.getByRole("status", { name: /running/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getByRole("status", { name: /running/i })).toBeInTheDocument();
  });

  it("TP8: collapsed controls retain native titles and active aria-current", async () => {
    const user = userEvent.setup();
    mockGetCopilotStatus = vi.fn((slug: string) =>
      slug === "proj-b" ? ("waiting" as const) : ("idle" as const),
    );
    render(<ProjectSidebar />);

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getByRole("button", { name: "Go to home page" })).toHaveAttribute(
      "title",
      "Home",
    );

    const tabs = screen.getAllByRole("button", { name: /Open project/ });
    expect(tabs[0]).toHaveAttribute("title", "Alpha");
    expect(tabs[1]).toHaveAttribute("title", "Beta");
    expect(tabs[1]).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("status", { name: /waiting/i })).toHaveAttribute(
      "title",
      "Copilot CLI waiting for input",
    );
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute(
      "title",
      "Expand sidebar",
    );
  });

  it("renders the worktree selector in the project panel for the active project only", () => {
    render(<ProjectSidebar />);

    const worktreeTrees = screen.getAllByTestId("project-panel-worktree-tree");
    expect(worktreeTrees).toHaveLength(1);
    expect(worktreeTrees[0]).toHaveTextContent("proj-b");
  });

  it("T26: preserves accessibility attributes on active project", () => {
    render(<ProjectSidebar />);
    const tabs = screen.getAllByRole("button", { name: /Open project/ });
    // Beta is active
    expect(tabs[1]).toHaveAttribute("aria-current", "page");
    expect(tabs[1]).toHaveAttribute("aria-label");
    expect(tabs[1]).toHaveAttribute("title");

    const closeButtons = screen.getAllByRole("button", { name: /Close project/ });
    closeButtons.forEach((btn) => {
      expect(btn).toHaveAttribute("aria-label");
    });
  });

  describe("Copilot CLI status indicators", () => {
    it("T13: renders status indicator with animate-pulse for 'running' project", () => {
      mockGetCopilotStatus = vi.fn((slug: string) =>
        slug === "proj-a" ? ("running" as const) : ("idle" as const),
      );
      render(<ProjectSidebar />);

      const indicator = screen.getByRole("status", { name: /running/i });
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveAttribute("aria-label", "Copilot CLI running");
      expect(indicator).toHaveAttribute("title", "Copilot CLI running");
      expect(indicator.className).toContain("animate-pulse");
    });

    it("T14: renders status indicator without animate-pulse for 'waiting' project", () => {
      mockGetCopilotStatus = vi.fn((slug: string) =>
        slug === "proj-b" ? ("waiting" as const) : ("idle" as const),
      );
      render(<ProjectSidebar />);

      const indicator = screen.getByRole("status", { name: /waiting/i });
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveAttribute("aria-label", "Copilot CLI waiting for input");
      expect(indicator).toHaveAttribute("title", "Copilot CLI waiting for input");
      expect(indicator.className).not.toContain("animate-pulse");
    });

    it("T15: hides status indicator for 'idle' projects", () => {
      mockGetCopilotStatus = vi.fn(() => "idle" as const);
      render(<ProjectSidebar />);

      const indicators = screen.queryAllByRole("status", { name: /Copilot/i });
      expect(indicators).toHaveLength(0);
    });

    it("T18: status indicators have both aria-label and title that differentiate states", () => {
      mockGetCopilotStatus = vi.fn((slug: string) => {
        if (slug === "proj-a") return "running" as const;
        if (slug === "proj-b") return "waiting" as const;
        return "idle" as const;
      });
      render(<ProjectSidebar />);

      const indicators = screen.getAllByRole("status", { name: /Copilot/i });
      expect(indicators).toHaveLength(2);

      indicators.forEach((indicator) => {
        expect(indicator).toHaveAttribute("aria-label");
        expect(indicator).toHaveAttribute("title");
      });

      const labels = indicators.map((i) => i.getAttribute("aria-label"));
      expect(labels).toContain("Copilot CLI running");
      expect(labels).toContain("Copilot CLI waiting for input");
    });
  });
});
