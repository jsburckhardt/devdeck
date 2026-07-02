import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockWebSocketInstances: Array<{
  readyState: number;
  onopen: (() => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  url: string;
  binaryType: string;
}> = [];
const mockTerminalInstances: Array<{
  write: ReturnType<typeof vi.fn>;
}> = [];

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });
  binaryType = "";
  constructor(public url: string) {
    mockWebSocketInstances.push(this);
  }
}

vi.stubGlobal("WebSocket", MockWebSocket);

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    constructor() {
      mockTerminalInstances.push(this as { write: ReturnType<typeof vi.fn> });
    }
    open = vi.fn();
    write = vi.fn();
    focus = vi.fn();
    clear = vi.fn();
    dispose = vi.fn();
    loadAddon = vi.fn();
    attachCustomKeyEventHandler = vi.fn();
    onData = vi.fn();
    onResize = vi.fn();
    cols = 80;
    rows = 24;
    unicode = { activeVersion: "11" };
    options: Record<string, unknown> = {};
  },
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class {} }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));
vi.mock("@xterm/addon-unicode11", () => ({ Unicode11Addon: class {} }));
vi.mock("@xterm/addon-clipboard", () => ({ ClipboardAddon: class {} }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = vi.fn();
    disconnect = vi.fn();
  },
);

import { useTerminal } from "./use-terminal";

describe("useTerminal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebSocketInstances.length = 0;
    mockTerminalInstances.length = 0;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 1440,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a default websocket URL without slug or worktree params", async () => {
    renderHook(() => useTerminal());

    await waitFor(() => expect(mockWebSocketInstances.length).toBeGreaterThan(0));
    const ws = mockWebSocketInstances[0];
    expect(ws.url).toContain("/api/terminal");
    expect(ws.url).not.toContain("slug=");
    expect(ws.url).not.toContain("worktree=");
  });

  it("uses the project-scoped terminal endpoint when a workspace context is selected", async () => {
    renderHook(() => useTerminal({ projectSlug: "demo", workspaceContextId: "wt_abc123" }));

    await waitFor(() => expect(mockWebSocketInstances.length).toBeGreaterThan(0));
    const ws = mockWebSocketInstances[0];
    expect(ws.url).toContain("/api/terminal/project");
    expect(ws.url).toContain("slug=demo");
    expect(ws.url).toContain("workspaceContext=wt_abc123");
  });

  it("uses the project-scoped terminal endpoint for project pages even when the workspace context is root", async () => {
    renderHook(() => useTerminal({ projectSlug: "demo", workspaceContextId: "root" }));

    await waitFor(() => expect(mockWebSocketInstances.length).toBeGreaterThan(0));
    const ws = mockWebSocketInstances[0];
    expect(ws.url).toContain("/api/terminal/project");
    expect(ws.url).toContain("slug=demo");
    expect(ws.url).toContain("workspaceContext=root");
  });

  it("includes the auth token in the websocket URL when a browser token is available", async () => {
    document.cookie = "devdeck_token=e2e-test-token";
    renderHook(() => useTerminal());

    await waitFor(() => expect(mockWebSocketInstances.length).toBeGreaterThan(0));
    const ws = mockWebSocketInstances[0];
    expect(ws.url).toContain("token=e2e-test-token");
  });

  it("writes binary terminal payloads from the websocket into the terminal surface", async () => {
    const hook = renderHook(() => useTerminal());

    await waitFor(() => expect(mockWebSocketInstances.length).toBeGreaterThan(0));
    const ws = mockWebSocketInstances[0];

    await act(async () => {
      ws.onopen?.();
    });

    const encoded = new TextEncoder().encode("shell output");
    await act(async () => {
      ws.onmessage?.({ data: encoded });
    });

    await waitFor(() =>
      expect(mockTerminalInstances[0]?.write).toHaveBeenCalledWith("shell output"),
    );

    hook.unmount();
  });

  it("treats close code 1008 as an unsupported-context failure without reconnecting", async () => {
    const { result } = renderHook(() => useTerminal());
    await waitFor(() => expect(mockWebSocketInstances.length).toBeGreaterThan(0));
    const ws = mockWebSocketInstances[0];

    await act(async () => {
      ws.onopen?.();
    });

    await act(async () => {
      ws.onclose?.({ code: 1008, reason: "Unsupported terminal context" });
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe(
      "Project-scoped terminals are not supported by the default terminal.",
    );
    expect(result.current.reconnectAttempt).toBe(0);
  });

  it("keeps retrying for other close codes", async () => {
    try {
      const { result } = renderHook(() => useTerminal());
      await waitFor(() => expect(mockWebSocketInstances.length).toBeGreaterThan(0));
      const ws = mockWebSocketInstances[0];

      await act(async () => {
        ws.onopen?.();
      });

      await act(async () => {
        ws.onclose?.({ code: 1006, reason: "Unexpected" });
      });

      expect(result.current.status).toBe("reconnecting");
      expect(result.current.reconnectAttempt).toBe(1);
    } finally {
      // no-op
    }
  });
});
