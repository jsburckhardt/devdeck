// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/registry", () => ({
  resolveProjectPath: vi.fn(),
}));

vi.mock("fs/promises");

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

vi.mock("@/lib/worktree-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/worktree-utils")>();
  return {
    ...actual,
    resolveWorktreeRoot: vi.fn(),
  };
});

import fs from "fs/promises";
import { NextRequest } from "next/server";
import { resolveProjectPath } from "@/lib/registry";
import { resolveWorktreeRoot, WorktreeResolutionError } from "@/lib/worktree-utils";
import { GET } from "./route";

const mockFs = vi.mocked(fs);
const mockResolveProjectPath = vi.mocked(resolveProjectPath);
const mockResolveWorktreeRoot = vi.mocked(resolveWorktreeRoot);

type StatKind =
  | "file"
  | "directory"
  | "symlink"
  | "socket"
  | "fifo"
  | "block"
  | "character"
  | "unknown";

function stat(kind: StatKind, size = 10) {
  return {
    size,
    isFile: () => kind === "file",
    isDirectory: () => kind === "directory",
    isSymbolicLink: () => kind === "symlink",
    isSocket: () => kind === "socket",
    isFIFO: () => kind === "fifo",
    isBlockDevice: () => kind === "block",
    isCharacterDevice: () => kind === "character",
  };
}

function dirent(name: string) {
  return { name };
}

function request(slug?: string, relativePath?: string, worktree?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/files");
  if (slug) url.searchParams.set("slug", slug);
  if (relativePath !== undefined) url.searchParams.set("path", relativePath);
  if (worktree !== undefined) url.searchParams.set("worktree", worktree);
  return new NextRequest(url);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockResolveProjectPath.mockResolvedValue("/workspaces/test-project");
  mockResolveWorktreeRoot.mockImplementation(async (_slug, worktree) => {
    if (worktree === "../bad") {
      throw new WorktreeResolutionError("INVALID_WORKTREE", "Invalid 'worktree' parameter", 400);
    }
    if (worktree === "missing") {
      throw new WorktreeResolutionError("WORKTREE_NOT_FOUND", "Worktree not found", 404);
    }
    return worktree ? "/workspaces/test-project/.trees/feat" : "/workspaces/test-project";
  });
  mockFs.access.mockResolvedValue(undefined);
  mockFs.realpath.mockImplementation(async (target) => String(target));
  mockFs.stat.mockResolvedValue(stat("directory") as never);
});

