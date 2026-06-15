// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/registry", () => ({
  resolveProjectPath: vi.fn(),
}));

vi.mock("fs/promises");

import fs from "fs/promises";
import { resolveProjectPath } from "@/lib/registry";
import { GET, PUT } from "./route";
import { NextRequest } from "next/server";

const mockFs = vi.mocked(fs);
const mockResolveProjectPath = vi.mocked(resolveProjectPath);

function makeGetRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/files/content");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

type StatKind =
  | "file"
  | "directory"
  | "symlink"
  | "socket"
  | "fifo"
  | "block"
  | "character"
  | "unknown";

function stat(kind: StatKind, size = 100, mtimeMs = 1000) {
  return {
    size,
    mtimeMs,
    isFile: () => kind === "file",
    isDirectory: () => kind === "directory",
    isSymbolicLink: () => kind === "symlink",
    isSocket: () => kind === "socket",
    isFIFO: () => kind === "fifo",
    isBlockDevice: () => kind === "block",
    isCharacterDevice: () => kind === "character",
  };
}

function makePutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/files/content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveProjectPath.mockResolvedValue("/workspaces/test-project");
  mockFs.realpath.mockImplementation(async (target) => String(target));
  mockFs.stat.mockResolvedValue(stat("directory") as never);
});

describe("GET /api/files/content", () => {
  it.each([
    ["image.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/png"],
    ["photo.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"],
    ["logo.svg", Buffer.from("<svg />"), "image/svg+xml"],
  ])("returns a data URL for viewable image %s", async (filePath, bytes, mimeType) => {
    mockFs.lstat.mockResolvedValue(stat("file", bytes.length, 2000) as never);
    mockFs.readFile.mockResolvedValue(bytes as never);

    const res = await GET(makeGetRequest({ slug: "test", path: filePath }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      content: `data:${mimeType};base64,${bytes.toString("base64")}`,
      language: "image",
      size: bytes.length,
      isBinary: true,
      path: filePath,
      name: filePath,
      mtime: 2000,
    });
    expect(mockFs.readFile).toHaveBeenCalledWith(`/workspaces/test-project/${filePath}`);
  });

  it("returns FILE_TOO_LARGE for oversized PNG previews", async () => {
    mockFs.lstat.mockResolvedValue(stat("file", 1024 * 1024 + 1) as never);

    const res = await GET(makeGetRequest({ slug: "test", path: "image.png" }));

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(mockFs.readFile).not.toHaveBeenCalled();
  });

  it("returns opaque binary content for non-viewable binaries", async () => {
    mockFs.lstat.mockResolvedValue(stat("file", 2048, 3000) as never);

    const res = await GET(makeGetRequest({ slug: "test", path: "archive.zip" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      content: "",
      language: "binary",
      size: 2048,
      isBinary: true,
      path: "archive.zip",
      name: "archive.zip",
      mtime: 3000,
    });
    expect(mockFs.readFile).not.toHaveBeenCalled();
  });

  it("reads from the worktree root when worktree is present", async () => {
    mockFs.realpath
      .mockResolvedValueOnce("/workspaces/test-project" as never)
      .mockResolvedValueOnce("/workspaces/test-project/.trees/feat" as never);
    mockFs.lstat.mockResolvedValue(stat("file") as never);
    mockFs.readFile.mockResolvedValue("worktree content" as never);

    const res = await GET(
      makeGetRequest({ slug: "test", path: "src/index.ts", worktree: ".trees/feat" }),
    );

    expect(res.status).toBe(200);
    expect(mockFs.lstat).toHaveBeenCalledWith("/workspaces/test-project/.trees/feat/src/index.ts");
    await expect(res.json()).resolves.toMatchObject({ content: "worktree content" });
  });

  it("reads viewable images from the worktree root when worktree is present", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    mockFs.realpath
      .mockResolvedValueOnce("/workspaces/test-project" as never)
      .mockResolvedValueOnce("/workspaces/test-project/.trees/feat" as never);
    mockFs.lstat.mockResolvedValue(stat("file", bytes.length) as never);
    mockFs.readFile.mockResolvedValue(bytes as never);

    const res = await GET(
      makeGetRequest({ slug: "test", path: "assets/image.png", worktree: ".trees/feat" }),
    );

    expect(res.status).toBe(200);
    expect(mockFs.lstat).toHaveBeenCalledWith(
      "/workspaces/test-project/.trees/feat/assets/image.png",
    );
    expect(mockFs.readFile).toHaveBeenCalledWith(
      "/workspaces/test-project/.trees/feat/assets/image.png",
    );
    await expect(res.json()).resolves.toMatchObject({
      content: `data:image/png;base64,${bytes.toString("base64")}`,
      language: "image",
      isBinary: true,
    });
  });

  it("reads viewable image symlinks from the resolved target path when inside root", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    mockFs.lstat.mockResolvedValue(stat("symlink", bytes.length) as never);
    mockFs.realpath
      .mockResolvedValueOnce("/workspaces/test-project" as never)
      .mockResolvedValueOnce("/workspaces/test-project/assets/real.png" as never);
    mockFs.stat.mockResolvedValue(stat("file", bytes.length, 4000) as never);
    mockFs.readFile.mockResolvedValue(bytes as never);

    const res = await GET(makeGetRequest({ slug: "test", path: "assets/link.png" }));

    expect(res.status).toBe(200);
    expect(mockFs.readFile).toHaveBeenCalledWith("/workspaces/test-project/assets/real.png");
    await expect(res.json()).resolves.toMatchObject({
      content: `data:image/png;base64,${bytes.toString("base64")}`,
      language: "image",
      path: "assets/link.png",
      name: "link.png",
    });
  });

  it("rejects viewable image symlinks that resolve outside the root", async () => {
    mockFs.lstat.mockResolvedValue(stat("symlink") as never);
    mockFs.realpath
      .mockResolvedValueOnce("/workspaces/test-project" as never)
      .mockResolvedValueOnce("/outside/secret.png" as never);

    const res = await GET(makeGetRequest({ slug: "test", path: "assets/link.png" }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      code: "INVALID_PATH",
      kind: "symlink",
    });
    expect(mockFs.readFile).not.toHaveBeenCalled();
  });

  it("returns structured worktree errors for GET", async () => {
    const invalid = await GET(makeGetRequest({ slug: "test", path: "a.ts", worktree: "../bad" }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: "INVALID_WORKTREE" });

    mockFs.realpath
      .mockResolvedValueOnce("/workspaces/test-project" as never)
      .mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }) as never);
    const missing = await GET(makeGetRequest({ slug: "test", path: "a.ts", worktree: "missing" }));
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ code: "WORKTREE_NOT_FOUND" });
  });
  it("TP7 returns regular text file content with existing shape", async () => {
    mockFs.lstat.mockResolvedValue(stat("file") as never);
    mockFs.readFile.mockResolvedValue("file content" as never);

    const res = await GET(makeGetRequest({ slug: "test", path: "src/index.ts" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      content: "file content",
      language: "typescript",
      size: 100,
      isBinary: false,
      path: "src/index.ts",
      name: "index.ts",
      mtime: 1000,
    });
  });

  it.each([
    ["socket", "socket"],
    ["fifo", "fifo"],
    ["directory", "directory"],
  ] as const)("TP5 rejects %s before readFile", async (kind, expectedKind) => {
    mockFs.lstat.mockResolvedValue(stat(kind) as never);

    const res = await GET(makeGetRequest({ slug: "test", path: `target-${kind}` }));
    expect(res.status).toBe(415);
    await expect(res.json()).resolves.toMatchObject({
      error: "Cannot preview file",
      code: "NOT_REGULAR_FILE",
      kind: expectedKind,
    });
    expect(mockFs.readFile).not.toHaveBeenCalled();
  });

  it("TP6 returns permission-denied structured error", async () => {
    mockFs.lstat.mockRejectedValue(Object.assign(new Error("denied"), { code: "EACCES" }));

    const res = await GET(makeGetRequest({ slug: "test", path: "secret.txt" }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      code: "PERMISSION_DENIED",
      kind: "permission-denied",
    });
    expect(mockFs.readFile).not.toHaveBeenCalled();
  });

  it("TP6 returns broken-symlink structured error", async () => {
    mockFs.lstat.mockResolvedValue(stat("symlink") as never);
    mockFs.stat.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));

    const res = await GET(makeGetRequest({ slug: "test", path: "missing-link" }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({
      code: "BROKEN_SYMLINK",
      kind: "broken-symlink",
    });
    expect(mockFs.readFile).not.toHaveBeenCalled();
  });

  it("returns READ_FAILED for unexpected regular-file read failures", async () => {
    mockFs.lstat.mockResolvedValue(stat("file") as never);
    mockFs.readFile.mockRejectedValue(new Error("boom"));

    const res = await GET(makeGetRequest({ slug: "test", path: "src/index.ts" }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ code: "READ_FAILED", kind: "regular-file" });
  });
});

