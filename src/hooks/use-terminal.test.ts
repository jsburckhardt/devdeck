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
  focus: vi.fn(),
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
  options: {} as Record<string, unknown>,
};

vi.mock("@xterm/xterm", () => ({
  Terminal: function MockTerminal(opts: Record<string, unknown>) {
    terminalConstructorOptions = opts;
    fakeTerminal.options = { ...opts };
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

// Mock ResizeObserver — capture callback so tests can trigger resize events
const mockRODisconnect = vi.fn();
let resizeObserverCallback: (() => void) | null = null;
vi.stubGlobal(
  "ResizeObserver",
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = mockRODisconnect;
    constructor(cb: () => void) {
      resizeObserverCallback = cb;
    }
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

type MediaQueryListener = (event: { matches: boolean; media: string }) => void;

interface MockMediaQueryList {
  media: string;
  matches: boolean;
  onchange: MediaQueryListener | null;
  addEventListener?: ReturnType<typeof vi.fn>;
  removeEventListener?: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  modernListeners: Set<MediaQueryListener>;
  legacyListeners: Set<MediaQueryListener>;
  dispatchEvent: ReturnType<typeof vi.fn>;
}

interface ViewportMockOptions {
  width?: number;
  documentWidth?: number;
  primaryCoarsePointer?: boolean;
  anyCoarsePointer?: boolean;
  maxTouchPoints?: number;
  visualViewportWidth?: number;
  legacyMediaQuery?: boolean;
}

const mediaQueryLists = new Map<string, MockMediaQueryList>();
const visualViewportListeners = new Set<() => void>();
let viewportMockState: Required<Omit<ViewportMockOptions, "legacyMediaQuery">> = {
  width: 1440,
  documentWidth: 1440,
  primaryCoarsePointer: false,
  anyCoarsePointer: false,
  maxTouchPoints: 0,
  visualViewportWidth: 1440,
};
let useLegacyMediaQuery = false;
let mockVisualViewport: {
  width: number;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
} | null = null;

function matchesQuery(query: string): boolean {
  if (query === "(pointer: coarse)") {
    return viewportMockState.primaryCoarsePointer;
  }
  if (query === "(any-pointer: coarse)") {
    return viewportMockState.anyCoarsePointer;
  }
  return false;
}

function ensureMediaQueryList(query: string): MockMediaQueryList {
  const existing = mediaQueryLists.get(query);
  if (existing) {
    existing.matches = matchesQuery(query);
    return existing;
  }

  const modernListeners = new Set<MediaQueryListener>();
  const legacyListeners = new Set<MediaQueryListener>();
  const list: MockMediaQueryList = {
    media: query,
    matches: matchesQuery(query),
    onchange: null,
    addEventListener: useLegacyMediaQuery
      ? undefined
      : vi.fn((type: string, listener: MediaQueryListener) => {
          if (type === "change") {
            modernListeners.add(listener);
          }
        }),
    removeEventListener: useLegacyMediaQuery
      ? undefined
      : vi.fn((type: string, listener: MediaQueryListener) => {
          if (type === "change") {
            modernListeners.delete(listener);
          }
        }),
    addListener: vi.fn((listener: MediaQueryListener) => {
      legacyListeners.add(listener);
    }),
    removeListener: vi.fn((listener: MediaQueryListener) => {
      legacyListeners.delete(listener);
    }),
    modernListeners,
    legacyListeners,
    dispatchEvent: vi.fn(() => true),
  };
  mediaQueryLists.set(query, list);
  return list;
}

function defineReadonlyBrowserNumber<T extends object>(target: T, key: keyof T, value: number) {
  Object.defineProperty(target, key, {
    configurable: true,
    value,
  });
}

function installViewportMocks(options: ViewportMockOptions = {}) {
  useLegacyMediaQuery = options.legacyMediaQuery ?? false;
  mediaQueryLists.clear();
  visualViewportListeners.clear();
  viewportMockState = {
    width: options.width ?? 1440,
    documentWidth: options.documentWidth ?? options.width ?? 1440,
    primaryCoarsePointer: options.primaryCoarsePointer ?? false,
    anyCoarsePointer: options.anyCoarsePointer ?? false,
    maxTouchPoints: options.maxTouchPoints ?? 0,
    visualViewportWidth: options.visualViewportWidth ?? options.width ?? 1440,
  };

  defineReadonlyBrowserNumber(window, "innerWidth", viewportMockState.width);
  defineReadonlyBrowserNumber(
    document.documentElement,
    "clientWidth",
    viewportMockState.documentWidth,
  );
  defineReadonlyBrowserNumber(navigator, "maxTouchPoints", viewportMockState.maxTouchPoints);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ensureMediaQueryList(query)),
  });

  mockVisualViewport = {
    width: viewportMockState.visualViewportWidth,
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === "resize") {
        visualViewportListeners.add(listener);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === "resize") {
        visualViewportListeners.delete(listener);
      }
    }),
  };
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: mockVisualViewport,
  });
}

