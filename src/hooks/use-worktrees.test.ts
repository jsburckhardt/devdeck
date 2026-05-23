import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useWorktrees } from "./use-worktrees";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch;
});

afterEach(() => {
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
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
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
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