describe("PUT /api/files/content", () => {
  it("writes to the worktree root when worktree is present", async () => {
    mockFs.realpath
      .mockResolvedValueOnce("/workspaces/test-project" as never)
      .mockResolvedValueOnce("/workspaces/test-project/.trees/feat" as never);
    mockFs.stat
      .mockResolvedValueOnce(stat("directory") as never)
      .mockResolvedValueOnce({ size: 100, mtimeMs: 1000 } as never)
      .mockResolvedValueOnce({ size: 3, mtimeMs: 2000 } as never);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);

    const res = await PUT(
      makePutRequest({
        slug: "test",
        path: "src/file.ts",
        content: "new",
        mtime: 1000,
        worktree: ".trees/feat",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("/workspaces/test-project/.trees/feat/src/file.ts.tmp."),
      "new",
      "utf-8",
    );
  });
  it("3.1 — returns 400 for missing required fields", async () => {
    const res1 = await PUT(makePutRequest({ slug: "test", path: "file.ts" }));
    expect(res1.status).toBe(400);

    const res2 = await PUT(makePutRequest({ slug: "test", content: "abc" }));
    expect(res2.status).toBe(400);

    const res3 = await PUT(makePutRequest({ path: "file.ts", content: "abc" }));
    expect(res3.status).toBe(400);
  });

  it("3.2 — returns 403 for path traversal", async () => {
    const res = await PUT(
      makePutRequest({ slug: "test", path: "../../etc/passwd", content: "hack" }),
    );
    expect(res.status).toBe(403);
  });

  it("3.3 — returns 403 for binary file", async () => {
    const res = await PUT(makePutRequest({ slug: "test", path: "image.png", content: "data" }));
    expect(res.status).toBe(403);
  });

  it("3.4 — returns 413 for content exceeding 1MB", async () => {
    const largeContent = "x".repeat(1024 * 1024 + 1);
    mockFs.stat.mockResolvedValue({ size: 100, mtimeMs: 1000 } as never);
    const res = await PUT(makePutRequest({ slug: "test", path: "file.ts", content: largeContent }));
    expect(res.status).toBe(413);
  });

  it("3.5 — writes file successfully", async () => {
    mockFs.stat.mockResolvedValueOnce({ size: 100, mtimeMs: 1000 } as never);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValueOnce({ size: 11, mtimeMs: 2000 } as never);

    const res = await PUT(
      makePutRequest({ slug: "test", path: "file.ts", content: "new content", mtime: 1000 }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBe("new content");
    expect(data.mtime).toBe(2000);
    expect(data.language).toBe("typescript");
  });

  it("3.6 — returns 409 for mtime conflict", async () => {
    mockFs.stat.mockResolvedValue({ size: 100, mtimeMs: 5000 } as never);

    const res = await PUT(
      makePutRequest({ slug: "test", path: "file.ts", content: "new content", mtime: 1000 }),
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("CONFLICT");
  });

  it("3.7 — writes empty content successfully", async () => {
    mockFs.stat.mockResolvedValueOnce({ size: 50, mtimeMs: 1000 } as never);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValueOnce({ size: 0, mtimeMs: 2000 } as never);

    const res = await PUT(makePutRequest({ slug: "test", path: "file.ts", content: "" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBe("");
  });

  it("3.8 — returns 500 for write error", async () => {
    mockFs.stat.mockResolvedValue({ size: 100, mtimeMs: 1000 } as never);
    mockFs.writeFile.mockRejectedValue(new Error("disk full"));

    const res = await PUT(
      makePutRequest({ slug: "test", path: "file.ts", content: "data", mtime: 1000 }),
    );
    expect(res.status).toBe(500);
  });
});
