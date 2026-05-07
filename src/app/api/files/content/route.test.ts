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
});

describe("GET /api/files/content", () => {
  it("3.9 — returns file content successfully", async () => {
    mockFs.stat.mockResolvedValue({ size: 100, mtimeMs: 1000 } as never);
    mockFs.readFile.mockResolvedValue("file content" as never);

    const res = await GET(makeGetRequest({ slug: "test", path: "src/index.ts" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBe("file content");
    expect(data.language).toBe("typescript");
    expect(data.mtime).toBe(1000);
  });
});

describe("PUT /api/files/content", () => {
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
