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
const mockOpenProjects: Project[] = [
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

vi.mock("@/lib/open-projects-context", () => ({
  useOpenProjects: () => ({
    openProjects: mockOpenProjects,
    closeProject: mockCloseProject,
    openProject: vi.fn(),
    saveWorkspaceState: vi.fn(),
    restoreWorkspaceState: vi.fn(),
  }),
}));

describe("ProjectSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/project/proj-b";
  });

  it("T8: renders correct number of tabs with first letters and titles", () => {
    render(<ProjectSidebar />);

    const tabs = screen.getAllByRole("button", { name: /Open project/ });
    expect(tabs).toHaveLength(3);

    expect(tabs[0]).toHaveTextContent("A");
    expect(tabs[1]).toHaveTextContent("B");
    expect(tabs[2]).toHaveTextContent("C");

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

  it("T11: close button calls closeProject and does not navigate", async () => {
    const user = userEvent.setup();
    render(<ProjectSidebar />);

    const closeButtons = screen.getAllByRole("button", { name: /Close project/ });
    expect(closeButtons).toHaveLength(3);

    await user.click(closeButtons[0]); // Close Alpha

    expect(mockCloseProject).toHaveBeenCalledWith("proj-a");
    // Clicking close should not trigger navigation to the project
    expect(mockPush).not.toHaveBeenCalledWith("/project/proj-a");
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

    // Tab to close button, then next tab
    mockPush.mockClear();
    await user.tab(); // close button for Alpha
    await user.tab(); // Beta tab
    expect(tabs[1]).toHaveFocus();

    // Press Space to navigate
    await user.keyboard(" ");
    expect(mockPush).toHaveBeenCalledWith("/project/proj-b");

    // Tab to close button and press Enter
    await user.tab();
    const closeButtons = screen.getAllByRole("button", { name: /Close project/ });
    expect(closeButtons[1]).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(mockCloseProject).toHaveBeenCalledWith("proj-b");
  });
});
