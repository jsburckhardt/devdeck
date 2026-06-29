// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/registry", () => ({
  resolveProjectPath: vi.fn(),
}));

vi.mock("fs/promises");

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "child_process";
import fs from "fs/promises";
import { resolveProjectPath } from "@/lib/registry";
import {
  buildWorktreeListResponse,
  normalizeHttpWorktree,
  resolveWorktreeRoot,
  WorktreeResolutionError,
  worktreeIdForCanonicalKey,
} from "./worktree-utils";

const mockFs = vi.mocked(fs);
const mockExecFile = vi.mocked(execFile);
const mockResolveProjectPath = vi.mocked(resolveProjectPath);

const PORCELAIN = `worktree /workspaces/demo
HEAD abc123
branch refs/heads/main

worktree /workspaces/demo/.trees/feature
HEAD def456
branch refs/heads/feature

worktree /tmp/outside-demo
HEAD fedcba
detached

worktree /workspaces/demo/.trees/locked
HEAD 111111
branch refs/heads/locked
locked

`;

function mockGitPorcelain(output = PORCELAIN) {
  mockExecFile.mockImplementation(((_cmd: string, _args: string[], _opts: unknown, cb: unknown) => {
    (cb as (err: Error | null, out: { stdout: string }) => void)(null, { stdout: output });
  }) as unknown as typeof execFile);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveProjectPath.mockResolvedValue("/workspaces/demo");
  mockFs.realpath.mockImplementation(async (target) => String(target));
  mockFs.stat.mockResolvedValue({ isDirectory: () => true } as never);
  mockGitPorcelain();
});

describe("buildWorktreeListResponse", () => {
  it("returns safe-ID summaries without absolute paths and supports outside-.trees worktrees", async () => {
    const response = await buildWorktreeListResponse({
      activeWorktreeId: null,
      porcelain: PORCELAIN,
      projectRoot: "/workspaces/demo",
      projectSlug: "demo",
    });

    expect(response.status).toBe("available");
    expect(response.root).toEqual({ id: null, name: "Project root", active: true });
    expect(response.worktrees).toHaveLength(3);
    expect(response.worktrees[0]).toMatchObject({
      id: worktreeIdForCanonicalKey("/workspaces/demo/.trees/feature"),
      name: "feature",
      branch: "feature",
      head: "def456",
      state: "available",
      repoRelativeLabel: ".trees/feature",
    });
    expect(response.worktrees[1]).toMatchObject({
      name: "outside-demo",
      branch: null,
      state: "detached",
      repoRelativeLabel: null,
    });
    expect(JSON.stringify(response)).not.toContain("/workspaces/demo/.trees/feature");
    expect(JSON.stringify(response)).not.toContain("/tmp/outside-demo");
  });

  it("marks locked worktrees unavailable for selection", async () => {
    const response = await buildWorktreeListResponse({
      porcelain: PORCELAIN,
      projectRoot: "/workspaces/demo",
      projectSlug: "demo",
    });

    expect(response.worktrees.find((worktree) => worktree.name === "locked")).toMatchObject({
      state: "locked",
    });
  });
});

describe("resolveWorktreeRoot", () => {
  it("resolves project root when worktree is absent", async () => {
    await expect(resolveWorktreeRoot("demo")).resolves.toBe("/workspaces/demo");
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("resolves valid safe IDs from current porcelain output", async () => {
    const id = worktreeIdForCanonicalKey("/workspaces/demo/.trees/feature");

    await expect(resolveWorktreeRoot("demo", id)).resolves.toBe("/workspaces/demo/.trees/feature");
    expect(mockExecFile).toHaveBeenCalledWith(
      "git",
      ["worktree", "list", "--porcelain"],
      { cwd: "/workspaces/demo" },
      expect.any(Function),
    );
  });

  it.each(["", "   ", "/etc", "../escape", "feature/../escape", "feature//bad", ".trees/feat"])(
    "rejects invalid worktree value %j",
    async (value) => {
      await expect(resolveWorktreeRoot("demo", value)).rejects.toMatchObject({
        code: "INVALID_WORKTREE",
        status: 400,
      });
    },
  );

  it("maps unknown safe IDs to WORKTREE_NOT_FOUND", async () => {
    await expect(resolveWorktreeRoot("demo", "0123456789abcdef")).rejects.toMatchObject({
      code: "WORKTREE_NOT_FOUND",
      status: 404,
    });
  });

  it("maps locked worktrees to WORKTREE_NOT_FOUND", async () => {
    const id = worktreeIdForCanonicalKey("/workspaces/demo/.trees/locked");
    await expect(resolveWorktreeRoot("demo", id)).rejects.toMatchObject({
      code: "WORKTREE_NOT_FOUND",
      status: 404,
    });
  });

  it("maps worktree paths that resolve to files to WORKTREE_NOT_FOUND", async () => {
    const id = worktreeIdForCanonicalKey("/workspaces/demo/.trees/feature");
    mockFs.stat.mockResolvedValue({ isDirectory: () => false } as never);

    await expect(resolveWorktreeRoot("demo", id)).rejects.toMatchObject({
      code: "WORKTREE_NOT_FOUND",
      status: 404,
    });
  });
});

describe("normalizeHttpWorktree", () => {
  it("returns safe IDs unchanged", () => {
    expect(normalizeHttpWorktree("0123456789abcdef")).toBe("0123456789abcdef");
  });

  it("throws WorktreeResolutionError for path-like values", () => {
    expect(() => normalizeHttpWorktree("../x")).toThrow(WorktreeResolutionError);
    expect(() => normalizeHttpWorktree(".trees/feature")).toThrow(WorktreeResolutionError);
  });
});