function updateViewportMock(options: ViewportMockOptions) {
  viewportMockState = {
    width: options.width ?? viewportMockState.width,
    documentWidth: options.documentWidth ?? options.width ?? viewportMockState.documentWidth,
    primaryCoarsePointer: options.primaryCoarsePointer ?? viewportMockState.primaryCoarsePointer,
    anyCoarsePointer: options.anyCoarsePointer ?? viewportMockState.anyCoarsePointer,
    maxTouchPoints: options.maxTouchPoints ?? viewportMockState.maxTouchPoints,
    visualViewportWidth:
      options.visualViewportWidth ?? options.width ?? viewportMockState.visualViewportWidth,
  };
  defineReadonlyBrowserNumber(window, "innerWidth", viewportMockState.width);
  defineReadonlyBrowserNumber(
    document.documentElement,
    "clientWidth",
    viewportMockState.documentWidth,
  );
  defineReadonlyBrowserNumber(navigator, "maxTouchPoints", viewportMockState.maxTouchPoints);
  if (mockVisualViewport) {
    mockVisualViewport.width = viewportMockState.visualViewportWidth;
  }
  for (const [query, mediaQueryList] of mediaQueryLists) {
    mediaQueryList.matches = matchesQuery(query);
  }
}

function emitMediaQueryChange(query: string) {
  const mediaQueryList = ensureMediaQueryList(query);
  const event = { matches: mediaQueryList.matches, media: query };
  mediaQueryList.onchange?.(event);
  mediaQueryList.modernListeners.forEach((listener) => listener(event));
  mediaQueryList.legacyListeners.forEach((listener) => listener(event));
}

function emitVisualViewportResize() {
  visualViewportListeners.forEach((listener) => listener());
}

import { getTerminalFontSize, type TerminalFontSizeInput, useTerminal } from "./use-terminal";
import { TERMINAL_THEMES } from "./use-terminal-theme";

function getLatestWs(): MockWS {
  return wsInstances[wsInstances.length - 1];
}

async function waitForWs(): Promise<MockWS> {
  await waitFor(() => {
    expect(wsInstances.length).toBeGreaterThan(0);
  });
  return getLatestWs();
}

