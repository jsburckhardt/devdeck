import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// --- Mocks ---

let terminalConstructorOptions: Record<string, unknown> = {};
const callOrder: string[] = [];
const fakeTerminalHandlers: Record<string, (...args: unknown[]) => void> = {};
const fakeFitAddon = {
  fit: vi.fn(() => {
    callOrder.push("fit");
  }),
  dispose: vi.fn(),
};
const fakeTerminal = {
  open: vi.fn(),
  write: vi.fn(),
  paste: vi.fn(),
  clear: vi.fn(),
  dispose: vi.fn(),
  loadAddon: vi.fn(),
  attachCustomKeyEventHandler: vi.fn(),
  onData: vi.fn((cb: (data: string) => void) => {
    fakeTerminalHandlers.data = cb;
  }),
  onResize: vi.fn((cb: (e: { cols: number; rows: number }) => void) => {
    callOrder.push("onResize");
    fakeTerminalHandlers.resize = cb;
  }),
  cols: 80,
  rows: 24,
  unicode: { activeVersion: "6" },
};

vi.mock("@xterm/xterm", () => ({
  Terminal: function MockTerminal(opts: Record<string, unknown>) {
    terminalConstructorOptions = opts;
    return fakeTerminal;
  },
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: function MockFitAddon() {
    return fakeFitAddon;
  },
}));
vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: function MockWebLinksAddon() {
    return { dispose: vi.fn() };
  },
}));
vi.mock("@xterm/addon-unicode11", () => ({
  Unicode11Addon: function MockUnicode11Addon() {
    return { dispose: vi.fn() };
  },
}));
vi.mock("@xterm/addon-clipboard", () => ({
  ClipboardAddon: function MockClipboardAddon() {
    return { dispose: vi.fn() };
  },
}));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

// Mock ResizeObserver
const mockRODisconnect = vi.fn();
vi.stubGlobal(
  "ResizeObserver",
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = mockRODisconnect;
  },
);

// Mock WebSocket with CloseEvent support
let wsInstances: MockWS[] = [];

class MockWS {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;
  readyState = MockWS.OPEN;
  binaryType = "";
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWS.CLOSED;
  });
  constructor(public url: string) {
    wsInstances.push(this);
  }
  /** Simulate a close event with optional code */
  _triggerClose(code = 1000, reason = "") {
    this.readyState = MockWS.CLOSED;
    this.onclose?.({ code, reason });
  }
}
vi.stubGlobal("WebSocket", MockWS);

import { useTerminal } from "./use-terminal";

function getLatestWs(): MockWS {
  return wsInstances[wsInstances.length - 1];
}

async function waitForWs(): Promise<MockWS> {
  await waitFor(() => {
    expect(wsInstances.length).toBeGreaterThan(0);
  });
  return getLatestWs();
}

