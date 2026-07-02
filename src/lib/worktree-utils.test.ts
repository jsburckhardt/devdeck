// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/registry", () => ({
  resolveProjectPath: vi.fn(),
}));

vi.mock("fs/promises");

import fs from "fs/promises";
import { resolveProjectPath } from "@/lib/registry";
import {
  normalizeHttpWorktree,
  resolveWorkspaceContextRoot,
  resolveWorktreeRoot,
  sanitizeRemoteLabel,
  WorktreeResolutionError,
} from "./worktree-utils";

const mockFs = vi.mocked(fs);
const mockResolveProjectPath = vi.mocked(resolveProjectPath);

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveProjectPath.mockResolvedValue("/workspaces/demo");
  mockFs.realpath.mockImplementation(async (target) => String(target));
  mockFs.stat.mockResolvedValue({ isDirectory: () => true } as never);
});

describe("resolveWorktreeRoot", () => {
  it("resolves project root when worktree is absent", async () => {
    await expect(resolveWorktreeRoot("demo")).resolves.toBe("/workspaces/demo");
    expect(mockFs.realpath).not.toHaveBeenCalled();
  });

  it("resolves valid worktree names under .trees", async () => {
    mockFs.realpath
      .mockResolvedValueOnce("/workspaces/demo" as never)
      .mockResolvedValueOnce("/workspaces/demo/.trees/feature" as never);

    await expect(resolveWorktreeRoot("demo", "feature")).resolves.toBe(
      "/workspaces/demo/.trees/feature",
    );
    expect(mockFs.realpath).toHaveBeenNthCalledWith(1, "/workspaces/demo");
    expect(mockFs.realpath).toHaveBeenNthCalledWith(2, "/workspaces/demo/.trees/feature");
  });

  it("resolves nested names and accepts activeWorktree-style .trees prefix", async () => {
    mockFs.realpath
      .mockResolvedValueOnce("/workspaces/demo" as never)
      .mockResolvedValueOnce("/workspaces/demo/.trees/feature/login" as never);

    await expect(resolveWorktreeRoot("demo", ".trees/feature/login")).resolves.toBe(
      "/workspaces/demo/.trees/feature/login",
    );
  });

  it.each(["", "   ", "/etc", "../escape", "feature/../escape", "feature//bad"])(
    "rejects invalid worktree value %j",
    async (value) => {
      await expect(resolveWorktreeRoot("demo", value)).rejects.toMatchObject({
        code: "INVALID_WORKTREE",
        status: 400,
      });
    },
  );

  it("maps missing worktrees to WORKTREE_NOT_FOUND", async () => {
    mockFs.realpath
      .mockResolvedValueOnce("/workspaces/demo" as never)
      .mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }) as never);

    await expect(resolveWorktreeRoot("demo", "missing")).rejects.toMatchObject({
      code: "WORKTREE_NOT_FOUND",
      status: 404,
    });
  });

  it("rejects symlink escapes outside the real project root", async () => {
    mockFs.realpath
      .mockResolvedValueOnce("/workspaces/demo" as never)
      .mockResolvedValueOnce("/outside/escape" as never);

    await expect(resolveWorktreeRoot("demo", "evil")).rejects.toMatchObject({
      code: "WORKTREE_ESCAPE",
      status: 403,
    });
    expect(mockFs.stat).not.toHaveBeenCalled();
  });

  it("maps worktree paths that resolve to files to WORKTREE_NOT_FOUND", async () => {
    mockFs.realpath
      .mockResolvedValueOnce("/workspaces/demo" as never)
      .mockResolvedValueOnce("/workspaces/demo/.trees/not-a-dir" as never);
    mockFs.stat.mockResolvedValueOnce({ isDirectory: () => false } as never);

    await expect(resolveWorktreeRoot("demo", "not-a-dir")).rejects.toMatchObject({
      code: "WORKTREE_NOT_FOUND",
      status: 404,
    });
  });
});

describe("normalizeHttpWorktree", () => {
  it("strips .trees/ from activeWorktree values", () => {
    expect(normalizeHttpWorktree(".trees/feature")).toBe("feature");
  });

  it("throws WorktreeResolutionError for invalid values", () => {
    expect(() => normalizeHttpWorktree("../x")).toThrow(WorktreeResolutionError);
  });

  it("rejects Windows traversal separators before resolution", () => {
    expect(() => normalizeHttpWorktree("feature\\..\\escape")).toThrow(WorktreeResolutionError);
  });
});

describe("resolveWorkspaceContextRoot", () => {
  it("reports empty workspaceContext as a workspaceContext parameter error", async () => {
    await expect(resolveWorkspaceContextRoot("demo", "   ", null)).rejects.toMatchObject({
      code: "INVALID_WORKTREE",
      message: "Invalid 'workspaceContext' parameter",
      status: 400,
    });
  });
});

describe("sanitizeRemoteLabel", () => {
  it.each([
    ["git@github.com:owner/repo.git?token=secret#frag", "github.com/owner/repo.git"],
    ["user@host:path/to/repo.git?password=secret", "host/path/to/repo.git"],
    ["user@host:path/to/repo.git#secret", "host/path/to/repo.git"],
    ["@host:path/to/repo.git?token=secret", "path/to/repo.git"],
  ])("strips query and fragment material from %s", (remote, expected) => {
    expect(sanitizeRemoteLabel(remote)).toBe(expected);
  });
});
