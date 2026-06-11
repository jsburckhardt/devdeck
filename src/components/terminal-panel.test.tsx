import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

// Mock useTerminal hook
const mockUseTerminal = vi.fn();
const mockSendInput = vi.fn(() => true);
const mockFocusTerminal = vi.fn(() => true);
vi.mock("@/hooks/use-terminal", () => ({
  useTerminal: (...args: unknown[]) => mockUseTerminal(...args),
}));

// Mock useOpenProjects
const mockUpdateCopilotStatus = vi.fn();
vi.mock("@/lib/open-projects-context", () => ({
  useOpenProjects: () => ({
    updateCopilotStatus: mockUpdateCopilotStatus,
    openProjects: [],
    closeProject: vi.fn(),
    openProject: vi.fn(),
    saveWorkspaceState: vi.fn(),
    restoreWorkspaceState: vi.fn(),
    getCopilotStatus: vi.fn(() => "idle"),
  }),
}));

// Mock phosphor icons
vi.mock("@phosphor-icons/react", () => ({
  WarningCircle: () => <span data-testid="warning-icon" />,
  Spinner: () => <span data-testid="spinner-icon" />,
  ArrowClockwise: () => <span data-testid="arrow-icon" />,
  LockSimple: () => <span data-testid="lock-icon" />,
  Palette: () => <span data-testid="palette-icon" />,
  Check: () => <span data-testid="check-icon" />,
  Keyboard: () => <span data-testid="keyboard-icon" />,
}));

// Mock terminal theme hook
vi.mock("@/hooks/use-terminal-theme", () => ({
  useTerminalTheme: () => ({
    themeId: "catppuccin",
    theme: { id: "catppuccin", name: "Catppuccin", colors: { background: "#1e1e2e" } },
    setThemeId: vi.fn(),
    themes: [],
  }),
}));