describe("useTerminal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wsInstances = [];
    callOrder.length = 0;
    terminalConstructorOptions = {};
    fakeTerminal.dispose.mockClear();
    fakeTerminal.open.mockClear();
    fakeTerminal.write.mockClear();
    fakeTerminal.paste.mockClear();
    fakeTerminal.clear.mockClear();
    fakeTerminal.onData.mockClear();
    fakeTerminal.onResize.mockClear();
    fakeTerminal.loadAddon.mockClear();
    fakeTerminal.attachCustomKeyEventHandler.mockClear();
    fakeTerminal.cols = 80;
    fakeTerminal.rows = 24;
    fakeTerminal.unicode.activeVersion = "6";
    fakeFitAddon.fit.mockClear();
    Object.keys(fakeTerminalHandlers).forEach((k) => delete fakeTerminalHandlers[k]);
    mockRODisconnect.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("T10: returns initial state", () => {
    const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.containerRef).toBeDefined();
    expect(["disconnected", "connecting"]).toContain(result.current.status);
  });

  it("T11: WebSocket open sets connected status", async () => {
    const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    const ws = await waitForWs();

    await act(async () => {
      ws.onopen?.();
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.isConnected).toBe(true);
  });

  it("T12: terminal input sends binary", async () => {
    renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    // Wait for WS to be created
    await waitFor(() => {
      expect(wsInstances.length).toBeGreaterThan(0);
    });
    // Allow potential re-mount to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Get the last WS instance (the one from the active mount)
    const ws = getLatestWs();
    await act(async () => {
      ws.onopen?.();
    });

    await act(async () => {
      fakeTerminalHandlers.data?.("hello");
    });

    // Check all send calls to find the binary one
    const allCalls = ws.send.mock.calls;
    // The hook sends via TextEncoder.encode() which returns Uint8Array
    const binaryCall = allCalls.find((call: unknown[]) => {
      const arg = call[0];
      // Check if it's a typed array (Uint8Array) or ArrayBuffer
      return (
        arg instanceof Uint8Array ||
        arg instanceof ArrayBuffer ||
        (arg && typeof arg === "object" && "byteLength" in (arg as object))
      );
    });
    expect(binaryCall).toBeDefined();

    const sent = binaryCall![0] as Uint8Array;
    const expected = new TextEncoder().encode("hello");
    expect(Array.from(sent)).toEqual(Array.from(expected));
  });

  it("T13: resize sends JSON control message", async () => {
    renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    const ws = await waitForWs();
    await act(async () => {
      ws.onopen?.();
    });

    await act(async () => {
      fakeTerminalHandlers.resize?.({ cols: 120, rows: 40 });
    });

    const resizeCall = ws.send.mock.calls.find((call: unknown[]) => {
      if (typeof call[0] !== "string") return false;
      try {
        const p = JSON.parse(call[0] as string) as { type: string; cols: number; rows: number };
        return p.type === "resize" && p.cols === 120 && p.rows === 40;
      } catch {
        return false;
      }
    });
    expect(resizeCall).toBeDefined();
  });

  it("T14: unexpected close triggers reconnection", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

      // Flush dynamic imports
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      const ws1 = getLatestWs();
      expect(ws1).toBeDefined();

      await act(async () => {
        ws1.onopen?.();
      });
      expect(result.current.status).toBe("connected");

      // Unexpected close (normal code, not 4401)
      await act(async () => {
        ws1._triggerClose(1006, "");
      });
      expect(result.current.status).toBe("reconnecting");
      expect(result.current.reconnectAttempt).toBe(1);

      const countBefore = wsInstances.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1050);
      });

      expect(wsInstances.length).toBeGreaterThan(countBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T15: max retries sets failed status", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      let ws = getLatestWs();
      await act(async () => {
        ws.onopen?.();
      });

      // Close unexpectedly (attempt 1)
      await act(async () => {
        ws._triggerClose(1006, "");
      });
      expect(result.current.status).toBe("reconnecting");
      expect(result.current.reconnectAttempt).toBe(1);

      // Reconnect attempt 1 fires → new ws created, but it also fails (close without open)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1050);
      });
      ws = getLatestWs();
      await act(async () => {
        ws._triggerClose(1006, "");
      });
      expect(result.current.status).toBe("reconnecting");
      expect(result.current.reconnectAttempt).toBe(2);

      // Reconnect attempt 2 fires
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2050);
      });
      ws = getLatestWs();
      await act(async () => {
        ws._triggerClose(1006, "");
      });
      expect(result.current.status).toBe("reconnecting");
      expect(result.current.reconnectAttempt).toBe(3);

      // Reconnect attempt 3 fires
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4050);
      });
      ws = getLatestWs();
      await act(async () => {
        ws._triggerClose(1006, "");
      });

      expect(result.current.status).toBe("failed");
      expect(result.current.reconnectAttempt).toBeGreaterThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T16: manual retry resets and reconnects", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      let ws = getLatestWs();
      await act(async () => {
        ws.onopen?.();
      });

      // Drive to failed: close without opening reconnect attempts
      await act(async () => {
        ws._triggerClose(1006, "");
      });

      for (let i = 0; i < 3; i++) {
        const delay = 1000 * Math.pow(2, i);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(delay + 50);
        });
        ws = getLatestWs();
        await act(async () => {
          ws._triggerClose(1006, "");
        });
      }

      expect(result.current.status).toBe("failed");

      const countBefore = wsInstances.length;
      await act(async () => {
        result.current.retry();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      expect(result.current.reconnectAttempt).toBe(0);
      expect(["connecting", "connected"]).toContain(result.current.status);
      expect(wsInstances.length).toBeGreaterThan(countBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T17: unmount cleans up everything", async () => {
    const { unmount } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    const ws = await waitForWs();
    await act(async () => {
      ws.onopen?.();
    });

    unmount();

    expect(fakeTerminal.dispose).toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalled();
  });

  it("T18: intentional close does not reconnect", async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      const ws = getLatestWs();
      expect(ws).toBeDefined();

      await act(async () => {
        ws.onopen?.();
      });

      const countBefore = wsInstances.length;
      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });

      expect(wsInstances.length).toBe(countBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T19: 4401 close code sets unauthorized error without reconnect", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      const ws = getLatestWs();
      expect(ws).toBeDefined();

      await act(async () => {
        ws.onopen?.();
      });
      expect(result.current.status).toBe("connected");

      // Close with 4401 (unauthorized)
      const countBefore = wsInstances.length;
      await act(async () => {
        ws._triggerClose(4401, "Unauthorized");
      });

      expect(result.current.status).toBe("failed");
      expect(result.current.error).toContain("Unauthorized");

      // Should NOT attempt reconnection
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(wsInstances.length).toBe(countBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T20: slug option appends slug to WS URL", async () => {
    renderHook(() => useTerminal({ slug: "my-proj" }));

    const ws = await waitForWs();
    expect(ws.url).toContain("slug=my-proj");
  });

  it("T21: no slug means no slug param in URL", async () => {
    renderHook(() => useTerminal());

    const ws = await waitForWs();
    expect(ws.url).not.toContain("slug=");
  });

  it("T22: ClipboardAddon is loaded on the terminal", async () => {
    renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    await waitForWs();

    // 4 addons: FitAddon, WebLinksAddon, Unicode11Addon, ClipboardAddon
    expect(fakeTerminal.loadAddon).toHaveBeenCalledTimes(4);
  });

  it("T23: customKeyEventHandler is registered", async () => {
    renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    await waitForWs();

    expect(fakeTerminal.attachCustomKeyEventHandler).toHaveBeenCalledTimes(1);
    expect(typeof fakeTerminal.attachCustomKeyEventHandler.mock.calls[0][0]).toBe("function");
  });

  it("T24: Terminal constructor includes screenReaderMode: true", async () => {
    renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    await waitForWs();

    expect(terminalConstructorOptions).toMatchObject({
      screenReaderMode: true,
      allowProposedApi: true,
    });
  });

  it("T25: WebSocket URL contains cols and rows query params", async () => {
    fakeTerminal.cols = 120;
    fakeTerminal.rows = 40;

    renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    const ws = await waitForWs();

    expect(ws.url).toContain("cols=120");
    expect(ws.url).toContain("rows=40");
  });

  it("T26: onResize is registered before fitAddon.fit() is called", async () => {
    const container = document.createElement("div");

    const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    // Wait for first connection attempt to complete (containerRef was null)
    await waitForWs();

    // Set the container ref so that open/fit code paths execute on retry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (result.current.containerRef as any).current = container;

    // Clear order tracking and trigger a retry
    callOrder.length = 0;

    await act(async () => {
      result.current.retry();
    });

    await waitForWs();

    const onResizeIndex = callOrder.indexOf("onResize");
    const fitIndex = callOrder.indexOf("fit");
    expect(onResizeIndex).toBeGreaterThanOrEqual(0);
    expect(fitIndex).toBeGreaterThanOrEqual(0);
    expect(onResizeIndex).toBeLessThan(fitIndex);
  });

  it("H-T1: setup message with mode tmux updates terminalMode", async () => {
    const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));
    const ws = await waitForWs();

    await act(async () => {
      ws.onopen?.();
    });

    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify({ type: "setup", mode: "tmux" }) });
    });

    expect(result.current.terminalMode).toBe("tmux");
    expect(result.current.isFallback).toBe(false);
  });

  it("H-T2: fallback setup message sets isFallback and clears terminal", async () => {
    const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));
    const ws = await waitForWs();

    await act(async () => {
      ws.onopen?.();
    });

    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "setup",
          mode: "shell",
          fallback: true,
          reason: "tmux-attach-failed",
        }),
      });
    });

    expect(result.current.terminalMode).toBe("shell");
    expect(result.current.isFallback).toBe(true);
    expect(fakeTerminal.clear).toHaveBeenCalledTimes(1);
  });

  it("H-T3: terminalMode resets to unknown on reconnect", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      const ws1 = getLatestWs();
      await act(async () => {
        ws1.onopen?.();
      });

      // Set mode to tmux via setup message
      await act(async () => {
        ws1.onmessage?.({ data: JSON.stringify({ type: "setup", mode: "tmux" }) });
      });
      expect(result.current.terminalMode).toBe("tmux");

      // Trigger unexpected close to initiate reconnect
      await act(async () => {
        ws1._triggerClose(1006, "");
      });

      // Advance timer to trigger reconnect
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1050);
      });

      // After reconnect, mode should be reset
      expect(result.current.terminalMode).toBe("unknown");
      expect(result.current.isFallback).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
