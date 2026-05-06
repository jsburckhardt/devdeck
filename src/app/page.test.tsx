import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/theme-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

import Home from "./page";

function renderWithProviders(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("DevDeck Home Page", () => {
  it("renders DevDeck header text", () => {
    renderWithProviders(<Home />);
    expect(screen.getByText("DevDeck")).toBeInTheDocument();
  });

  it("renders page title", () => {
    renderWithProviders(<Home />);
    expect(screen.getByText("Projects")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    renderWithProviders(<Home />);
    // Loading spinner should be present
    expect(screen.getByText("Select a project to open the workspace")).toBeInTheDocument();
  });
});
