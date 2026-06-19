// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { WorktreeResolutionError } from "@/lib/worktree-utils";
import type { FileTreeChangedEvent, FileTreeDegradedEvent } from "@/lib/types";

const helperMocks = vi.hoisted(() => ({
  resolveFileTreeSyncScope: vi.fn(),
  subscribeFileTreeChanges: vi.fn(),
}));

vi.mock("@/server/file-tree-sync", () => ({
  FILE_TREE_SYNC_FALLBACK_POLL_INTERVAL_MS: 5000,
  resolveFileTreeSyncScope: helperMocks.resolveFileTreeSyncScope,
  subscribeFileTreeChanges: helperMocks.subscribeFileTreeChanges,
}));

import { GET } from "./route";

const scope = { slug: "demo", worktree: null };
const decoder = new TextDecoder();

function request(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url), init);
}

async function readText(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const chunk = await reader.read();
  return decoder.decode(chunk.value);
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DEVDECK_TOKEN;
  helperMocks.resolveFileTreeSyncScope.mockResolvedValue({
    scope,
    root: "/repo/demo",
  });
});

afterEach(() => {
  delete process.env.DEVDECK_TOKEN;
  vi.useRealTimers();
});

describe("GET /api/files/events", () => {
  it("streams ready, changed, and degraded SSE events with safe relative payloads", async () => {
    let onChange: ((event: FileTreeChangedEvent) => void) | undefined;
    let onDegraded: ((event: FileTreeDegradedEvent) => void) | undefined;
    const unsubscribe = vi.fn();
    helperMocks.subscribeFileTreeChanges.mockImplementation(async (options) => {
      onChange = options.onChange;
      onDegraded = options.onDegraded;
      return { ok: true, scope, unsubscribe };
    });

    const res = await GET(request("http://localhost:3000/api/files/events?slug=demo"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(helperMocks.subscribeFileTreeChanges).toHaveBeenCalledTimes(1);

    const reader = res.body!.getReader();
    const ready = await readText(reader);
    expect(ready).toContain("event: file-tree:ready");
    expect(ready).toContain('"pollIntervalMs":5000');
    expect(ready).not.toContain("/repo/demo");

    onChange?.({
      type: "file-tree:changed",
      scope,
      paths: ["src/index.ts", "/repo/demo/secret.ts", ".git/index"],
      directories: ["src", ".git"],
      rootChanged: false,
      gitStatusChanged: true,
      truncated: false,
      version: 1,
    });
    const changed = await readText(reader);
    expect(changed).toContain("event: file-tree:changed");
    expect(changed).toContain("src/index.ts");
    expect(changed).toContain('"truncated":true');
    expect(changed).not.toContain("/repo/demo");
    expect(changed).not.toContain(".git/index");

    onDegraded?.({
      type: "file-tree:degraded",
      scope,
      code: "WATCHER_ERROR",
      message: "Watcher degraded",
      retryAfterMs: 1000,
      pollIntervalMs: 5000,
    });
    const degraded = await readText(reader);
    expect(degraded).toContain("event: file-tree:degraded");
    expect(degraded).toContain("WATCHER_ERROR");

    await reader.cancel();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("validates preflight requests without allocating a watcher", async () => {
    helperMocks.resolveFileTreeSyncScope.mockResolvedValueOnce({
      scope: { slug: "demo", worktree: ".trees/feat" },
      root: "/repo/demo/.trees/feat",
    });

    const res = await GET(
      request("http://localhost:3000/api/files/events?slug=demo&worktree=.trees/feat&preflight=1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      scope: { slug: "demo", worktree: ".trees/feat" },
      pollIntervalMs: 5000,
    });
    expect(helperMocks.resolveFileTreeSyncScope).toHaveBeenCalledWith("demo", ".trees/feat");
    expect(helperMocks.subscribeFileTreeChanges).not.toHaveBeenCalled();
  });

  it("rejects invalid preflight scopes before watcher allocation", async () => {
    helperMocks.resolveFileTreeSyncScope.mockRejectedValueOnce(
      new WorktreeResolutionError("INVALID_WORKTREE", "Invalid 'worktree' parameter", 400),
    );

    const res = await GET(
      request("http://localhost:3000/api/files/events?slug=demo&worktree=../bad&preflight=1"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: "INVALID_WORKTREE" });
    expect(helperMocks.subscribeFileTreeChanges).not.toHaveBeenCalled();
  });

  it.each([
    ["missing slug", "http://localhost:3000/api/files/events", 400, "MISSING_PARAMETERS"],
    ["invalid slug", "http://localhost:3000/api/files/events?slug=../bad", 400, "INVALID_SLUG"],
  ])("rejects %s without watcher allocation", async (_label, url, status, code) => {
    const res = await GET(request(url));

    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toMatchObject({ code });
    expect(helperMocks.resolveFileTreeSyncScope).not.toHaveBeenCalled();
    expect(helperMocks.subscribeFileTreeChanges).not.toHaveBeenCalled();
  });

  it("rejects auth and origin failures before watcher allocation", async () => {
    process.env.DEVDECK_TOKEN = "secret";
    const auth = await GET(request("http://localhost:3000/api/files/events?slug=demo"));
    expect(auth.status).toBe(401);
    await expect(auth.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED" });

    delete process.env.DEVDECK_TOKEN;
    const origin = await GET(
      request("http://localhost:3000/api/files/events?slug=demo", {
        headers: { Origin: "http://evil.example" },
      }),
    );
    expect(origin.status).toBe(403);
    await expect(origin.json()).resolves.toMatchObject({ code: "INVALID_ORIGIN" });

    expect(helperMocks.resolveFileTreeSyncScope).not.toHaveBeenCalled();
    expect(helperMocks.subscribeFileTreeChanges).not.toHaveBeenCalled();
  });

  it("rejects missing projects and invalid worktrees as structured errors without subscribing", async () => {
    helperMocks.resolveFileTreeSyncScope.mockRejectedValueOnce(
      new WorktreeResolutionError("WORKTREE_NOT_FOUND", "Worktree not found", 404),
    );
    const worktree = await GET(
      request("http://localhost:3000/api/files/events?slug=demo&worktree=.trees/missing"),
    );
    expect(worktree.status).toBe(404);
    await expect(worktree.json()).resolves.toMatchObject({ code: "WORKTREE_NOT_FOUND" });

    helperMocks.resolveFileTreeSyncScope.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    );
    const project = await GET(request("http://localhost:3000/api/files/events?slug=missing"));
    expect(project.status).toBe(404);
    await expect(project.json()).resolves.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(helperMocks.subscribeFileTreeChanges).not.toHaveBeenCalled();
  });

  it("streams setup degradation and cleans up when the request aborts", async () => {
    const unsubscribe = vi.fn();
    helperMocks.subscribeFileTreeChanges.mockResolvedValueOnce({
      ok: false,
      scope,
      code: "WATCHER_LIMIT_EXCEEDED",
      message: "Too many watchers",
      retryAfterMs: 1000,
      pollIntervalMs: 5000,
    });

    const degradedRes = await GET(request("http://localhost:3000/api/files/events?slug=demo"));
    const degradedReader = degradedRes.body!.getReader();
    const degraded = await readText(degradedReader);
    expect(degraded).toContain("event: file-tree:degraded");
    expect(degraded).toContain("WATCHER_LIMIT_EXCEEDED");
    expect(await degradedReader.read()).toMatchObject({ done: true });

    helperMocks.subscribeFileTreeChanges.mockImplementationOnce(async () => ({
      ok: true,
      scope,
      unsubscribe,
    }));
    const controller = new AbortController();
    const res = await GET(
      request("http://localhost:3000/api/files/events?slug=demo", {
        signal: controller.signal,
      }),
    );
    const reader = res.body!.getReader();
    await readText(reader);
    controller.abort();
    await Promise.resolve();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
