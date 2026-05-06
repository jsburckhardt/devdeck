import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/theme-provider";

vi.mock("react-resizable-panels", () => ({
  Group: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="panel-group" {...props}>
      {children}
    </div>
  ),
  Panel: ({ children }: React.PropsWithChildren) => <div data-testid="panel">{children}</div>,
  Separator: (props: Record<string, unknown>) => <div data-testid="resize-handle" {...props} />,
}));

import Home from "./page";

function renderWithProviders(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("DevDeck Shell Page", () => {
  it("renders DevDeck header text", () => {
    renderWithProviders(<Home />);
    expect(screen.getByText("DevDeck")).toBeInTheDocument();
  });

  it("renders panel placeholders", () => {
    renderWithProviders(<Home />);
    expect(screen.getByText("File Explorer")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
  });
});
