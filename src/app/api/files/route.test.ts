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

import fs from "fs/promises";
import { NextRequest } from "next/server";
import { resolveProjectPath } from "@/lib/registry";
import { GET } from "./route";

const mockFs = vi.mocked(fs);
const mockResolveProjectPath = vi.mocked(resolveProjectPath);

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

function request(slug?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/files");
  if (slug) url.searchParams.set("slug", slug);
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveProjectPath.mockResolvedValue("/workspaces/test-project");
  mockFs.access.mockResolvedValue(undefined);
});

describe("GET /api/files", () => {
  it("TP1 includes hidden/config/dependency entries instead of filtering them", async () => {
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
    expect(data.map((node) => node.name)).toEqual([
      ".devcontainer",
      ".git",
      "node_modules",
      "src",
      ".env",
      "package-lock.json",
    ]);
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
