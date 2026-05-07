import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// --- Mocks ---

const fakeTerminalHandlers: Record<string, (...args: unknown[]) => void> = {};
const fakeTerminal = {
  open: vi.fn(),
  write: vi.fn(),
  dispose: vi.fn(),
  loadAddon: vi.fn(),
  onData: vi.fn((cb: (data: string) => void) => {
    fakeTerminalHandlers.data = cb;
  }),
  onResize: vi.fn((cb: (e: { cols: number; rows: number }) => void) => {
    fakeTerminalHandlers.resize = cb;
  }),
  cols: 80,
  rows: 24,
  unicode: { activeVersion: "6" },
};

vi.mock("@xterm/xterm", () => ({
  Terminal: function MockTerminal() {
    return fakeTerminal;
  },
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: function MockFitAddon() {
    return { fit: vi.fn(), dispose: vi.fn() };
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
    fakeTerminal.dispose.mockClear();
    fakeTerminal.open.mockClear();
    fakeTerminal.write.mockClear();
    fakeTerminal.onData.mockClear();
    fakeTerminal.onResize.mockClear();
    fakeTerminal.loadAddon.mockClear();
    fakeTerminal.unicode.activeVersion = "6";
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
});
