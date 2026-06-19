// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { MockWorktreeResolutionError } = vi.hoisted(() => {
  class MockWorktreeResolutionError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status: number,
    ) {
      super(message);
      this.name = "WorktreeResolutionError";
    }
  }

  return { MockWorktreeResolutionError };
});

vi.mock("@/lib/worktree-utils", () => ({
  resolveWorktreeRoot: vi.fn(async (slug: string, worktree?: string | null) =>
    worktree ? `/repo/${slug}/${worktree}` : `/repo/${slug}`,
  ),
  normalizeHttpWorktree: vi.fn((worktree: string) => {
    const trimmed = worktree.trim();
    if (!trimmed || trimmed.includes("..") || trimmed.startsWith("/")) {
      throw new MockWorktreeResolutionError(
        "INVALID_WORKTREE",
        "Invalid 'worktree' parameter",
        400,
      );
    }
    return trimmed.startsWith(".trees/") ? trimmed.slice(".trees/".length) : trimmed;
  }),
  WorktreeResolutionError: MockWorktreeResolutionError,
}));

vi.mock("fs/promises", () => ({
  default: {
    realpath: vi.fn(async (target: string) => target),
  },
}));

import {
  FILE_TREE_SYNC_DEBOUNCE_MS,
  FILE_TREE_SYNC_FORCE_FLUSH_MS,
  getFileTreeSyncRegistrySnapshotForTests,
  resetFileTreeSyncForTests,
  setFileTreeSyncLimitsForTests,
  setFileTreeSyncWatchFactoryForTests,
  subscribeFileTreeChanges,
} from "./file-tree-sync";
import type { FileTreeChangedEvent, FileTreeDegradedEvent } from "@/lib/types";

type Handler = (...args: never[]) => void;

class MockWatcher {
  readonly handlers = new Map<string, Handler[]>();
  readonly close = vi.fn(async () => undefined);

  on(eventName: string, handler: Handler) {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
    return this;
  }

  emit(eventName: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(eventName) ?? []) {
      handler(...(args as never[]));
    }
  }
}

const watchers: MockWatcher[] = [];

function installMockWatchFactory() {
  setFileTreeSyncWatchFactoryForTests(() => {
    const watcher = new MockWatcher();
    watchers.push(watcher);
    return watcher;
  });
}

beforeEach(async () => {
  vi.useFakeTimers();
  watchers.length = 0;
  await resetFileTreeSyncForTests();
  installMockWatchFactory();
});

afterEach(async () => {
  vi.useRealTimers();
  await resetFileTreeSyncForTests();
});