// Mock radix dropdown menu
vi.mock("@radix-ui/react-dropdown-menu", () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Trigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RadioGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RadioItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ItemIndicator: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { TerminalPanel } from "./terminal-panel";

function defaultMockReturn(overrides: Record<string, unknown> = {}) {
  return {
    containerRef: { current: null },
    status: "connected" as const,
    isConnected: true,
    error: null,
    reconnectAttempt: 0,
    maxReconnectAttempts: 3,
    retry: vi.fn(),
    terminalMode: "unknown" as const,
    isFallback: false,
    copilotStatus: "idle" as const,
    sendInput: mockSendInput,
    focusTerminal: mockFocusTerminal,
    ...overrides,
  };
}

describe("TerminalPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTerminal.mockReturnValue(defaultMockReturn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("C-T1: mode badge renders for known terminal modes", () => {
    mockUseTerminal.mockReturnValue(defaultMockReturn({ terminalMode: "shell" }));
    const { rerender } = render(<TerminalPanel slug="test" />);
    expect(screen.getByText("shell")).toBeDefined();

    mockUseTerminal.mockReturnValue(defaultMockReturn({ terminalMode: "tmux" }));
    rerender(<TerminalPanel slug="test" />);
    expect(screen.getByText("tmux")).toBeDefined();
  });

  it("C-T2: mode badge hidden when terminalMode is unknown", () => {
    mockUseTerminal.mockReturnValue(defaultMockReturn({ terminalMode: "unknown" }));
    render(<TerminalPanel slug="test" />);
    expect(screen.queryByText("shell")).toBeNull();
    expect(screen.queryByText("tmux")).toBeNull();
  });

  it("C-T3: fallback notification appears when isFallback is true", () => {
    mockUseTerminal.mockReturnValue(defaultMockReturn({ isFallback: true, terminalMode: "shell" }));
    render(<TerminalPanel slug="test" />);
    expect(screen.getByText(/tmux session unavailable/)).toBeDefined();
  });

  it("C-T4: fallback notification auto-dismisses after timeout", () => {
    vi.useFakeTimers();
    try {
      mockUseTerminal.mockReturnValue(
        defaultMockReturn({ isFallback: true, terminalMode: "shell" }),
      );
      render(<TerminalPanel slug="test" />);
      expect(screen.getByText(/tmux session unavailable/)).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByText(/tmux session unavailable/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("T16: propagates copilotStatus to context via updateCopilotStatus", () => {
    mockUseTerminal.mockReturnValue(
      defaultMockReturn({ copilotStatus: "running", isConnected: true }),
    );
    render(<TerminalPanel slug="test-project" />);

    expect(mockUpdateCopilotStatus).toHaveBeenCalledWith("test-project", "running");
  });

  it("T17: does not propagate copilotStatus when slug is undefined", () => {
    mockUseTerminal.mockReturnValue(
      defaultMockReturn({ copilotStatus: "running", isConnected: true }),
    );
    render(<TerminalPanel />);

    expect(mockUpdateCopilotStatus).not.toHaveBeenCalled();
  });

  it("T17b: does not overwrite cached Copilot status when terminal is disconnected", () => {
    mockUseTerminal.mockReturnValue(
      defaultMockReturn({ copilotStatus: "running", isConnected: false, status: "failed" }),
    );
    render(<TerminalPanel slug="test-project" />);

    expect(mockUpdateCopilotStatus).not.toHaveBeenCalled();
  });

  it("Issue #67: terminal container is unpadded and bounded", () => {
    render(<TerminalPanel slug="test" />);

    const panel = screen.getByTestId("terminal-panel");
    const container = screen.getByTestId("terminal-container");

    expect(panel).toHaveClass("min-h-0", "min-w-0", "overflow-hidden");
    expect(container).toHaveClass("h-full", "w-full", "min-h-0", "min-w-0", "overflow-hidden");
    expect(container.className).not.toMatch(/\bp(?:[trblxy])?-/);
    expect(container.getAttribute("style") ?? "").not.toMatch(/padding/i);
    expect(container.parentElement).toHaveClass(
      "h-full",
      "w-full",
      "min-h-0",
      "min-w-0",
      "overflow-hidden",
      "p-1",
    );
  });

  it("Issue #68: keyboard helper toggle exposes accessibility state without remounting terminal", () => {
    render(<TerminalPanel slug="test" />);

    const toggle = screen.getByRole("button", { name: "Terminal keyboard helper" });
    const terminalContainer = screen.getByTestId("terminal-container");

    expect(toggle).toHaveAttribute("title", "Terminal keyboard helper");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("terminal-keyboard-helper")).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("terminal-keyboard-helper")).toBeInTheDocument();
    expect(screen.getByTestId("terminal-container")).toBe(terminalContainer);

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("terminal-keyboard-helper")).toBeNull();
    expect(screen.getByTestId("terminal-container")).toBe(terminalContainer);
  });

  it("Issue #75 review: Escape closes the keyboard helper and clears Ctrl state", () => {
    render(<TerminalPanel slug="test" />);

    fireEvent.click(screen.getByRole("button", { name: "Terminal keyboard helper" }));
    fireEvent.click(screen.getByRole("button", { name: "Ctrl" }));
    expect(screen.getByRole("button", { name: "Ctrl" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByTestId("terminal-keyboard-helper")).toBeNull();
    expect(screen.getByRole("button", { name: "Terminal keyboard helper" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Terminal keyboard helper" }));
    expect(screen.getByRole("button", { name: "Ctrl" })).toHaveAttribute("aria-pressed", "false");
  });

  it("Issue #75 review: keyboard helper reserves iOS safe-area bottom inset", () => {
    render(<TerminalPanel slug="test" />);

    fireEvent.click(screen.getByRole("button", { name: "Terminal keyboard helper" }));

    expect(screen.getByTestId("terminal-keyboard-helper").className).toContain(
      "env(safe-area-inset-bottom)",
    );
  });

  it("Issue #68: plain helper keys send terminal escape sequences and restore focus", () => {
    render(<TerminalPanel slug="test" />);

    fireEvent.click(screen.getByRole("button", { name: "Terminal keyboard helper" }));
    fireEvent.click(screen.getByRole("button", { name: "Tab" }));
    fireEvent.click(screen.getByRole("button", { name: "Up" }));
    fireEvent.click(screen.getByRole("button", { name: "Right" }));

    expect(mockSendInput.mock.calls.map((call) => call[0])).toEqual(["\x09", "\x1b[A", "\x1b[C"]);
    expect(mockFocusTerminal).toHaveBeenCalledTimes(3);
    expect(mockSendInput.mock.invocationCallOrder[0]).toBeLessThan(
      mockFocusTerminal.mock.invocationCallOrder[0],
    );
  });

  it("Issue #68: Ctrl is sticky one-shot, cancelable, and sends supported chords", () => {
    render(<TerminalPanel slug="test" />);

    fireEvent.click(screen.getByRole("button", { name: "Terminal keyboard helper" }));
    const ctrl = screen.getByRole("button", { name: "Ctrl" });

    fireEvent.click(ctrl);
    expect(ctrl).toHaveAttribute("aria-pressed", "true");
    expect(mockSendInput).not.toHaveBeenCalled();

    fireEvent.click(ctrl);
    expect(ctrl).toHaveAttribute("aria-pressed", "false");
    expect(mockSendInput).not.toHaveBeenCalled();

    fireEvent.click(ctrl);
    fireEvent.click(screen.getByRole("button", { name: "Tab" }));
    expect(ctrl).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(ctrl);
    fireEvent.click(screen.getByRole("button", { name: "Up" }));
    expect(ctrl).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(ctrl);
    fireEvent.click(screen.getByRole("button", { name: "Right" }));
    expect(ctrl).toHaveAttribute("aria-pressed", "false");

    expect(mockSendInput.mock.calls.map((call) => call[0])).toEqual([
      "\x1b[27;5;9~",
      "\x1b[1;5A",
      "\x1b[1;5C",
    ]);
    expect(mockFocusTerminal).toHaveBeenCalledTimes(3);
  });

  it("Issue #68: disconnected helper keys are aria-disabled and do not send input", () => {
    mockUseTerminal.mockReturnValue(
      defaultMockReturn({ isConnected: false, status: "failed", error: "Connection lost" }),
    );

    render(<TerminalPanel slug="test" />);

    fireEvent.click(screen.getByRole("button", { name: "Terminal keyboard helper" }));

    for (const name of ["Ctrl", "Tab", "Up", "Right"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAttribute("tabindex", "-1");
      fireEvent.click(button);
    }

    expect(mockSendInput).not.toHaveBeenCalled();
    expect(mockFocusTerminal).not.toHaveBeenCalled();
  });

  it("Issue #68: helper close, context changes, and disconnect reset helper state", () => {
    const { rerender } = render(<TerminalPanel slug="project-one" worktree=".trees/one" />);

    const toggle = screen.getByRole("button", { name: "Terminal keyboard helper" });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "Ctrl" }));
    expect(screen.getByRole("button", { name: "Ctrl" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(toggle);
    expect(screen.queryByTestId("terminal-keyboard-helper")).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Ctrl" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Ctrl" }));
    rerender(<TerminalPanel slug="project-two" worktree=".trees/one" />);
    expect(screen.queryByTestId("terminal-keyboard-helper")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Terminal keyboard helper" }));
    fireEvent.click(screen.getByRole("button", { name: "Ctrl" }));

    mockUseTerminal.mockReturnValue(
      defaultMockReturn({ isConnected: false, status: "reconnecting" }),
    );
    rerender(<TerminalPanel slug="project-two" worktree=".trees/one" />);

    expect(screen.queryByTestId("terminal-keyboard-helper")).toBeNull();
  });

  it("Issue #67: status overlays and terminal controls remain accessible", () => {
    const retry = vi.fn();
    mockUseTerminal.mockReturnValue(
      defaultMockReturn({
        status: "failed",
        isConnected: false,
        error: "Connection lost",
        retry,
      }),
    );

    render(<TerminalPanel slug="test" />);

    expect(screen.getByLabelText("Terminal theme")).toBeInTheDocument();
    expect(screen.getByTestId("status-overlay")).toBeInTheDocument();
    expect(screen.getByText("Connection lost")).toBeInTheDocument();

    screen.getByRole("button", { name: "Retry" }).click();

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
