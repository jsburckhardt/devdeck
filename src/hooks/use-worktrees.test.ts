import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useWorktrees } from "./use-worktrees";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mockSuccess(data: unknown[]) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockError() {
  mockFetch.mockRejectedValue(new Error("Network error"));
}

function mockPendingFetch() {
  const resolvers: Array<
    (response: { ok: boolean; status?: number; json: () => Promise<unknown> }) => void
  > = [];
  mockFetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvers.push(resolve);
      }),
  );
  return resolvers;
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useWorktrees", () => {
  it("T6: successful fetch populates worktrees", async () => {
    const data = [{ name: "feat", branch: "feat" }];
    mockSuccess(data);

    const { result } = renderHook(() => useWorktrees("demo"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.worktrees).toEqual(data);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/worktrees?slug=demo",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });

  it("T7: fetch error sets error and worktrees remains []", async () => {
    mockError();

    const { result } = renderHook(() => useWorktrees("demo"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.worktrees).toEqual([]);
    expect(result.current.error).toBe("Network error");
  });

  it("T8: refresh triggers re-fetch", async () => {
    const data = [{ name: "feat", branch: "feat" }];
    mockSuccess(data);

    const { result } = renderHook(() => useWorktrees("demo"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/worktrees?slug=demo",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });

  it("returns empty array when slug is undefined", () => {
    const { result } = renderHook(() => useWorktrees(undefined));

    expect(result.current.worktrees).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("slug change triggers re-fetch", async () => {
    const data = [{ name: "feat", branch: "feat" }];
    mockSuccess(data);

    const { result, rerender } = renderHook(({ slug }) => useWorktrees(slug), {
      initialProps: { slug: "demo" as string | undefined },
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    rerender({ slug: "other" });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/worktrees?slug=other",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });

  it("Issue #81 T2: interval polling refreshes worktrees with no-store fetches", async () => {
    vi.useFakeTimers();
    mockSuccess([{ name: "feat", branch: "feat" }]);

    const { result } = renderHook(() => useWorktrees("demo"));
    await flushPromises();

    expect(result.current.worktrees).toEqual([{ name: "feat", branch: "feat" }]);
    mockFetch.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/worktrees?slug=demo",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });

  it("Issue #81 T2: pauses worktree polling while hidden and catches up when visible", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const addListener = vi.spyOn(document, "addEventListener");
    const removeListener = vi.spyOn(document, "removeEventListener");
    mockSuccess([{ name: "feat", branch: "feat" }]);

    const { unmount } = renderHook(() => useWorktrees("demo"));
    await flushPromises();
    mockFetch.mockClear();

    visibility.mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    expect(mockFetch).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await flushPromises();
    expect(mockFetch).toHaveBeenCalledTimes(2);

    unmount();
    expect(addListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });

  it("Issue #81 T2: skips same-slug polling while a request is already in flight", async () => {
    vi.useFakeTimers();
    const resolvers = mockPendingFetch();

    const { result } = renderHook(() => useWorktrees("demo"));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0]({
        ok: true,
        json: () => Promise.resolve([{ name: "feat", branch: "feat" }]),
      });
    });
    await flushPromises();

    expect(result.current.worktrees).toEqual([{ name: "feat", branch: "feat" }]);
  });

  it("Issue #81 T2: disables polling and resets state when slug is undefined", async () => {
    vi.useFakeTimers();
    const resolvers = mockPendingFetch();

    const { result, rerender } = renderHook(({ slug }) => useWorktrees(slug), {
      initialProps: { slug: "demo" as string | undefined },
    });
    const initialSignal = (mockFetch.mock.calls[0][1] as RequestInit).signal as AbortSignal;

    rerender({ slug: undefined });

    expect(initialSignal.aborted).toBe(true);
    expect(result.current.worktrees).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0]({
        ok: true,
        json: () => Promise.resolve([{ name: "stale", branch: "stale" }]),
      });
    });
    await flushPromises();
    expect(result.current.worktrees).toEqual([]);
  });

  it("Issue #81 T2: aborts stale slug requests and ignores their late responses", async () => {
    const resolvers = mockPendingFetch();

    const { result, rerender } = renderHook(({ slug }) => useWorktrees(slug), {
      initialProps: { slug: "demo" as string | undefined },
    });
    const staleSignal = (mockFetch.mock.calls[0][1] as RequestInit).signal as AbortSignal;

    rerender({ slug: "other" });

    expect(staleSignal.aborted).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvers[0]({
        ok: true,
        json: () => Promise.resolve([{ name: "stale", branch: "stale" }]),
      });
    });
    await flushPromises();

    expect(result.current.worktrees).toEqual([]);

    await act(async () => {
      resolvers[1]({
        ok: true,
        json: () => Promise.resolve([{ name: "current", branch: "current" }]),
      });
    });

    await waitFor(() => {
      expect(result.current.worktrees).toEqual([{ name: "current", branch: "current" }]);
    });
  });

  it("Issue #81 T2: aborts pending requests and removes visibility listeners on unmount", () => {
    vi.useFakeTimers();
    mockPendingFetch();
    const removeListener = vi.spyOn(document, "removeEventListener");

    const { unmount } = renderHook(() => useWorktrees("demo"));
    const signal = (mockFetch.mock.calls[0][1] as RequestInit).signal as AbortSignal;

    unmount();

    expect(signal.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("Issue #81 T3: preserves the existing worktree list on transient poll failures", async () => {
    vi.useFakeTimers();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ name: "feat", branch: "feat" }]),
      })
      .mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useWorktrees("demo"));
    await flushPromises();

    expect(result.current.worktrees).toEqual([{ name: "feat", branch: "feat" }]);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await flushPromises();

    expect(result.current.error).toBe("Network error");
    expect(result.current.worktrees).toEqual([{ name: "feat", branch: "feat" }]);
    expect(result.current.loading).toBe(false);
  });
});