function mockRect(width: number, height: number): DOMRect {
  return {
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("getTerminalFontSize", () => {
  it("Issue #94: applies the responsive font-size policy table and threshold edges", () => {
    const noTouch = {
      primaryCoarsePointer: false,
      anyCoarsePointer: false,
      maxTouchPoints: 0,
    };

    expect(getTerminalFontSize({ ...noTouch, layoutViewportWidth: 600 })).toBe(11);
    expect(
      getTerminalFontSize({
        layoutViewportWidth: 600,
        primaryCoarsePointer: true,
        anyCoarsePointer: true,
        maxTouchPoints: 5,
      }),
    ).toBe(11);
    expect(getTerminalFontSize({ ...noTouch, layoutViewportWidth: 601 })).toBe(13);
    expect(
      getTerminalFontSize({
        ...noTouch,
        layoutViewportWidth: 1366,
        primaryCoarsePointer: true,
      }),
    ).toBe(12);
    expect(
      getTerminalFontSize({
        ...noTouch,
        layoutViewportWidth: 1367,
        primaryCoarsePointer: true,
      }),
    ).toBe(13);
    expect(
      getTerminalFontSize({
        ...noTouch,
        layoutViewportWidth: 1024,
        anyCoarsePointer: true,
      }),
    ).toBe(12);
    expect(
      getTerminalFontSize({
        ...noTouch,
        layoutViewportWidth: 1025,
        anyCoarsePointer: true,
      }),
    ).toBe(13);
    expect(getTerminalFontSize({ ...noTouch, layoutViewportWidth: 1024, maxTouchPoints: 1 })).toBe(
      12,
    );
    expect(getTerminalFontSize({ ...noTouch, layoutViewportWidth: 1025, maxTouchPoints: 1 })).toBe(
      13,
    );
    expect(getTerminalFontSize({ ...noTouch, layoutViewportWidth: 1200 })).toBe(13);
    expect(getTerminalFontSize({ ...noTouch, layoutViewportWidth: 1920 })).toBe(13);
  });

  it("Issue #94: is safe with missing browser APIs and uses layout viewport sources only", () => {
    expect(getTerminalFontSize({ window: null, document: null, navigator: null })).toBe(13);
    expect(
      getTerminalFontSize({
        window: { innerWidth: null },
        document: { documentElement: { clientWidth: 600 } },
        navigator: null,
      }),
    ).toBe(11);
    expect(
      getTerminalFontSize({
        window: { innerWidth: 1024 },
        navigator: null,
      }),
    ).toBe(13);
    expect(
      getTerminalFontSize({
        window: { innerWidth: 1024 },
        navigator: { maxTouchPoints: 1 },
      }),
    ).toBe(12);

    expect(
      getTerminalFontSize({
        window: {
          innerWidth: 1025,
          matchMedia: (query: string) => ({
            matches: query === "(any-pointer: coarse)",
          }),
          visualViewport: { width: 500 },
        } as TerminalFontSizeInput["window"] & {
          visualViewport: { width: number };
        },
        navigator: { maxTouchPoints: 0 },
      }),
    ).toBe(13);
  });
});

function resizeMessages(ws: MockWS): Array<{ cols: number; rows: number }> {
  return ws.send.mock.calls.flatMap((call: unknown[]) => {
    if (typeof call[0] !== "string") {
      return [];
    }

    try {
      const payload = JSON.parse(call[0] as string) as {
        type?: string;
        cols?: number;
        rows?: number;
      };
      if (payload.type === "resize" && payload.cols != null && payload.rows != null) {
        return [{ cols: payload.cols, rows: payload.rows }];
      }
    } catch {
      // Ignore non-JSON string frames.
    }

    return [];
  });
}

async function mountTerminalWithContainer({
  width = 800,
  height = 400,
  options = { wsUrl: "ws://test:3100" },
}: {
  width?: number;
  height?: number;
  options?: Parameters<typeof useTerminal>[0];
} = {}) {
  const container = document.createElement("div");
  const rectSpy = vi
    .spyOn(container, "getBoundingClientRect")
    .mockReturnValue(mockRect(width, height));
  const hook = renderHook(() => useTerminal(options));

  const firstWs = await waitForWs();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (hook.result.current.containerRef as any).current = container;

  const countBeforeRetry = wsInstances.length;
  await act(async () => {
    hook.result.current.retry();
  });

  await waitFor(() => {
    expect(wsInstances.length).toBeGreaterThan(countBeforeRetry);
  });

  return {
    ...hook,
    container,
    firstWs,
    rectSpy,
    ws: getLatestWs(),
  };
}

describe("useTerminal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installViewportMocks();
    wsInstances = [];
    callOrder.length = 0;
    terminalConstructorOptions = {};
    fakeTerminal.dispose.mockClear();
    fakeTerminal.open.mockClear();
    fakeTerminal.write.mockClear();
    fakeTerminal.paste.mockClear();
    fakeTerminal.focus.mockClear();
    fakeTerminal.clear.mockClear();
    fakeTerminal.onData.mockClear();
    fakeTerminal.onResize.mockClear();
    fakeTerminal.loadAddon.mockClear();
    fakeTerminal.attachCustomKeyEventHandler.mockClear();
    resizeObserverCallback = null;
    fakeTerminal.cols = 80;
    fakeTerminal.rows = 24;
    fakeTerminal.unicode.activeVersion = "6";
    fakeTerminal.options = {};
    fakeFitAddon.fit.mockImplementation(() => {
      callOrder.push("fit");
    });
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

  it("Issue #68: sendInput sends binary frames through the active open WebSocket", async () => {
    const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    const ws = await waitForWs();
    await act(async () => {
      ws.onopen?.();
    });

    ws.send.mockClear();

    let didSend = false;
    await act(async () => {
      didSend = result.current.sendInput("helper");
    });

    expect(didSend).toBe(true);
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(Array.from(ws.send.mock.calls[0][0] as Uint8Array)).toEqual(
      Array.from(new TextEncoder().encode("helper")),
    );
  });

  it("Issue #75 review: sendInput reuses one TextEncoder for terminal input", async () => {
    const OriginalTextEncoder = globalThis.TextEncoder;
    const encode = vi.fn((input?: string) => new OriginalTextEncoder().encode(input));
    const MockTextEncoder = vi.fn(function MockTextEncoder() {
      return { encode };
    }) as unknown as typeof TextEncoder;
    vi.stubGlobal("TextEncoder", MockTextEncoder);

    try {
      const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

      const ws = await waitForWs();
      await act(async () => {
        ws.onopen?.();
      });
      ws.send.mockClear();

      await act(async () => {
        expect(result.current.sendInput("helper-one")).toBe(true);
        fakeTerminalHandlers.data?.("typed-input");
        expect(result.current.sendInput("helper-two")).toBe(true);
      });

      expect(MockTextEncoder).toHaveBeenCalledTimes(1);
      expect(encode).toHaveBeenCalledTimes(3);
      expect(ws.send).toHaveBeenCalledTimes(3);
      expect(Array.from(ws.send.mock.calls[1][0] as Uint8Array)).toEqual(
        Array.from(new OriginalTextEncoder().encode("typed-input")),
      );
    } finally {
      vi.stubGlobal("TextEncoder", OriginalTextEncoder);
    }
  });

  it("Issue #68: sendInput no-ops when the terminal input path is unavailable", async () => {
    const { result, unmount } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    expect(result.current.sendInput("before-socket")).toBe(false);

    const ws = await waitForWs();
    expect(result.current.sendInput("before-open")).toBe(false);
    expect(ws.send).not.toHaveBeenCalled();

    await act(async () => {
      ws.onopen?.();
    });

    ws.send.mockClear();
    ws.readyState = MockWS.CONNECTING;
    expect(result.current.sendInput("connecting")).toBe(false);
    ws.readyState = MockWS.CLOSED;
    expect(result.current.sendInput("closed")).toBe(false);
    expect(ws.send).not.toHaveBeenCalled();

    await act(async () => {
      ws._triggerClose(4401, "Unauthorized");
    });
    expect(result.current.sendInput("unauthorized")).toBe(false);

    unmount();
    expect(result.current.sendInput("unmounted")).toBe(false);
  });

  it("Issue #68: sendInput does not send to stale WebSocket instances after reconnect", async () => {
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
      ws1.send.mockClear();

      await act(async () => {
        ws1._triggerClose(1006, "abnormal");
      });
      expect(result.current.sendInput("during-reconnect")).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1050);
      });

      const ws2 = getLatestWs();
      expect(ws2).not.toBe(ws1);
      await act(async () => {
        ws2.onopen?.();
      });
      ws2.send.mockClear();

      expect(result.current.sendInput("fresh")).toBe(true);
      expect(ws1.send).not.toHaveBeenCalled();
      expect(Array.from(ws2.send.mock.calls[0][0] as Uint8Array)).toEqual(
        Array.from(new TextEncoder().encode("fresh")),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("Issue #68: sendInput uses the replacement WebSocket after project and worktree changes", async () => {
    const { result, rerender } = renderHook(
      ({ slug, worktree }) => useTerminal({ slug, worktree }),
      { initialProps: { slug: "project-one", worktree: undefined as string | undefined } },
    );

    const ws1 = await waitForWs();
    await act(async () => {
      ws1.onopen?.();
    });
    ws1.send.mockClear();

    rerender({ slug: "project-two", worktree: ".trees/feature" });

    await waitFor(() => {
      expect(wsInstances.length).toBeGreaterThan(1);
    });

    const ws2 = getLatestWs();
    expect(ws2).not.toBe(ws1);
    await act(async () => {
      ws2.onopen?.();
    });
    ws2.send.mockClear();
    ws1.send.mockClear();

    expect(result.current.sendInput("context")).toBe(true);
    expect(ws1.send).not.toHaveBeenCalled();
    expect(Array.from(ws2.send.mock.calls[0][0] as Uint8Array)).toEqual(
      Array.from(new TextEncoder().encode("context")),
    );

    const url = new URL(ws2.url);
    expect(url.searchParams.get("slug")).toBe("project-two");
    expect(url.searchParams.get("worktree")).toBe(".trees/feature");
  });

  it("Issue #68: focusTerminal focuses xterm when available and no-ops safely", async () => {
    const { result, unmount } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    expect(result.current.focusTerminal()).toBe(false);

    await waitForWs();

    expect(result.current.focusTerminal()).toBe(true);
    expect(fakeTerminal.focus).toHaveBeenCalledTimes(1);

    fakeTerminal.focus.mockImplementationOnce(() => {
      throw new Error("focus failed");
    });
    expect(result.current.focusTerminal()).toBe(false);

    unmount();
    expect(result.current.focusTerminal()).toBe(false);
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

  it("Issue #67: duplicate terminal resize events do not send duplicate messages", async () => {
    renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    const ws = await waitForWs();
    await act(async () => {
      ws.onopen?.();
    });

    // Clear the initial resize message sent on open while preserving the
    // hook's internal last-sent dimensions.
    ws.send.mockClear();

    await act(async () => {
      fakeTerminalHandlers.resize?.({ cols: 80, rows: 24 });
      fakeTerminalHandlers.resize?.({ cols: 120, rows: 40 });
      fakeTerminalHandlers.resize?.({ cols: 120, rows: 40 });
      fakeTerminalHandlers.resize?.({ cols: 121, rows: 40 });
    });

    expect(resizeMessages(ws)).toEqual([
      { cols: 120, rows: 40 },
      { cols: 121, rows: 40 },
    ]);
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

  it("Issue #94: cleans up responsive listeners on context changes and unmount", async () => {
    const removeWindowListenerSpy = vi.spyOn(window, "removeEventListener");
    const { rerender, unmount } = renderHook(
      ({ slug, worktree }) => useTerminal({ slug, worktree }),
      { initialProps: { slug: "project-one", worktree: undefined as string | undefined } },
    );

    await waitForWs();
    const pointerQuery = ensureMediaQueryList("(pointer: coarse)");
    const anyPointerQuery = ensureMediaQueryList("(any-pointer: coarse)");
    expect(pointerQuery.addEventListener).toBeDefined();
    expect(anyPointerQuery.addEventListener).toBeDefined();
    expect(pointerQuery.addEventListener!).toHaveBeenCalledTimes(1);
    expect(anyPointerQuery.addEventListener!).toHaveBeenCalledTimes(1);
    expect(mockVisualViewport?.addEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );

    rerender({ slug: "project-two", worktree: ".trees/feature" });
    await waitFor(() => {
      expect(wsInstances.length).toBeGreaterThan(1);
    });

    unmount();

    expect(pointerQuery.addEventListener!).toHaveBeenCalledTimes(2);
    expect(pointerQuery.removeEventListener!).toHaveBeenCalledTimes(2);
    expect(anyPointerQuery.addEventListener!).toHaveBeenCalledTimes(2);
    expect(anyPointerQuery.removeEventListener!).toHaveBeenCalledTimes(2);
    expect(removeWindowListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeWindowListenerSpy).toHaveBeenCalledWith("orientationchange", expect.any(Function));
    expect(mockVisualViewport?.removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
  });

  it("Issue #94: cleans up legacy media-query listeners", async () => {
    installViewportMocks({ legacyMediaQuery: true });
    const { unmount } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    await waitForWs();
    const pointerQuery = ensureMediaQueryList("(pointer: coarse)");
    const anyPointerQuery = ensureMediaQueryList("(any-pointer: coarse)");

    expect(pointerQuery.addEventListener).toBeUndefined();
    expect(pointerQuery.addListener).toHaveBeenCalledTimes(1);
    expect(anyPointerQuery.addListener).toHaveBeenCalledTimes(1);

    unmount();

    expect(pointerQuery.removeListener).toHaveBeenCalledTimes(1);
    expect(anyPointerQuery.removeListener).toHaveBeenCalledTimes(1);
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

  it("T24: Terminal constructor includes accessibility and tmux-safe rendering options", async () => {
    renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

    await waitForWs();

    expect(terminalConstructorOptions).toMatchObject({
      lineHeight: 1.0,
      customGlyphs: true,
      screenReaderMode: true,
      allowProposedApi: true,
      fontSize: 13,
    });
  });

  it("Issue #94: Terminal constructor receives the computed responsive font size before connect", async () => {
    const cases = [
      {
        label: "phone",
        viewport: { width: 600, primaryCoarsePointer: false, anyCoarsePointer: false },
        expectedFontSize: 11,
      },
      {
        label: "tablet primary coarse",
        viewport: { width: 1024, primaryCoarsePointer: true, anyCoarsePointer: true },
        expectedFontSize: 12,
      },
      {
        label: "desktop",
        viewport: { width: 1200, primaryCoarsePointer: false, anyCoarsePointer: false },
        expectedFontSize: 13,
      },
    ];

    for (const testCase of cases) {
      installViewportMocks(testCase.viewport);
      wsInstances = [];
      terminalConstructorOptions = {};

      const { unmount } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));
      const ws = await waitForWs();

      expect(terminalConstructorOptions).toMatchObject({
        fontSize: testCase.expectedFontSize,
        lineHeight: 1.0,
        customGlyphs: true,
        screenReaderMode: true,
      });
      expect(ws.url).toContain("cols=80");
      expect(ws.url).toContain("rows=24");

      unmount();
    }
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
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue(mockRect(800, 400));

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

  it("T27: Terminal constructor receives provided theme", async () => {
    const { colors: draculaColors } = TERMINAL_THEMES.find((t) => t.id === "dracula")!;
    renderHook(() => useTerminal({ wsUrl: "ws://test:3100", theme: draculaColors }));
    await waitForWs();
    expect(terminalConstructorOptions.theme).toBe(draculaColors);
  });

  it("T28: runtime theme change updates terminal.options.theme without reconnect", async () => {
    const catppuccin = TERMINAL_THEMES.find((t) => t.id === "catppuccin")!.colors;
    const dracula = TERMINAL_THEMES.find((t) => t.id === "dracula")!.colors;

    const { rerender } = renderHook(
      ({ theme }) => useTerminal({ wsUrl: "ws://test:3100", theme }),
      { initialProps: { theme: catppuccin } },
    );

    const ws = await waitForWs();
    await act(async () => {
      ws.onopen?.();
    });

    const countBefore = wsInstances.length;

    await act(async () => {
      rerender({ theme: dracula });
    });

    expect(fakeTerminal.options.theme).toBe(dracula);
    expect(wsInstances.length).toBe(countBefore);
  });

  it("Issue #94: runtime font-size tier changes update xterm, force fit, send resize, and do not reconnect", async () => {
    installViewportMocks({
      width: 1440,
      primaryCoarsePointer: false,
      anyCoarsePointer: false,
      maxTouchPoints: 0,
    });
    const { ws } = await mountTerminalWithContainer();

    await act(async () => {
      ws.onopen?.();
    });

    const socketCount = wsInstances.length;
    ws.send.mockClear();
    fakeFitAddon.fit.mockImplementation(() => {
      callOrder.push("fit");
      if (fakeTerminal.options.fontSize === 12) {
        fakeTerminal.cols = 100;
        fakeTerminal.rows = 30;
      } else if (fakeTerminal.options.fontSize === 11) {
        fakeTerminal.cols = 110;
        fakeTerminal.rows = 34;
      }
      fakeTerminalHandlers.resize?.({ cols: fakeTerminal.cols, rows: fakeTerminal.rows });
    });
    fakeFitAddon.fit.mockClear();

    updateViewportMock({
      width: 1024,
      primaryCoarsePointer: true,
      anyCoarsePointer: true,
      maxTouchPoints: 5,
    });
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(fakeTerminal.options.fontSize).toBe(12);
    expect(fakeFitAddon.fit).toHaveBeenCalledTimes(1);
    expect(resizeMessages(ws)).toEqual([{ cols: 100, rows: 30 }]);
    expect(wsInstances.length).toBe(socketCount);

    updateViewportMock({
      width: 600,
      primaryCoarsePointer: false,
      anyCoarsePointer: false,
      maxTouchPoints: 0,
    });
    await act(async () => {
      window.dispatchEvent(new Event("orientationchange"));
    });

    expect(fakeTerminal.options.fontSize).toBe(11);
    expect(fakeFitAddon.fit).toHaveBeenCalledTimes(2);
    expect(resizeMessages(ws)).toEqual([
      { cols: 100, rows: 30 },
      { cols: 110, rows: 34 },
    ]);
    expect(wsInstances.length).toBe(socketCount);
  });

  it("Issue #94: same-tier media query changes do not refit or reconnect", async () => {
    installViewportMocks({
      width: 1440,
      primaryCoarsePointer: false,
      anyCoarsePointer: false,
      maxTouchPoints: 0,
    });
    await mountTerminalWithContainer();
    const socketCount = wsInstances.length;

    fakeFitAddon.fit.mockClear();
    updateViewportMock({ primaryCoarsePointer: true });
    await act(async () => {
      emitMediaQueryChange("(pointer: coarse)");
    });

    expect(fakeTerminal.options.fontSize).toBe(13);
    expect(fakeFitAddon.fit).not.toHaveBeenCalled();
    expect(wsInstances.length).toBe(socketCount);
  });

  it("Issue #94: visualViewport resize is refit-only and does not affect font-size tier", async () => {
    const { rectSpy } = await mountTerminalWithContainer();
    const ws = getLatestWs();
    await act(async () => {
      ws.onopen?.();
    });
    const socketCount = wsInstances.length;

    fakeFitAddon.fit.mockClear();
    rectSpy.mockReturnValue(mockRect(850, 400));
    updateViewportMock({ visualViewportWidth: 500 });
    await act(async () => {
      emitVisualViewportResize();
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(fakeTerminal.options.fontSize).toBe(13);
    expect(fakeFitAddon.fit).toHaveBeenCalledTimes(1);
    expect(wsInstances.length).toBe(socketCount);
  });

  it("T29: no theme provided falls back to default", async () => {
    renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));
    await waitForWs();
    expect(terminalConstructorOptions.theme).toBeDefined();
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

  it("T30: ResizeObserver skips zero dimensions, refits when visible, and suppresses unchanged sizes", async () => {
    vi.useFakeTimers();
    try {
      const container = document.createElement("div");

      // Set container ref before rendering so ResizeObserver gets wired up on connect
      const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

      // Advance timer to allow WS creation (fake timers block waitFor)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result.current.containerRef as any).current = container;

      // Trigger retry to wire ResizeObserver with the container
      wsInstances = [];
      await act(async () => {
        result.current.retry();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      const ws = getLatestWs();
      await act(async () => {
        ws.onopen?.();
      });

      fakeFitAddon.fit.mockClear();
      const rectSpy = vi.spyOn(container, "getBoundingClientRect");

      // Simulate collapsed panel (0×0 dimensions)
      rectSpy.mockReturnValue(mockRect(0, 0));

      // Trigger ResizeObserver callback
      expect(resizeObserverCallback).not.toBeNull();
      resizeObserverCallback!();

      // Advance past the 150ms debounce timer
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      // fit() should NOT have been called (zero dimensions)
      expect(fakeFitAddon.fit).not.toHaveBeenCalled();

      // Now simulate non-zero dimensions
      rectSpy.mockReturnValue(mockRect(800, 400));

      resizeObserverCallback!();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      // fit() SHOULD be called once with valid dimensions
      expect(fakeFitAddon.fit).toHaveBeenCalledTimes(1);

      // Repeating the same dimensions should not refit.
      resizeObserverCallback!();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(fakeFitAddon.fit).toHaveBeenCalledTimes(1);

      // A real size change should fit again.
      rectSpy.mockReturnValue(mockRect(900, 400));
      resizeObserverCallback!();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(fakeFitAddon.fit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  describe("buildWsUrl with worktree", () => {
    it("T16: includes worktree param when provided", async () => {
      renderHook(() => useTerminal({ slug: "demo", worktree: ".trees/feat" }));
      const ws = await waitForWs();
      const url = new URL(ws.url);
      expect(url.searchParams.get("worktree")).toBe(".trees/feat");
      expect(url.searchParams.get("slug")).toBe("demo");
    });

    it("T17: omits worktree param when undefined", async () => {
      renderHook(() => useTerminal({ slug: "demo" }));
      const ws = await waitForWs();
      const url = new URL(ws.url);
      expect(url.searchParams.has("worktree")).toBe(false);
      expect(url.searchParams.get("slug")).toBe("demo");
    });
  });

  describe("copilotStatus", () => {
    it("T6: defaults to idle", () => {
      const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));
      expect(result.current.copilotStatus).toBe("idle");
    });

    it("T7: updates on receiving status frame", async () => {
      const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));
      const ws = await waitForWs();

      await act(async () => {
        ws.onopen?.();
      });

      await act(async () => {
        ws.onmessage?.({
          data: JSON.stringify({ type: "status", copilotState: "running" }),
        });
      });
      expect(result.current.copilotStatus).toBe("running");

      await act(async () => {
        ws.onmessage?.({
          data: JSON.stringify({ type: "status", copilotState: "waiting" }),
        });
      });
      expect(result.current.copilotStatus).toBe("waiting");
    });

    it("T8: resets to idle on reconnect", async () => {
      vi.useFakeTimers();
      try {
        const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

        await vi.advanceTimersByTimeAsync(10);
        const ws = getLatestWs();

        await act(async () => {
          ws.onopen?.();
        });

        await act(async () => {
          ws.onmessage?.({
            data: JSON.stringify({ type: "status", copilotState: "running" }),
          });
        });
        expect(result.current.copilotStatus).toBe("running");

        // Trigger reconnect (non-4401 close)
        await act(async () => {
          ws._triggerClose(1006, "abnormal");
        });

        // Advance past reconnect delay (1s for first attempt)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1100);
        });

        // After reconnect starts, copilotStatus should reset to idle
        expect(result.current.copilotStatus).toBe("idle");
      } finally {
        vi.useRealTimers();
      }
    });

    it("T8b: resets to idle immediately on ws.onclose (before reconnect)", async () => {
      vi.useFakeTimers();
      try {
        const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

        await vi.advanceTimersByTimeAsync(10);
        const ws = getLatestWs();

        await act(async () => {
          ws.onopen?.();
        });

        await act(async () => {
          ws.onmessage?.({
            data: JSON.stringify({ type: "status", copilotState: "running" }),
          });
        });
        expect(result.current.copilotStatus).toBe("running");

        // Trigger close — copilotStatus should reset immediately
        await act(async () => {
          ws._triggerClose(1006, "abnormal");
        });

        expect(result.current.copilotStatus).toBe("idle");
      } finally {
        vi.useRealTimers();
      }
    });

    it("T8c: resets to idle on unauthorized close (4401)", async () => {
      vi.useFakeTimers();
      try {
        const { result } = renderHook(() => useTerminal({ wsUrl: "ws://test:3100" }));

        await vi.advanceTimersByTimeAsync(10);
        const ws = getLatestWs();

        await act(async () => {
          ws.onopen?.();
        });

        await act(async () => {
          ws.onmessage?.({
            data: JSON.stringify({ type: "status", copilotState: "waiting" }),
          });
        });
        expect(result.current.copilotStatus).toBe("waiting");

        // Trigger unauthorized close — copilotStatus should reset
        await act(async () => {
          ws._triggerClose(4401, "Unauthorized");
        });

        expect(result.current.copilotStatus).toBe("idle");
        expect(result.current.status).toBe("failed");
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
