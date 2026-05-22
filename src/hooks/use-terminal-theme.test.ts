import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { TERMINAL_THEMES, useTerminalTheme } from "./use-terminal-theme";

describe("TERMINAL_THEMES data", () => {
  it("T-01: contains all 13 themes with unique IDs", () => {
    expect(TERMINAL_THEMES).toHaveLength(13);
    const ids = TERMINAL_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(13);
    expect(ids).toContain("catppuccin");
    expect(ids).toContain("dracula");
    expect(ids).toContain("solarized-dark");
    expect(ids).toContain("solarized-light");
    expect(ids).toContain("monokai");
    expect(ids).toContain("gruvbox-dark");
    expect(ids).toContain("nord");
    expect(ids).toContain("one-dark");
    expect(ids).toContain("tokyo-night");
    expect(ids).toContain("github-dark");
    expect(ids).toContain("github-light");
    expect(ids).toContain("ayu-dark");
    expect(ids).toContain("material-palenight");
  });

  it("T-02: every theme has valid ITheme color properties", () => {
    const hexPattern = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
    const requiredColors = [
      "background",
      "foreground",
      "cursor",
      "selectionBackground",
      "black",
      "red",
      "green",
      "yellow",
      "blue",
      "magenta",
      "cyan",
      "white",
      "brightBlack",
      "brightRed",
      "brightGreen",
      "brightYellow",
      "brightBlue",
      "brightMagenta",
      "brightCyan",
      "brightWhite",
    ];
    for (const theme of TERMINAL_THEMES) {
      expect(theme.label).toBeTruthy();
      for (const key of requiredColors) {
        const value = theme.colors[key as keyof typeof theme.colors];
        expect(value, `${theme.id}.${key}`).toMatch(hexPattern);
      }
    }
  });
});

describe("useTerminalTheme", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("T-03: default theme is catppuccin", () => {
    const { result } = renderHook(() => useTerminalTheme());
    expect(result.current.themeId).toBe("catppuccin");
    expect(result.current.theme.id).toBe("catppuccin");
  });

  it("T-04: setThemeId persists to localStorage", () => {
    const { result } = renderHook(() => useTerminalTheme());
    act(() => result.current.setThemeId("dracula"));
    expect(localStorage.getItem("devdeck-terminal-theme")).toBe("dracula");
    expect(result.current.themeId).toBe("dracula");
  });

  it("T-05: invalid localStorage value falls back to catppuccin", () => {
    localStorage.setItem("devdeck-terminal-theme", "nonexistent");
    const { result } = renderHook(() => useTerminalTheme());
    // After effect runs, should still be catppuccin
    expect(result.current.themeId).toBe("catppuccin");
  });

  it("T-06: restores persisted theme on mount", async () => {
    localStorage.setItem("devdeck-terminal-theme", "nord");
    const { result } = renderHook(() => useTerminalTheme());
    // The useEffect will hydrate from localStorage
    await act(async () => {});
    expect(result.current.themeId).toBe("nord");
  });
});