describe("GET /api/files", () => {
  it("lists direct children under a worktree root and returns paths relative to that root", async () => {
    mockFs.realpath
      .mockResolvedValueOnce("/workspaces/test-project" as never)
      .mockResolvedValueOnce("/workspaces/test-project/.trees/feat" as never);
    mockFs.readdir.mockImplementation(async (fullPath) => {
      const text = String(fullPath);
      if (text === "/workspaces/test-project/.trees/feat") return [dirent("src")] as never;
      if (text === "/workspaces/test-project/.trees/feat/src") return [dirent("index.ts")] as never;
      throw new Error(`unexpected readdir ${text}`);
    });
    mockFs.lstat.mockResolvedValue(stat("directory") as never);

    const res = await GET(request("test", undefined, ".trees/feat"));

    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ name: string; path: string }>;
    expect(data).toMatchObject([{ name: "src", path: "src" }]);
  });

  it("lists direct children under worktree subdirectories", async () => {
    mockFs.realpath
      .mockResolvedValueOnce("/workspaces/test-project" as never)
      .mockResolvedValueOnce("/workspaces/test-project/.trees/feat" as never);
    mockFs.stat.mockResolvedValue(stat("directory") as never);
    mockFs.readdir.mockResolvedValueOnce([dirent("index.ts")] as never);
    mockFs.lstat.mockResolvedValue(stat("file") as never);

    const res = await GET(request("test", "src", "feat"));

    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ path: string }>;
    expect(data[0].path).toBe("src/index.ts");
  });

  it("returns structured worktree errors", async () => {
    const invalid = await GET(request("test", undefined, "../bad"));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: "INVALID_WORKTREE" });

    const missing = await GET(request("test", undefined, "missing"));
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ code: "WORKTREE_NOT_FOUND" });
  });
  it("TP1 returns root direct children only with lazy directory metadata", async () => {
    mockFs.readdir.mockImplementation(async (fullPath) => {
      const text = String(fullPath);
      if (text === "/workspaces/test-project")
        return [dirent("src"), dirent("package.json")] as never;
      if (text === "/workspaces/test-project/src") return [dirent("components")] as never;
      throw new Error(`unexpected readdir ${text}`);
    });
    mockFs.lstat.mockImplementation(async (fullPath) =>
      String(fullPath).endsWith("package.json")
        ? (stat("file") as never)
        : (stat("directory") as never),
    );

    const res = await GET(request("test"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{
      name: string;
      children?: unknown[];
      hasChildren?: boolean;
      childrenLoaded?: boolean;
    }>;

    expect(data.map((node) => node.name)).toEqual(["src", "package.json"]);
    expect(data[0]).toMatchObject({ name: "src", hasChildren: true, childrenLoaded: false });
    expect(data[0].children).toBeUndefined();
    expect(mockFs.readdir).not.toHaveBeenCalledWith(
      "/workspaces/test-project/src/components",
      expect.anything(),
    );
  });

  it("TP2 returns path-scoped direct children only", async () => {
    mockFs.lstat.mockImplementation(async (fullPath) =>
      String(fullPath).endsWith("Button.tsx")
        ? (stat("file") as never)
        : (stat("directory") as never),
    );
    mockFs.stat.mockResolvedValue(stat("directory") as never);
    mockFs.readdir.mockImplementation(async (fullPath) => {
      const text = String(fullPath);
      if (text === "/workspaces/test-project/src")
        return [dirent("components"), dirent("Button.tsx")] as never;
      if (text === "/workspaces/test-project/src/components")
        return [dirent("Nested.tsx")] as never;
      throw new Error(`unexpected readdir ${text}`);
    });

    const res = await GET(request("test", "src"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ name: string; path: string; children?: unknown[] }>;

    expect(data.map((node) => node.path)).toEqual(["src/components", "src/Button.tsx"]);
    expect(data[0].children).toBeUndefined();
    expect(mockFs.readdir).not.toHaveBeenCalledWith(
      "/workspaces/test-project/src/components/Nested.tsx",
      expect.anything(),
    );
  });

  it("TP3 rejects traversal, absolute escapes, and non-directory targets", async () => {
    const traversal = await GET(request("test", "../secret"));
    expect(traversal.status).toBe(400);
    await expect(traversal.json()).resolves.toMatchObject({ code: "INVALID_PATH" });

    const absolute = await GET(request("test", "/etc"));
    expect(absolute.status).toBe(400);
    await expect(absolute.json()).resolves.toMatchObject({ code: "INVALID_PATH" });

    mockFs.lstat.mockResolvedValueOnce(stat("file") as never);
    mockFs.stat.mockResolvedValueOnce(stat("file") as never);
    const fileTarget = await GET(request("test", "package.json"));
    expect(fileTarget.status).toBe(400);
    await expect(fileTarget.json()).resolves.toMatchObject({ code: "NOT_A_DIRECTORY" });
  });

  it("TP4 returns lazy metadata for non-empty, empty, and unreadable directories", async () => {
    mockFs.readdir.mockImplementation(async (fullPath) => {
      const text = String(fullPath);
      if (text === "/workspaces/test-project") {
        return [dirent("non-empty-dir"), dirent("empty-dir"), dirent("restricted-dir")] as never;
      }
      if (text === "/workspaces/test-project/non-empty-dir") return [dirent("child.txt")] as never;
      if (text === "/workspaces/test-project/empty-dir") return [] as never;
      if (text === "/workspaces/test-project/restricted-dir") {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      }
      throw new Error(`unexpected readdir ${text}`);
    });
    mockFs.lstat.mockResolvedValue(stat("directory") as never);

    const res = await GET(request("test"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{
      name: string;
      hasChildren?: boolean;
      childrenLoaded?: boolean;
      unreadable?: boolean;
      children?: unknown[];
    }>;

    expect(data.find((node) => node.name === "non-empty-dir")).toMatchObject({
      hasChildren: true,
      childrenLoaded: false,
    });
    expect(data.find((node) => node.name === "empty-dir")).toMatchObject({
      hasChildren: false,
      childrenLoaded: true,
      children: [],
    });
    expect(data.find((node) => node.name === "restricted-dir")).toMatchObject({
      unreadable: true,
      hasChildren: false,
      childrenLoaded: true,
      children: [],
    });
  });

  it("TP5 excludes .git from path-scoped directory results", async () => {
    mockFs.lstat.mockImplementation(async (fullPath) =>
      String(fullPath).endsWith("package-lock.json") || String(fullPath).endsWith(".env")
        ? (stat("file") as never)
        : (stat("directory") as never),
    );
    mockFs.stat.mockResolvedValue(stat("directory") as never);
    mockFs.readdir.mockImplementation(async (fullPath) => {
      const text = String(fullPath);
      if (text === "/workspaces/test-project/config") {
        return [
          dirent(".git"),
          dirent(".next"),
          dirent("node_modules"),
          dirent(".env"),
          dirent("package-lock.json"),
        ] as never;
      }
      return [] as never;
    });

    const res = await GET(request("test", "config"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ name: string }>;
    const names = data.map((node) => node.name);
    expect(names).not.toContain(".git");
    expect(names).toContain(".next");
    expect(names).toContain("node_modules");
    expect(names).toContain(".env");
    expect(names).toContain("package-lock.json");
  });

  it("TP1 excludes .git from root results while preserving other entries", async () => {
    mockFs.readdir.mockResolvedValueOnce([
      dirent(".devcontainer"),
      dirent(".git"),
      dirent("node_modules"),
      dirent("package-lock.json"),
      dirent(".env"),
      dirent("src"),
    ] as never);
    mockFs.lstat.mockImplementation(async (fullPath) => {
      const text = String(fullPath);
      return stat(
        text.endsWith("package-lock.json") || text.endsWith(".env") ? "file" : "directory",
      ) as never;
    });
    mockFs.readdir.mockResolvedValue([] as never);

    const res = await GET(request("test"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ name: string }>;
    const names = data.map((node) => node.name);
    expect(names).not.toContain(".git");
    expect(names).toContain(".devcontainer");
    expect(names).toContain("node_modules");
    expect(names).toContain("src");
    expect(names).toContain(".env");
    expect(names).toContain("package-lock.json");
  });

  it("excludes .git at nested directory levels", async () => {
    mockFs.lstat.mockImplementation(async (fullPath) =>
      String(fullPath).endsWith("README.md")
        ? (stat("file") as never)
        : (stat("directory") as never),
    );
    mockFs.stat.mockResolvedValue(stat("directory") as never);
    mockFs.readdir.mockImplementation(async (fullPath) => {
      const text = String(fullPath);
      if (text === "/workspaces/test-project/packages/sub") {
        return [dirent(".git"), dirent("src"), dirent("README.md")] as never;
      }
      return [] as never;
    });

    const res = await GET(request("test", "packages/sub"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ name: string }>;
    const names = data.map((node) => node.name);
    expect(names).not.toContain(".git");
    expect(names).toContain("src");
    expect(names).toContain("README.md");
  });

  it("does not exclude .github, .gitignore, or .gitattributes", async () => {
    mockFs.readdir.mockResolvedValueOnce([
      dirent(".git"),
      dirent(".github"),
      dirent(".gitignore"),
      dirent(".gitattributes"),
      dirent("src"),
    ] as never);
    mockFs.lstat.mockImplementation(async (fullPath) =>
      String(fullPath).endsWith(".gitignore") || String(fullPath).endsWith(".gitattributes")
        ? (stat("file") as never)
        : (stat("directory") as never),
    );
    mockFs.readdir.mockResolvedValue([] as never);

    const res = await GET(request("test"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ name: string }>;
    const names = data.map((node) => node.name);
    expect(names).not.toContain(".git");
    expect(names).toContain(".github");
    expect(names).toContain(".gitignore");
    expect(names).toContain(".gitattributes");
    expect(names).toContain("src");
  });

  it("TP2 classifies sockets and FIFOs as unreadable nodes", async () => {
    mockFs.readdir.mockResolvedValueOnce([dirent("app.sock"), dirent("pipe.fifo")] as never);
    mockFs.lstat.mockImplementation(async (fullPath) =>
      String(fullPath).endsWith("app.sock") ? (stat("socket") as never) : (stat("fifo") as never),
    );

    const res = await GET(request("test"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ name: string; kind: string; unreadable?: boolean }>;
    expect(data.find((node) => node.name === "app.sock")).toMatchObject({
      kind: "socket",
      unreadable: true,
    });
    expect(data.find((node) => node.name === "pipe.fifo")).toMatchObject({
      kind: "fifo",
      unreadable: true,
    });
  });

  it("TP3 retains unreadable directories without failing the tree", async () => {
    mockFs.readdir
      .mockResolvedValueOnce([dirent("restricted-dir")] as never)
      .mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "EACCES" }));
    mockFs.lstat.mockResolvedValue(stat("directory") as never);

    const res = await GET(request("test"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{
      name: string;
      type: string;
      kind: string;
      unreadable?: boolean;
    }>;
    expect(data[0]).toMatchObject({
      name: "restricted-dir",
      type: "directory",
      kind: "permission-denied",
      unreadable: true,
    });
  });

  it("TP4 classifies broken symlinks", async () => {
    mockFs.readdir.mockResolvedValueOnce([dirent("missing-link")] as never);
    mockFs.lstat.mockResolvedValue(stat("symlink") as never);
    mockFs.stat.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));

    const res = await GET(request("test"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ kind: string; unreadable?: boolean }>;
    expect(data[0]).toMatchObject({ kind: "broken-symlink", unreadable: true });
  });

  it("classifies symlinks to regular files as readable nodes", async () => {
    mockFs.readdir.mockResolvedValueOnce([dirent("linked-file.ts")] as never);
    mockFs.lstat.mockResolvedValue(stat("symlink", 12) as never);
    mockFs.stat.mockResolvedValue(stat("file", 42) as never);

    const res = await GET(request("test"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ kind: string; size: number; unreadable?: boolean }>;
    expect(data[0]).toMatchObject({ kind: "symlink", size: 42 });
    expect(data[0].unreadable).toBeUndefined();
  });

  it("returns structured errors for missing slug and missing project", async () => {
    const missingSlug = await GET(request());
    expect(missingSlug.status).toBe(400);
    await expect(missingSlug.json()).resolves.toMatchObject({ code: "MISSING_PARAMETERS" });

    mockFs.access.mockRejectedValueOnce(new Error("missing"));
    const missingProject = await GET(request("test"));
    expect(missingProject.status).toBe(404);
    await expect(missingProject.json()).resolves.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });
});
