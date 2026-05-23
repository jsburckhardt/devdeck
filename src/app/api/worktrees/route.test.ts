// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/registry", () => ({
  resolveProjectPath: vi.fn(),
}));

vi.mock("child_process", () => ({
  execFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, out: { stdout: string }) => void,
    ) => cb(null, { stdout: "" }),
  ),
}));

import { execFile } from "child_process";
import { NextRequest } from "next/server";
import { resolveProjectPath } from "@/lib/registry";
import { GET } from "./route";

const mockResolveProjectPath = vi.mocked(resolveProjectPath);
const mockExecFile = vi.mocked(execFile);

function request(slug?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/worktrees");
  if (slug) url.searchParams.set("slug", slug);
  return new NextRequest(url);
}

const PORCELAIN_MULTI = `worktree /projects/demo
HEAD abc123def456
branch refs/heads/main

worktree /projects/demo/.trees/feat-login
HEAD def456abc789
branch refs/heads/feat-login

worktree /projects/demo/.trees/fix-bug
HEAD 789abc123def
detached

`;

const PORCELAIN_MAIN_ONLY = `worktree /projects/demo
HEAD abc123def456
branch refs/heads/main

`;

describe("GET /api/worktrees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProjectPath.mockResolvedValue("/projects/demo");
    mockExecFile.mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: unknown,
    ) => {
      (cb as (err: Error | null, out: { stdout: string }) => void)(null, { stdout: "" });
    }) as unknown as typeof execFile);
  });

  it("T1: returns worktrees from porcelain output, filtering main worktree", async () => {
    mockExecFile.mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: unknown,
    ) => {
      (cb as (err: Error | null, out: { stdout: string }) => void)(null, {
        stdout: PORCELAIN_MULTI,
      });
    }) as unknown as typeof execFile);

    const res = await GET(request("demo"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({ name: "feat-login", branch: "feat-login" });
    expect(body[1]).toEqual({ name: "fix-bug", branch: "(detached)" });
  });

  it("T2: returns empty array when no .trees/ worktrees exist", async () => {
    mockExecFile.mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: unknown,
    ) => {
      (cb as (err: Error | null, out: { stdout: string }) => void)(null, {
        stdout: PORCELAIN_MAIN_ONLY,
      });
    }) as unknown as typeof execFile);

    const res = await GET(request("demo"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("T3: returns empty array on git error", async () => {
    mockExecFile.mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: unknown,
    ) => {
      (cb as (err: Error | null, out: { stdout: string }) => void)(new Error("git not found"), {
        stdout: "",
      });
    }) as unknown as typeof execFile);

    const res = await GET(request("demo"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("T4: returns 400 for missing slug", async () => {
    const res = await GET(request());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("MISSING_SLUG");
  });

  it("T5: returns 404 for invalid slug", async () => {
    mockResolveProjectPath.mockRejectedValue(new Error("not found"));

    const res = await GET(request("nonexistent"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("PROJECT_NOT_FOUND");
  });

  it("T27: includes Cache-Control header", async () => {
    const res = await GET(request("demo"));
    expect(res.headers.get("Cache-Control")).toContain("private");
  });
});
