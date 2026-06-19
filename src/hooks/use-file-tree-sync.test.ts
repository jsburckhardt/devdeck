import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileTreeChangedEvent, FileTreeDegradedEvent, FileTreeReadyEvent } from "@/lib/types";
import { useFileTreeSync } from "./use-file-tree-sync";

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;
  close = vi.fn(() => {
    this.readyState = 2;
  });

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(eventName: string, listener: (event: MessageEvent) => void) {
    const listeners = this.listeners.get(eventName) ?? [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
  }

  emitOpen() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  emitError(init: { status?: number; code?: string; message?: string } = {}) {
    const event = new Event("error") as Event & {
      status?: number;
      code?: string;
      message?: string;
    };
    if (init.status !== undefined) event.status = init.status;
    if (init.code !== undefined) event.code = init.code;
    if (init.message !== undefined) event.message = init.message;
    this.onerror?.(event);
  }

  emit(eventName: string, payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent;
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener(event);
    }
  }

  emitRaw(eventName: string, data: string) {
    const event = { data } as MessageEvent;
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener(event);
    }
  }
}

const scope = { slug: "demo", worktree: ".trees/feat" };
const readyEvent: FileTreeReadyEvent = {
  type: "file-tree:ready",
  scope,
  pollIntervalMs: 5000,
};
const changedEvent: FileTreeChangedEvent = {
  type: "file-tree:changed",
  scope,
  paths: ["src/index.ts"],
  directories: ["src"],
  rootChanged: false,
  gitStatusChanged: false,
  truncated: false,
  version: 1,
};
const degradedEvent: FileTreeDegradedEvent = {
  type: "file-tree:degraded",
  scope,
  code: "WATCHER_ERROR",
  message: "Watcher failed",
  retryAfterMs: 1000,
  pollIntervalMs: 5000,
};

let fetchMock: ReturnType<typeof vi.fn>;

function preflightOkResponse(nextScope = scope): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      scope: nextScope,
      pollIntervalMs: 5000,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function preflightErrorResponse(status: number, code: string, error: string): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setPreflightOk(nextScope = scope) {
  fetchMock.mockImplementation(() => Promise.resolve(preflightOkResponse(nextScope)));
}

