import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectSidebar } from "./project-sidebar";
import type { Project } from "@/lib/types";

const mockPush = vi.fn();
let mockPathname = "/project/proj-b";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => mockPathname,
}));

const mockCloseProject = vi.fn();
let mockGetCopilotStatus = vi.fn((_slug: string) => "idle" as const);
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
    mockGetCopilotStatus = vi.fn((_slug: string) => "idle" as const);
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
