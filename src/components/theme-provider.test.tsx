import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "./theme-provider";

function TestChild() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to dark theme", () => {
    render(
      <ThemeProvider>
        <TestChild />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme-value").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggleTheme switches to light", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TestChild />
      </ThemeProvider>,
    );

    await user.click(screen.getByText("toggle"));

    expect(screen.getByTestId("theme-value").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("reads stored preference from localStorage", () => {
    localStorage.setItem("theme", "light");

    render(
      <ThemeProvider>
        <TestChild />
      </ThemeProvider>,
    );

    // ThemeProvider reads localStorage in useState initializer, so theme is set immediately
    expect(screen.getByTestId("theme-value").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
