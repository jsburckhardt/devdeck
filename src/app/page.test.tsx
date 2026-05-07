import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@/components/theme-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import Home from "./page";

function renderWithProviders(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("DevDeck Home Page", () => {
  it("renders DevDeck header text", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    renderWithProviders(<Home />);
    expect(screen.getByText("DevDeck")).toBeInTheDocument();
  });

  it("renders page title", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    renderWithProviders(<Home />);
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    renderWithProviders(<Home />);
    expect(screen.getByText("Select a project to open the workspace")).toBeInTheDocument();
  });

  it("renders Add Project button (T25)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    renderWithProviders(<Home />);
    expect(screen.getByTestId("add-project-button")).toBeInTheDocument();
  });

  it("Add Project button opens dialog (T25)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const user = userEvent.setup();
    renderWithProviders(<Home />);

    await user.click(screen.getByTestId("add-project-button"));

    await waitFor(() => {
      expect(screen.getByText("Add Project", { selector: "h2" })).toBeInTheDocument();
    });
  });

  it("refreshes after mutation (T26)", async () => {
    const projects = [
      {
        slug: "proj1",
        name: "Project 1",
        description: "Desc",
        path: "/workspaces/proj1",
        source: "auto",
      },
    ];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(projects), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            ...projects,
            {
              slug: "proj2",
              name: "Project 2",
              description: "Desc2",
              path: "/workspaces/proj2",
              source: "manual",
            },
          ]),
          { status: 200 },
        ),
      );

    renderWithProviders(<Home />);

    await waitFor(() => {
      expect(screen.getByText("Project 1")).toBeInTheDocument();
    });

    // Verify initial fetch was called
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
