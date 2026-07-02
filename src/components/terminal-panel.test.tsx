import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const mockUseTerminal = vi.fn();
const mockUseVoiceInput = vi.fn();
const mockUpdateCopilotStatus = vi.fn();

vi.mock("@/hooks/use-terminal", () => ({
  useTerminal: (...args: unknown[]) => mockUseTerminal(...args),
}));
vi.mock("@/hooks/use-voice-input", () => ({
  useVoiceInput: (options: { contextKey?: string | number | null }) => mockUseVoiceInput(options),
}));
vi.mock("@/lib/open-projects-context", () => ({
  useOpenProjects: () => ({ updateCopilotStatus: mockUpdateCopilotStatus }),
}));
vi.mock("@/hooks/use-terminal-theme", () => ({
  useTerminalTheme: () => ({
    themeId: "catppuccin",
    theme: { id: "catppuccin", name: "Catppuccin", colors: { background: "#1e1e2e" } },
    setThemeId: vi.fn(),
    themes: [],
  }),
}));
vi.mock("@phosphor-icons/react", () => ({
  WarningCircle: () => <span data-testid="warning-icon" />,
  Spinner: () => <span data-testid="spinner-icon" />,
  ArrowClockwise: () => <span data-testid="arrow-icon" />,
  LockSimple: () => <span data-testid="lock-icon" />,
  Palette: () => <span data-testid="palette-icon" />,
  Check: () => <span data-testid="check-icon" />,
  Keyboard: () => <span data-testid="keyboard-icon" />,
  Microphone: () => <span data-testid="microphone-icon" />,
}));
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

describe("TerminalPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTerminal.mockReturnValue({
      containerRef: { current: null },
      status: "connected",
      isConnected: true,
      error: null,
      reconnectAttempt: 0,
      maxReconnectAttempts: 3,
      retry: vi.fn(),
      terminalMode: "shell",
      isFallback: false,
      copilotStatus: "running",
      sendInput: vi.fn(),
      focusTerminal: vi.fn(),
    });
    mockUseVoiceInput.mockReturnValue({
      isSupported: true,
      isListening: false,
      canStart: true,
      status: "permission-needed",
      interimTranscript: "",
      finalTranscript: "",
      errorMessage: null,
      start: vi.fn(),
      stop: vi.fn(),
      cancel: vi.fn(),
      clear: vi.fn(),
    });
  });

  it("uses the default terminal hook options without slug or worktree props", () => {
    render(<TerminalPanel />);

    expect(mockUseTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ theme: expect.anything() }),
    );
    expect(mockUseTerminal.mock.calls[0][0]).not.toHaveProperty("slug");
    expect(mockUseTerminal.mock.calls[0][0]).not.toHaveProperty("worktree");
  });

  it("passes project-scoped terminal context to the hook when requested", () => {
    render(<TerminalPanel projectSlug="demo" workspaceContextId="wt_abc123" />);

    expect(mockUseTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: expect.anything(),
        projectSlug: "demo",
        workspaceContextId: "wt_abc123",
      }),
    );
  });

  it("does not propagate Copilot status to project context for the default terminal", () => {
    render(<TerminalPanel />);
    expect(mockUpdateCopilotStatus).not.toHaveBeenCalled();
  });

  it("uses the connection lifecycle as the voice input context key", () => {
    render(<TerminalPanel />);
    expect(mockUseVoiceInput).toHaveBeenCalledWith(
      expect.objectContaining({ contextKey: "connected" }),
    );
  });
});
