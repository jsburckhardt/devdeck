import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";

// Mock useTerminal hook
const mockUseTerminal = vi.fn();
const mockSendInput = vi.fn(() => true);
const mockFocusTerminal = vi.fn(() => true);
vi.mock("@/hooks/use-terminal", () => ({
  useTerminal: (...args: unknown[]) => mockUseTerminal(...args),
}));

// Mock useVoiceInput hook
const mockUseVoiceInput = vi.fn();
const mockStartVoiceInput = vi.fn(() => true);
const mockStopVoiceInput = vi.fn();
const mockCancelVoiceInput = vi.fn();
const mockClearVoiceInput = vi.fn();
let latestVoiceInputOptions: { contextKey?: string | number | null } | null = null;
vi.mock("@/hooks/use-voice-input", () => ({
  useVoiceInput: (options: { contextKey?: string | number | null }) => {
    latestVoiceInputOptions = options;
    return mockUseVoiceInput(options);
  },
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
  Microphone: () => <span data-testid="microphone-icon" />,
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

function defaultVoiceInputReturn(overrides: Record<string, unknown> = {}) {
  return {
    isSupported: false,
    isAvailable: false,
    isSecureContext: true,
    canStart: false,
    isListening: false,
    status: "unsupported",
    permissionState: "unknown",
    interimTranscript: "",
    finalTranscript: "",
    error: null,
    errorDetails: null,
    errorMessage: null,
    start: mockStartVoiceInput,
    stop: mockStopVoiceInput,
    cancel: mockCancelVoiceInput,
    clear: mockClearVoiceInput,
    ...overrides,
  };
}

describe("TerminalPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestVoiceInputOptions = null;
    mockUseTerminal.mockReturnValue(defaultMockReturn());
    mockUseVoiceInput.mockReturnValue(defaultVoiceInputReturn());
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

  it("Issue #80: microphone control stays visible and accessible when unsupported", () => {
    mockUseVoiceInput.mockReturnValue(defaultVoiceInputReturn());

    render(<TerminalPanel slug="test" />);

    const button = screen.getByRole("button", { name: "Terminal voice input unsupported" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAttribute("title", "Terminal voice input unsupported");
    expect(screen.getByTestId("voice-input-status")).toHaveAttribute("role", "status");
    expect(screen.getByTestId("voice-input-status")).toHaveTextContent(/not supported/i);
  });

  it("Issue #80: microphone control exposes title, pressed state, and aria-controls when panel exists", () => {
    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "permission-needed",
      }),
    );
    const { rerender } = render(<TerminalPanel slug="test" />);

    const startButton = screen.getByRole("button", { name: "Start terminal voice input" });
    expect(startButton).toHaveAttribute("title", "Start terminal voice input");
    expect(startButton).toHaveAttribute("aria-pressed", "false");
    expect(startButton).not.toHaveAttribute("aria-controls");

    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: false,
        isListening: true,
        status: "listening",
      }),
    );
    rerender(<TerminalPanel slug="test" />);

    const stopButton = screen.getByRole("button", { name: "Stop terminal voice input" });
    const panel = screen.getByTestId("voice-input-panel");
    expect(stopButton).toHaveAttribute("title", "Stop terminal voice input");
    expect(stopButton).toHaveAttribute("aria-pressed", "true");
    expect(stopButton).toHaveAttribute("aria-controls", panel.id);
  });

  it("Issue #80: starts and stops voice input from the toolbar without moving focus", () => {
    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "permission-needed",
      }),
    );
    const { rerender } = render(<TerminalPanel slug="test" />);

    const startButton = screen.getByRole("button", { name: "Start terminal voice input" });
    startButton.focus();
    fireEvent.click(startButton);

    expect(mockStartVoiceInput).toHaveBeenCalledTimes(1);
    expect(mockStopVoiceInput).not.toHaveBeenCalled();
    expect(startButton).toHaveFocus();

    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: false,
        isListening: true,
        status: "listening",
      }),
    );
    rerender(<TerminalPanel slug="test" />);

    const stopButton = screen.getByRole("button", { name: "Stop terminal voice input" });
    stopButton.focus();
    fireEvent.click(stopButton);

    expect(mockStopVoiceInput).toHaveBeenCalledTimes(1);
    expect(stopButton).toHaveFocus();
  });

  it("Issue #80: disables microphone control while disconnected and does not start recognition", () => {
    mockUseTerminal.mockReturnValue(
      defaultMockReturn({ isConnected: false, status: "failed", error: "Connection lost" }),
    );
    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "permission-needed",
      }),
    );

    render(<TerminalPanel slug="test" />);

    const button = screen.getByRole("button", {
      name: "Terminal voice input unavailable while terminal is disconnected",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("voice-input-status")).toHaveTextContent(/disconnected/i);

    fireEvent.click(button);

    expect(mockStartVoiceInput).not.toHaveBeenCalled();
    expect(mockStopVoiceInput).not.toHaveBeenCalled();
  });

  it("Issue #80: renders insecure, denied, and recognition errors as alerts", () => {
    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        isSecureContext: false,
        canStart: false,
        status: "insecure-context",
        errorMessage: "Voice input requires HTTPS or localhost.",
      }),
    );
    const { rerender } = render(<TerminalPanel slug="test" />);

    expect(screen.getByRole("alert")).toHaveTextContent(/HTTPS or localhost/i);
    expect(screen.getByRole("button", { name: /secure context/i })).toBeDisabled();

    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: false,
        status: "denied",
        errorMessage: "Microphone permission was denied.",
      }),
    );
    rerender(<TerminalPanel slug="test" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/permission was denied/i);

    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "errored",
        errorMessage: "No speech was detected.",
      }),
    );
    rerender(<TerminalPanel slug="test" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/No speech was detected/i);
  });

  it("Issue #80: displays interim transcript as plain polite text with disclosure", () => {
    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: false,
        isListening: true,
        status: "transcribing",
        interimTranscript: "<b>rm -rf</b>",
      }),
    );

    render(<TerminalPanel slug="test" />);

    const interim = screen.getByTestId("voice-interim-transcript");
    expect(interim).toHaveAttribute("aria-live", "polite");
    expect(interim).toHaveTextContent("<b>rm -rf</b>");
    expect(interim.querySelector("b")).toBeNull();
    expect(screen.getByText(/Browser or vendor speech processing may occur/i)).toBeInTheDocument();
    expect(screen.getByText(/may enter shell history/i)).toBeInTheDocument();
  });

  it("Issue #80: final transcript populates an editable review field and focuses it", async () => {
    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "permission-needed",
      }),
    );
    const { rerender } = render(<TerminalPanel slug="test" />);
    const terminalContainer = screen.getByTestId("terminal-container");

    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "ready-to-send",
        finalTranscript: "echo hello",
      }),
    );
    rerender(<TerminalPanel slug="test" />);

    const reviewField = screen.getByLabelText("Review voice transcript");
    await waitFor(() => expect(reviewField).toHaveFocus());
    expect(reviewField).toHaveValue("echo hello");
    expect(screen.getByRole("button", { name: "Send text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send + Enter" })).toBeInTheDocument();
    expect(screen.getByTestId("terminal-container")).toBe(terminalContainer);
  });

  it("Issue #80: sends reviewed text exactly and appends carriage return only via Send + Enter", async () => {
    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "ready-to-send",
        finalTranscript: "echo hello",
      }),
    );
    const { rerender } = render(<TerminalPanel slug="test" />);

    const reviewField = screen.getByLabelText("Review voice transcript");
    await waitFor(() => expect(reviewField).toHaveValue("echo hello"));
    fireEvent.change(reviewField, { target: { value: "  echo '$HOME' && pwd  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send text" }));

    expect(mockSendInput).toHaveBeenCalledWith("  echo '$HOME' && pwd  ");
    expect(mockSendInput).not.toHaveBeenCalledWith("  echo '$HOME' && pwd  \r");
    expect(mockClearVoiceInput).toHaveBeenCalledTimes(1);
    expect(mockFocusTerminal).toHaveBeenCalledTimes(1);

    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "ready-to-send",
        finalTranscript: "git status",
      }),
    );
    rerender(<TerminalPanel slug="test" />);

    const nextReviewField = screen.getByLabelText("Review voice transcript");
    await waitFor(() => expect(nextReviewField).toHaveValue("git status"));
    fireEvent.click(screen.getByRole("button", { name: "Send + Enter" }));

    expect(mockSendInput).toHaveBeenCalledWith("git status\r");
    expect(mockFocusTerminal).toHaveBeenCalledTimes(2);
  });

  it("Issue #80: validates empty and overlong reviewed text without clearing it", async () => {
    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "ready-to-send",
        finalTranscript: "echo hello",
      }),
    );
    render(<TerminalPanel slug="test" />);

    const reviewField = screen.getByLabelText("Review voice transcript");
    await waitFor(() => expect(reviewField).toHaveValue("echo hello"));

    fireEvent.change(reviewField, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Send text" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/empty/i);
    expect(reviewField).toHaveValue("   ");
    expect(mockSendInput).not.toHaveBeenCalled();

    const overlong = "x".repeat(501);
    fireEvent.change(reviewField, { target: { value: overlong } });
    fireEvent.click(screen.getByRole("button", { name: "Send + Enter" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/500 characters/i);
    expect(reviewField).toHaveValue(overlong);
    expect(mockSendInput).not.toHaveBeenCalled();
  });

  it("Issue #80: retains review text and focus when sendInput returns false", async () => {
    mockSendInput.mockReturnValueOnce(false);
    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "ready-to-send",
        finalTranscript: "echo retry",
      }),
    );
    render(<TerminalPanel slug="test" />);

    const reviewField = screen.getByLabelText("Review voice transcript");
    await waitFor(() => expect(reviewField).toHaveValue("echo retry"));
    fireEvent.change(reviewField, { target: { value: "printf '%s' retry" } });
    fireEvent.click(screen.getByRole("button", { name: "Send text" }));

    expect(mockSendInput).toHaveBeenCalledWith("printf '%s' retry");
    expect(screen.getByRole("alert")).toHaveTextContent(/retry sending/i);
    expect(reviewField).toHaveValue("printf '%s' retry");
    expect(reviewField).toHaveFocus();
    expect(mockClearVoiceInput).not.toHaveBeenCalled();
    expect(mockFocusTerminal).not.toHaveBeenCalled();
  });

  it("Issue #80: Cancel and Escape clear voice state and restore terminal focus", () => {
    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: false,
        isListening: true,
        status: "listening",
      }),
    );
    const { rerender } = render(<TerminalPanel slug="test" />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockCancelVoiceInput).toHaveBeenCalledTimes(1);
    expect(mockFocusTerminal).toHaveBeenCalledTimes(1);

    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "ready-to-send",
        finalTranscript: "echo cancel",
      }),
    );
    rerender(<TerminalPanel slug="test" />);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(mockCancelVoiceInput).toHaveBeenCalledTimes(2);
    expect(mockFocusTerminal).toHaveBeenCalledTimes(2);
  });

  it("Issue #80: disconnect, slug/worktree changes, and unmount clear voice state", () => {
    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "ready-to-send",
        finalTranscript: "echo stale",
      }),
    );
    const { rerender, unmount } = render(
      <TerminalPanel slug="project-one" worktree=".trees/one" />,
    );

    expect(latestVoiceInputOptions?.contextKey).toContain("project-one");

    mockUseTerminal.mockReturnValue(
      defaultMockReturn({ isConnected: false, status: "reconnecting" }),
    );
    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "permission-needed",
      }),
    );
    rerender(<TerminalPanel slug="project-one" worktree=".trees/one" />);
    expect(mockClearVoiceInput).toHaveBeenCalledTimes(1);

    mockUseTerminal.mockReturnValue(defaultMockReturn());
    rerender(<TerminalPanel slug="project-two" worktree=".trees/one" />);
    expect(mockClearVoiceInput).toHaveBeenCalledTimes(2);

    rerender(<TerminalPanel slug="project-two" worktree=".trees/two" />);
    expect(mockClearVoiceInput).toHaveBeenCalledTimes(3);

    unmount();
    expect(mockClearVoiceInput).toHaveBeenCalledTimes(4);
  });

  it("Issue #80: terminal container remains stable while voice UI changes", async () => {
    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "permission-needed",
      }),
    );
    const { rerender } = render(<TerminalPanel slug="test" />);
    const terminalContainer = screen.getByTestId("terminal-container");

    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: false,
        isListening: true,
        status: "transcribing",
        interimTranscript: "draft",
      }),
    );
    rerender(<TerminalPanel slug="test" />);
    expect(screen.getByTestId("terminal-container")).toBe(terminalContainer);

    mockUseVoiceInput.mockReturnValue(
      defaultVoiceInputReturn({
        isSupported: true,
        isAvailable: true,
        canStart: true,
        status: "ready-to-send",
        finalTranscript: "echo stable",
      }),
    );
    rerender(<TerminalPanel slug="test" />);
    await waitFor(() =>
      expect(screen.getByLabelText("Review voice transcript")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("terminal-container")).toBe(terminalContainer);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("terminal-container")).toBe(terminalContainer);
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
