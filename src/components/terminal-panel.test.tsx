import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// Mock useTerminal hook
const mockUseTerminal = vi.fn();
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

  it("T17b: forces idle status when terminal is disconnected", () => {
    mockUseTerminal.mockReturnValue(
      defaultMockReturn({ copilotStatus: "running", isConnected: false, status: "failed" }),
    );
    render(<TerminalPanel slug="test-project" />);

    expect(mockUpdateCopilotStatus).toHaveBeenCalledWith("test-project", "idle");
  });
});
