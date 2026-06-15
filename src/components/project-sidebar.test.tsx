import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSidebar } from "./project-sidebar";
import type { CopilotCliState, Project } from "@/lib/types";

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
const mockRequestProjectClose = vi.fn();
const mockClearProjectCloseRequest = vi.fn();
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

function createManyOpenProjects(count: number): Project[] {
  return Array.from({ length: count }, (_, index): Project => {
    const projectNumber = index + 1;
    const slug = `project-${projectNumber}`;
    return {
      slug,
      name: `Project ${String(projectNumber).padStart(2, "0")}`,
      description: `Project ${projectNumber} fixture`,
      language: projectNumber % 2 === 0 ? "TypeScript" : "Python",
      path: `/workspaces/${slug}`,
      source: "auto",
    };
  });
}

function getProjectBadge(slug: string) {
  return screen.getByTestId(`project-badge-${slug}`);
}

function expectCopilotBotIcon(badge: HTMLElement) {
  expect(badge.querySelector('[data-testid="copilot-bot-icon"]')).not.toBeNull();
}

let mockOpenProjects: Project[] = defaultOpenProjects;

vi.mock("@/lib/open-projects-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/open-projects-context")>();
  return {
    ...actual,
    useOpenProjects: () => ({
      openProjects: mockOpenProjects,
      closeProject: mockCloseProject,
      requestProjectClose: mockRequestProjectClose,
      clearProjectCloseRequest: mockClearProjectCloseRequest,
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
    mockRequestProjectClose.mockImplementation((slug: string, activeSlug: string | null) => {
      const normalizedSlug = slug.trim();
      if (!normalizedSlug) {
        return { accepted: false, target: null, reason: "invalid-slug" as const };
      }

      mockCloseProject(normalizedSlug);
      if (activeSlug?.trim() !== normalizedSlug) {
        return { accepted: true, target: null };
      }

      const closedIndex = mockOpenProjects.findIndex(
        (project) => project.slug.trim() === normalizedSlug,
      );
      if (closedIndex === -1) {
        return { accepted: true, target: "/" };
      }

      const remainingProjects = mockOpenProjects.filter(
        (project) => project.slug.trim() !== normalizedSlug,
      );
      if (remainingProjects.length === 0) {
        return { accepted: true, target: "/" };
      }

      const targetProject = remainingProjects[closedIndex] ?? remainingProjects[closedIndex - 1];
      return {
        accepted: true,
        target: `/project/${encodeURIComponent(targetProject.slug.trim())}`,
      };
    });
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

    expect(mockRequestProjectClose).toHaveBeenCalledWith("proj-a", "proj-b");
    expect(mockCloseProject).toHaveBeenCalledWith("proj-a");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("P36-1: closing active first tab navigates to right neighbor exactly once", async () => {
    const user = userEvent.setup();
    mockPathname = "/project/proj-a";
    render(<ProjectSidebar />);

    await user.click(screen.getAllByRole("button", { name: /Close project/ })[0]);

    expect(mockRequestProjectClose).toHaveBeenCalledWith("proj-a", "proj-a");
    expect(mockCloseProject).toHaveBeenCalledWith("proj-a");
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/project/proj-b");
  });

  it("P36-2: closing active middle tab navigates to same-index right neighbor exactly once", async () => {
    const user = userEvent.setup();
    mockPathname = "/project/proj-b";
    render(<ProjectSidebar />);

    await user.click(screen.getAllByRole("button", { name: /Close project/ })[1]);

    expect(mockRequestProjectClose).toHaveBeenCalledWith("proj-b", "proj-b");
    expect(mockCloseProject).toHaveBeenCalledWith("proj-b");
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/project/proj-c");
  });

  it("P36-3: closing active last tab navigates to previous remaining project exactly once", async () => {
    const user = userEvent.setup();
    mockPathname = "/project/proj-c";
    render(<ProjectSidebar />);

    await user.click(screen.getAllByRole("button", { name: /Close project/ })[2]);

    expect(mockRequestProjectClose).toHaveBeenCalledWith("proj-c", "proj-c");
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

    expect(mockRequestProjectClose).toHaveBeenCalledWith("proj-a", "proj-a");
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

  it("Issue #70: uses a scrollable project/worktree region and fixed footer", () => {
    render(<ProjectSidebar />);

    const scrollRegion = screen.getByTestId("project-sidebar-scroll-region");
    expect(scrollRegion.className).toContain("min-h-0");
    expect(scrollRegion.className).toContain("flex-1");
    expect(scrollRegion.className).toContain("overflow-y-auto");

    const footer = screen.getByTestId("project-sidebar-footer");
    expect(footer.className).toContain("shrink-0");

    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(footer).toContainElement(toggle);
    expect(toggle.className).not.toContain("mt-auto");
  });

  it("Issue #70: many open projects keep the toggle in the fixed footer", async () => {
    const user = userEvent.setup();
    const activeSlug = "project-20";
    mockOpenProjects = createManyOpenProjects(36);
    mockPathname = `/project/${activeSlug}`;
    render(<ProjectSidebar />);

    const tabs = screen.getAllByRole("button", { name: /Open project/ });
    expect(tabs).toHaveLength(36);
    expect(tabs[35]).toHaveTextContent("Project 36");

    const footer = screen.getByTestId("project-sidebar-footer");
    const collapseToggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(footer).toContainElement(collapseToggle);
    expect(collapseToggle.className).not.toContain("mt-auto");

    const worktreeTree = screen.getByTestId("project-panel-worktree-tree");
    const wrapper = screen.getByTestId("active-worktree-wrapper");
    expect(worktreeTree).toHaveTextContent(activeSlug);
    expect(wrapper.className).not.toContain("hidden");

    await user.click(collapseToggle);

    const expandToggle = screen.getByRole("button", { name: "Expand sidebar" });
    expect(footer).toContainElement(expandToggle);
    expect(screen.getByTestId("project-panel-worktree-tree")).toBe(worktreeTree);
    expect(wrapper.className).toContain("hidden");
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

    expect(screen.getByRole("status", { name: /running/i })).toHaveClass("sr-only");
    expectCopilotBotIcon(getProjectBadge("proj-b"));

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getByRole("status", { name: /running/i })).toBeInTheDocument();
    expectCopilotBotIcon(getProjectBadge("proj-b"));
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
    expect(screen.getByRole("status", { name: /waiting/i })).toHaveTextContent(
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

  describe("Copilot CLI bot badges", () => {
    it("78-T01: renders an active running Copilot-style bot badge", () => {
      mockGetCopilotStatus = vi.fn((slug: string) =>
        slug === "proj-a" ? ("running" as const) : ("idle" as const),
      );
      render(<ProjectSidebar />);

      const alphaTab = screen.getByRole("button", { name: "Open project Alpha" });
      expect(alphaTab).toHaveAttribute("aria-label", "Open project Alpha");
      expect(alphaTab).toHaveAttribute("title", "Alpha");

      const status = screen.getByRole("status", { name: /running/i });
      expect(status).toHaveClass("sr-only");
      expect(status).toHaveAttribute("aria-label", "Copilot CLI running");
      expect(status).toHaveAttribute("title", "Copilot CLI running");
      expect(status).toHaveTextContent("Copilot CLI running");
      expect(status.className).not.toContain("h-1.5");

      const badge = getProjectBadge("proj-a");
      expect(badge).toHaveAttribute("title", "Alpha");
      expect(badge.className).toContain("h-6");
      expect(badge.className).toContain("w-6");
      expect(badge.className).toContain("bg-transparent");
      expect(badge.className).toContain("animate-pulse");
      expectCopilotBotIcon(badge);
      expect(badge).not.toHaveTextContent("A");
    });

    it("78-T02: renders an amber non-pulsing waiting Copilot-style bot badge", () => {
      mockGetCopilotStatus = vi.fn((slug: string) =>
        slug === "proj-b" ? ("waiting" as const) : ("idle" as const),
      );
      render(<ProjectSidebar />);

      const betaTab = screen.getByRole("button", { name: "Open project Beta" });
      expect(betaTab).toHaveAttribute("title", "Beta");

      const status = screen.getByRole("status", { name: /waiting/i });
      expect(status).toHaveClass("sr-only");
      expect(status).toHaveAttribute("aria-label", "Copilot CLI waiting for input");
      expect(status).toHaveAttribute("title", "Copilot CLI waiting for input");
      expect(status).toHaveTextContent("Copilot CLI waiting for input");
      expect(status.className).not.toContain("h-1.5");

      const badge = getProjectBadge("proj-b");
      expect(badge).toHaveAttribute("title", "Beta");
      expect(badge.className).toContain("h-6");
      expect(badge.className).toContain("w-6");
      expect(badge.className).toContain("bg-transparent");
      expect(badge.className).toContain("ring-2");
      expect(badge.className).toContain("ring-[oklch(0.75_0.18_55)]");
      expect(badge.className).not.toContain("animate-pulse");
      expectCopilotBotIcon(badge);
      expect(badge).not.toHaveTextContent("B");
    });

    it("78-T03: falls back to letter badges for idle and unknown statuses", () => {
      mockGetCopilotStatus = vi.fn(() => "idle" as const);
      const { unmount } = render(<ProjectSidebar />);

      expect(getProjectBadge("proj-a")).toHaveTextContent("A");
      expect(getProjectBadge("proj-b")).toHaveTextContent("B");
      expect(getProjectBadge("proj-c")).toHaveTextContent("C");
      expect(screen.queryAllByRole("status", { name: /Copilot/i })).toHaveLength(0);
      expect(screen.queryByTitle(/Copilot CLI/)).not.toBeInTheDocument();

      unmount();

      mockGetCopilotStatus = vi.fn((slug: string) =>
        slug === "proj-a" ? ("thinking" as CopilotCliState) : ("idle" as const),
      );
      render(<ProjectSidebar />);

      expect(getProjectBadge("proj-a")).toHaveTextContent("A");
      expect(getProjectBadge("proj-a").querySelector("svg")).toBeNull();
      expect(screen.queryAllByRole("status", { name: /Copilot/i })).toHaveLength(0);
      expect(screen.queryByTitle(/Copilot CLI/)).not.toBeInTheDocument();
    });

    it("78-T04: preserves project tab accessibility while exposing active status text", () => {
      mockGetCopilotStatus = vi.fn((slug: string) => {
        if (slug === "proj-a") return "running" as const;
        if (slug === "proj-b") return "waiting" as const;
        return "idle" as const;
      });
      render(<ProjectSidebar />);

      const alphaTab = screen.getByRole("button", { name: "Open project Alpha" });
      const betaTab = screen.getByRole("button", { name: "Open project Beta" });
      const charlieTab = screen.getByRole("button", { name: "Open project Charlie" });
      expect(alphaTab).toHaveAttribute("aria-label", "Open project Alpha");
      expect(betaTab).toHaveAttribute("aria-label", "Open project Beta");
      expect(charlieTab).toHaveAttribute("aria-label", "Open project Charlie");
      expect(betaTab).toHaveAttribute("aria-current", "page");

      const statuses = screen.getAllByRole("status", { name: /Copilot/i });
      expect(statuses).toHaveLength(2);
      statuses.forEach((status) => {
        expect(status).toHaveClass("sr-only");
        expect(status).toHaveAttribute("aria-label");
      });

      const labels = statuses.map((status) => status.getAttribute("aria-label"));
      expect(labels).toContain("Copilot CLI running");
      expect(labels).toContain("Copilot CLI waiting for input");
    });

    it("78-T05: keeps active Copilot-style bot badges visible in collapsed mode", async () => {
      const user = userEvent.setup();
      mockGetCopilotStatus = vi.fn((slug: string) =>
        slug === "proj-b" ? ("running" as const) : ("idle" as const),
      );
      render(<ProjectSidebar />);

      await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

      expect(screen.getByRole("navigation", { name: "Open projects" }).className).toContain("w-12");
      expect(screen.getByRole("status", { name: /running/i })).toBeInTheDocument();
      const badge = getProjectBadge("proj-b");
      expect(badge).toHaveAttribute("title", "Beta");
      expectCopilotBotIcon(badge);
      expect(badge.className).toContain("animate-pulse");
      expect(screen.queryByText("Beta")).not.toBeInTheDocument();

      const betaTab = screen.getByRole("button", { name: "Open project Beta" });
      expect(betaTab).toHaveAttribute("title", "Beta");
      expect(betaTab).toHaveAttribute("aria-current", "page");
    });

    it("78-T06: renders independent Copilot badge states per project", () => {
      mockGetCopilotStatus = vi.fn((slug: string) => {
        if (slug === "proj-a") return "running" as const;
        if (slug === "proj-b") return "waiting" as const;
        return "idle" as const;
      });
      render(<ProjectSidebar />);

      expect(screen.getAllByRole("status", { name: /Copilot/i })).toHaveLength(2);

      const alphaBadge = getProjectBadge("proj-a");
      expect(alphaBadge).toHaveAttribute("title", "Alpha");
      expectCopilotBotIcon(alphaBadge);
      expect(alphaBadge.className).toContain("animate-pulse");

      const betaBadge = getProjectBadge("proj-b");
      expect(betaBadge).toHaveAttribute("title", "Beta");
      expectCopilotBotIcon(betaBadge);
      expect(betaBadge.className).toContain("ring-[oklch(0.75_0.18_55)]");
      expect(betaBadge.className).not.toContain("animate-pulse");

      const charlieBadge = getProjectBadge("proj-c");
      expect(charlieBadge).toHaveTextContent("C");
      expect(charlieBadge.querySelector("svg")).toBeNull();
    });
  });
});