describe("file-tree sync watcher helper", () => {
  it("shares watchers by normalized scope and ref-counts subscriber cleanup", async () => {
    const firstEvents: FileTreeChangedEvent[] = [];
    const secondEvents: FileTreeChangedEvent[] = [];

    const first = await subscribeFileTreeChanges({
      slug: "demo",
      worktree: ".trees/feature",
      onChange: (event) => firstEvents.push(event),
    });
    const second = await subscribeFileTreeChanges({
      slug: "demo",
      worktree: "feature",
      onChange: (event) => secondEvents.push(event),
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(watchers).toHaveLength(1);
    expect(getFileTreeSyncRegistrySnapshotForTests()).toMatchObject([
      { scope: { slug: "demo", worktree: ".trees/feature" }, subscriberCount: 2 },
    ]);

    watchers[0].emit("add", "/repo/demo/.trees/feature/src/index.ts");
    vi.advanceTimersByTime(FILE_TREE_SYNC_DEBOUNCE_MS);

    expect(firstEvents).toHaveLength(1);
    expect(secondEvents).toHaveLength(1);
    expect(firstEvents[0]).toMatchObject({
      paths: ["src/index.ts"],
      directories: ["src"],
      rootChanged: false,
    });

    if (first.ok) first.unsubscribe();
    expect(watchers[0].close).not.toHaveBeenCalled();

    if (second.ok) second.unsubscribe();
    expect(watchers[0].close).toHaveBeenCalledTimes(1);
    expect(getFileTreeSyncRegistrySnapshotForTests()).toEqual([]);
  });

  it("redacts absolute and raw .git paths while surfacing safe git metadata invalidation", async () => {
    const events: FileTreeChangedEvent[] = [];
    const subscription = await subscribeFileTreeChanges({
      slug: "demo",
      onChange: (event) => events.push(event),
    });
    expect(subscription.ok).toBe(true);

    watchers[0].emit("add", "/repo/demo/src\\windows.ts");
    watchers[0].emit("change", "/repo/demo/.git/objects/aa/bb");
    vi.advanceTimersByTime(FILE_TREE_SYNC_DEBOUNCE_MS);

    expect(events).toHaveLength(1);
    expect(events[0].paths).toEqual(["src/windows.ts"]);
    expect(JSON.stringify(events[0])).not.toContain("/repo/demo");
    expect(JSON.stringify(events[0])).not.toContain(".git");

    events.length = 0;
    watchers[0].emit("change", "/repo/demo/.git/index");
    vi.advanceTimersByTime(FILE_TREE_SYNC_DEBOUNCE_MS);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      paths: [],
      directories: [],
      rootChanged: true,
      gitStatusChanged: true,
      truncated: false,
    });
    expect(JSON.stringify(events[0])).not.toContain(".git/index");
  });

  it("debounces bursts, force-flushes long bursts, and caps path hints", async () => {
    const events: FileTreeChangedEvent[] = [];
    const subscription = await subscribeFileTreeChanges({
      slug: "demo",
      onChange: (event) => events.push(event),
    });
    expect(subscription.ok).toBe(true);

    watchers[0].emit("add", "/repo/demo/a.ts");
    vi.advanceTimersByTime(FILE_TREE_SYNC_DEBOUNCE_MS - 1);
    expect(events).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(events).toHaveLength(1);
    expect(events[0].paths).toEqual(["a.ts"]);

    events.length = 0;
    watchers[0].emit("add", "/repo/demo/long-0.ts");
    for (let i = 1; i <= 4; i += 1) {
      vi.advanceTimersByTime(FILE_TREE_SYNC_DEBOUNCE_MS - 50);
      watchers[0].emit("add", `/repo/demo/long-${i}.ts`);
    }
    expect(events).toEqual([]);
    vi.advanceTimersByTime(FILE_TREE_SYNC_FORCE_FLUSH_MS - 4 * (FILE_TREE_SYNC_DEBOUNCE_MS - 50));
    expect(events).toHaveLength(1);
    expect(events[0].paths).toContain("long-0.ts");
    expect(events[0].paths).toContain("long-4.ts");

    events.length = 0;
    for (let i = 0; i < 300; i += 1) {
      watchers[0].emit("add", `/repo/demo/generated/file-${i}.ts`);
    }
    vi.advanceTimersByTime(FILE_TREE_SYNC_DEBOUNCE_MS);

    expect(events).toHaveLength(1);
    expect(events[0].paths).toHaveLength(256);
    expect(events[0].directories).toEqual(["generated"]);
    expect(events[0]).toMatchObject({ truncated: true, rootChanged: true });
  });

  it("returns degraded results for resource caps without leaking watcher instances", async () => {
    setFileTreeSyncLimitsForTests({ maxWatchedRoots: 1, maxSubscribersPerWatcher: 1 });

    const first = await subscribeFileTreeChanges({
      slug: "one",
      onChange: () => undefined,
    });
    expect(first.ok).toBe(true);
    expect(watchers).toHaveLength(1);

    const tooManySubscribers = await subscribeFileTreeChanges({
      slug: "one",
      onChange: () => undefined,
    });
    expect(tooManySubscribers).toMatchObject({
      ok: false,
      code: "SUBSCRIBER_LIMIT_EXCEEDED",
      pollIntervalMs: 5000,
    });
    expect(watchers).toHaveLength(1);

    const tooManyWatchers = await subscribeFileTreeChanges({
      slug: "two",
      onChange: () => undefined,
    });
    expect(tooManyWatchers).toMatchObject({
      ok: false,
      code: "WATCHER_LIMIT_EXCEEDED",
      pollIntervalMs: 5000,
    });
    expect(watchers).toHaveLength(1);
    expect(getFileTreeSyncRegistrySnapshotForTests()).toHaveLength(1);
  });

  it("cleans up subscribers on abort and forwards watcher degraded errors", async () => {
    const degradedEvents: FileTreeDegradedEvent[] = [];
    const controller = new AbortController();
    const subscription = await subscribeFileTreeChanges({
      slug: "demo",
      onChange: () => undefined,
      onDegraded: (event) => degradedEvents.push(event),
      signal: controller.signal,
    });
    expect(subscription.ok).toBe(true);

    watchers[0].emit("error", new Error("native watcher failed"));
    expect(degradedEvents).toMatchObject([
      {
        type: "file-tree:degraded",
        code: "WATCHER_ERROR",
        pollIntervalMs: 5000,
        scope: { slug: "demo", worktree: null },
      },
    ]);

    controller.abort();
    expect(watchers[0].close).toHaveBeenCalledTimes(1);
    expect(getFileTreeSyncRegistrySnapshotForTests()).toEqual([]);
  });

  it("removes abort listeners when subscribers manually unsubscribe before abort", async () => {
    const controller = new AbortController();
    const addAbortListener = vi.spyOn(controller.signal, "addEventListener");
    const removeAbortListener = vi.spyOn(controller.signal, "removeEventListener");

    const subscription = await subscribeFileTreeChanges({
      slug: "demo",
      onChange: () => undefined,
      signal: controller.signal,
    });

    expect(subscription.ok).toBe(true);
    expect(addAbortListener).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });

    if (subscription.ok) subscription.unsubscribe();

    expect(removeAbortListener).toHaveBeenCalledWith("abort", expect.any(Function));
    controller.abort();
    expect(watchers[0].close).toHaveBeenCalledTimes(1);
  });
});
