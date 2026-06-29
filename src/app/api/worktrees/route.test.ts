// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/registry", () => ({
  resolveProjectRecord: vi.fn(),
}));

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("fs/promises");

import { execFile } from "child_process";
import fs from "fs/promises";
import { NextRequest } from "next/server";
import { resolveProjectRecord } from "@/lib/registry";
import { worktreeIdForCanonicalKey } from "@/lib/worktree-utils";
import { GET } from "./route";

const mockResolveProjectRecord = vi.mocked(resolveProjectRecord);
const mockExecFile = vi.mocked(execFile);
const mockFs = vi.mocked(fs);

function request(slug?: string, activeWorktree?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/worktrees");
  if (slug) url.searchParams.set("slug", slug);
  if (activeWorktree) url.searchParams.set("activeWorktree", activeWorktree);
  return new NextRequest(url);
}

const PORCELAIN_MULTI = `worktree /projects/demo
HEAD abc123def456
branch refs/heads/main

worktree /projects/demo/.trees/feat-login
HEAD def456abc789
branch refs/heads/feat-login

worktree /outside/fix-bug
HEAD 789abc123def
detached

`;

const PORCELAIN_MAIN_ONLY = `worktree /projects/demo
HEAD abc123def456
branch refs/heads/main

`;

function mockGit(output: string) {
  mockExecFile.mockImplementation(((_cmd: string, _args: string[], _opts: unknown, cb: unknown) => {
    (cb as (err: Error | null, out: { stdout: string }) => void)(null, { stdout: output });
  }) as unknown as typeof execFile);
}

describe("GET /api/worktrees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProjectRecord.mockResolvedValue({
      slug: "demo",
      path: "/projects/demo",
      source: "manual",
      exists: true,
    });
    mockFs.realpath.mockImplementation(async (target) => String(target));
    mockFs.stat.mockResolvedValue({ isDirectory: () => true } as never);
    mockGit("");
  });

  it("returns WorktreeListResponse from porcelain output, filtering main worktree", async () => {
    mockGit(PORCELAIN_MULTI);

    const res = await GET(request("demo"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("available");
    expect(body.projectSlug).toBe("demo");
    expect(body.root).toEqual({ id: null, name: "Project root", active: true });
    expect(body.worktrees).toHaveLength(2);
    expect(body.worktrees[0]).toMatchObject({
      id: worktreeIdForCanonicalKey("/projects/demo/.trees/feat-login"),
      name: "feat-login",
      branch: "feat-login",
      head: "def456abc789",
      state: "available",
      repoRelativeLabel: ".trees/feat-login",
      active: false,
    });
    expect(body.worktrees[1]).toMatchObject({
      name: "fix-bug",
      branch: null,
      head: "789abc123def",
      state: "detached",
      repoRelativeLabel: null,
    });
    expect(JSON.stringify(body)).not.toContain("/outside/fix-bug");
  });

  it("returns available response with empty worktrees when no linked worktrees exist", async () => {
    mockGit(PORCELAIN_MAIN_ONLY);

    const res = await GET(request("demo"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      projectSlug: "demo",
      status: "available",
      worktrees: [],
    });
  });

  it("returns not-git status on git errors", async () => {
    mockExecFile.mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: unknown,
    ) => {
      (cb as (err: Error | null, out: { stdout: string }) => void)(new Error("not git"), {
        stdout: "",
      });
    }) as unknown as typeof execFile);

    const res = await GET(request("demo"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("not-git");
    expect(body.worktrees).toEqual([]);
  });

  it("returns project-unavailable for known missing paths", async () => {
    mockResolveProjectRecord.mockResolvedValue({
      slug: "demo",
      path: "/projects/demo",
      source: "manual",
      exists: false,
    });

    const res = await GET(request("demo"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("project-unavailable");
  });

  it("returns 400 for missing slug", async () => {
    const res = await GET(request());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("MISSING_SLUG");
  });

  it("returns 404 for unknown slug", async () => {
    mockResolveProjectRecord.mockResolvedValue(null);

    const res = await GET(request("nonexistent"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PROJECT_NOT_FOUND");
  });

  it("includes Cache-Control header", async () => {
    const res = await GET(request("demo"));
    expect(res.headers.get("Cache-Control")).toContain("private");
  });
});