async function flushPreflight() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setup(overrides: Partial<Parameters<typeof useFileTreeSync>[0]> = {}) {
  const onStatusChange = vi.fn();
  const onFallbackChange = vi.fn();
  const onReady = vi.fn().mockResolvedValue(undefined);
  const onChanged = vi.fn().mockResolvedValue(undefined);
  const eventSourceFactory = vi.fn(
    (url: string) => new MockEventSource(url) as unknown as EventSource,
  );

  const renderResult = renderHook(
    (props: { retryNonce: number; slug?: string; worktree?: string | null }) =>
      useFileTreeSync({
        slug: props.slug ?? "demo",
        worktree: props.worktree === undefined ? ".trees/feat" : props.worktree,
        retryNonce: props.retryNonce,
        onStatusChange,
        onFallbackChange,
        onReady,
        onChanged,
        heartbeatTimeoutMs: 10000,
        eventSourceFactory,
        ...overrides,
      }),
    {
      initialProps: { retryNonce: 0, slug: "demo", worktree: ".trees/feat" },
    },
  );

  return {
    ...renderResult,
    onStatusChange,
    onFallbackChange,
    onReady,
    onChanged,
    eventSourceFactory,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  MockEventSource.instances = [];
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  setPreflightOk();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useFileTreeSync", () => {
  it("preflights validation, constructs scoped URLs, and handles ready/changed/degraded events", async () => {
    const { onStatusChange, onFallbackChange, onReady, onChanged } = setup();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/events?slug=demo&worktree=.trees%2Ffeat&preflight=1",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(MockEventSource.instances).toHaveLength(0);
    await flushPreflight();

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe(
      "/api/files/events?slug=demo&worktree=.trees%2Ffeat",
    );
    expect(onStatusChange).toHaveBeenCalledWith("connecting", null);

    await act(async () => {
      MockEventSource.instances[0].emitOpen();
      MockEventSource.instances[0].emit("file-tree:ready", readyEvent);
      await Promise.resolve();
    });

    expect(onReady).toHaveBeenCalledWith(scope);
    await act(async () => {
      MockEventSource.instances[0].emit("file-tree:ready", readyEvent);
      await Promise.resolve();
    });
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenLastCalledWith("ready", null);
    expect(onFallbackChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      MockEventSource.instances[0].emit("file-tree:changed", changedEvent);
      await Promise.resolve();
    });

    expect(onChanged).toHaveBeenCalledWith(changedEvent);
    expect(onStatusChange).toHaveBeenCalledWith("syncing", null);
    expect(onStatusChange).toHaveBeenLastCalledWith("ready", null);

    act(() => {
      MockEventSource.instances[0].emit("file-tree:degraded", degradedEvent);
    });

    expect(onStatusChange).toHaveBeenLastCalledWith(
      "degraded",
      expect.objectContaining({ code: "WATCHER_ERROR", retryable: true, pollIntervalMs: 5000 }),
    );
    expect(onFallbackChange).toHaveBeenLastCalledWith(true);
    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
  });

  it("ignores stale scopes and retries parse/network/heartbeat failures before fallback", async () => {
    const { onStatusChange, onFallbackChange, onReady, onChanged } = setup();
    await flushPreflight();

    act(() => {
      MockEventSource.instances[0].emit("file-tree:ready", {
        ...readyEvent,
        scope: { slug: "other", worktree: ".trees/feat" },
      });
      MockEventSource.instances[0].emit("file-tree:changed", {
        ...changedEvent,
        scope: { slug: "other", worktree: ".trees/feat" },
      });
    });
    expect(onReady).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();

    act(() => {
      MockEventSource.instances[0].emitRaw("file-tree:ready", "{bad-json");
    });
    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenLastCalledWith(
      "connecting",
      expect.objectContaining({ code: "INVALID_EVENT", retryAfterMs: 1000 }),
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await flushPreflight();
    expect(MockEventSource.instances).toHaveLength(2);

    act(() => {
      MockEventSource.instances[1].emitError({ message: "network" });
    });
    expect(onStatusChange).toHaveBeenLastCalledWith(
      "connecting",
      expect.objectContaining({ code: "STREAM_ERROR", retryAfterMs: 2000 }),
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    await flushPreflight();
    act(() => {
      MockEventSource.instances[2].emitOpen();
      vi.advanceTimersByTime(10000);
    });

    expect(onStatusChange).toHaveBeenLastCalledWith(
      "connecting",
      expect.objectContaining({ code: "HEARTBEAT_TIMEOUT", retryAfterMs: 4000 }),
    );

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    await flushPreflight();
    act(() => {
      MockEventSource.instances[3].emitError({ message: "still down" });
    });

    expect(onStatusChange).toHaveBeenLastCalledWith(
      "degraded",
      expect.objectContaining({ code: "STREAM_RETRY_EXHAUSTED", pollIntervalMs: 5000 }),
    );
    expect(onFallbackChange).toHaveBeenLastCalledWith(true);
  });

  it("keeps accepted ready streams usable when the silent ready refresh fails transiently", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onReady = vi.fn().mockRejectedValue(new Error("transient refresh failure"));
    const { onStatusChange, onFallbackChange } = setup({ onReady });
    await flushPreflight();

    await act(async () => {
      MockEventSource.instances[0].emit("file-tree:ready", readyEvent);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onReady).toHaveBeenCalledWith(scope);
    expect(onFallbackChange).toHaveBeenLastCalledWith(false);
    expect(onStatusChange).toHaveBeenLastCalledWith("ready", null);
    expect(MockEventSource.instances[0].close).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      "Failed to refresh file tree after ready event",
      expect.objectContaining({ slug: "demo", worktree: ".trees/feat" }),
    );
  });

  it.each([
    ["AUTH_REQUIRED", 401, "unauthorized"],
    ["INVALID_ORIGIN", 403, "error"],
    ["INVALID_SLUG", 400, "error"],
    ["INVALID_WORKTREE", 400, "error"],
    ["INVALID_PARAMETERS", 400, "error"],
    ["MISSING_PARAMETERS", 400, "error"],
    ["PROJECT_NOT_FOUND", 404, "error"],
    ["WORKTREE_NOT_FOUND", 404, "error"],
  ] as const)(
    "classifies preflight %s as non-retryable before opening EventSource",
    async (code, status, expectedStatus) => {
      fetchMock.mockResolvedValueOnce(preflightErrorResponse(status, code, code));
      const { onStatusChange, onFallbackChange, eventSourceFactory } = setup();

      await flushPreflight();

      expect(eventSourceFactory).not.toHaveBeenCalled();
      expect(MockEventSource.instances).toHaveLength(0);
      expect(onStatusChange).toHaveBeenLastCalledWith(
        expectedStatus,
        expect.objectContaining({ code, retryable: false }),
      );
      expect(onFallbackChange).toHaveBeenLastCalledWith(false);

      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(MockEventSource.instances).toHaveLength(0);
    },
  );

  it("treats fatal degraded stream events as non-retryable", async () => {
    const { onStatusChange, onFallbackChange } = setup();
    await flushPreflight();

    act(() => {
      MockEventSource.instances[0].emit("file-tree:degraded", {
        ...degradedEvent,
        code: "INVALID_WORKTREE",
        message: "Invalid worktree",
        fatal: true,
      });
    });
    expect(onStatusChange).toHaveBeenLastCalledWith(
      "error",
      expect.objectContaining({ code: "INVALID_WORKTREE", retryable: false }),
    );
    expect(onFallbackChange).toHaveBeenLastCalledWith(false);
  });

  it("manual retry and scope changes close stale EventSource instances", async () => {
    const { rerender } = setup();
    await flushPreflight();
    const first = MockEventSource.instances[0];

    rerender({ retryNonce: 1, slug: "demo", worktree: ".trees/feat" });
    expect(first.close).toHaveBeenCalledTimes(1);
    await flushPreflight();
    expect(MockEventSource.instances).toHaveLength(2);

    const second = MockEventSource.instances[1];
    rerender({ retryNonce: 1, slug: "demo", worktree: null });
    expect(second.close).toHaveBeenCalledTimes(1);
    await flushPreflight();
    expect(MockEventSource.instances[2].url).toBe("/api/files/events?slug=demo");
  });

  it("aborts in-flight preflight on unmount without opening EventSource", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveFetch: ((response: Response) => void) | undefined;
    fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    });

    const { unmount, eventSourceFactory } = setup();
    expect(capturedSignal?.aborted).toBe(false);

    unmount();
    expect(capturedSignal?.aborted).toBe(true);
    resolveFetch?.(preflightOkResponse());
    await flushPreflight();

    expect(eventSourceFactory).not.toHaveBeenCalled();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("aborts stale in-flight preflight on scope change and opens only the latest stream", async () => {
    let firstSignal: AbortSignal | undefined;
    let resolveFirstFetch: ((response: Response) => void) | undefined;
    fetchMock
      .mockImplementationOnce((_url: string, init?: RequestInit) => {
        firstSignal = init?.signal as AbortSignal | undefined;
        return new Promise<Response>((resolve) => {
          resolveFirstFetch = resolve;
        });
      })
      .mockImplementationOnce(() =>
        Promise.resolve(preflightOkResponse({ slug: "demo", worktree: null })),
      );

    const { rerender, eventSourceFactory } = setup();
    rerender({ retryNonce: 0, slug: "demo", worktree: null });
    expect(firstSignal?.aborted).toBe(true);

    resolveFirstFetch?.(preflightOkResponse());
    await flushPreflight();

    expect(eventSourceFactory).toHaveBeenCalledTimes(1);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/files/events?slug=demo");
  });

  it("cleans up duplicate Strict Mode mount streams", async () => {
    const onStatusChange = vi.fn();
    const onFallbackChange = vi.fn();
    const onChanged = vi.fn();
    const eventSourceFactory = vi.fn(
      (url: string) => new MockEventSource(url) as unknown as EventSource,
    );

    renderHook(
      () =>
        useFileTreeSync({
          slug: "demo",
          worktree: null,
          onStatusChange,
          onFallbackChange,
          onChanged,
          eventSourceFactory,
        }),
      { wrapper: StrictMode },
    );

    await flushPreflight();
    expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(1);
    const openInstances = MockEventSource.instances.filter(
      (instance) => instance.close.mock.calls.length === 0,
    );
    expect(openInstances).toHaveLength(1);
  });
});
