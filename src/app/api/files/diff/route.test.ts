// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/registry", () => ({
  resolveProjectPath: vi.fn(),
}));

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("util", () => ({
  promisify: (fn: unknown) => fn,
}));

import { resolveProjectPath } from "@/lib/registry";
import { execFile } from "child_process";
import { GET } from "./route";
import { NextRequest } from "next/server";

const mockResolveProjectPath = vi.mocked(resolveProjectPath);
const mockExecFile = vi.mocked(execFile);

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/files/diff");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveProjectPath.mockResolvedValue("/workspaces/test-project");
});

describe("GET /api/files/diff", () => {
  it("2.1 — returns 400 for missing slug or path", async () => {
    const res1 = await GET(makeRequest({ slug: "test" }));
    expect(res1.status).toBe(400);

    const res2 = await GET(makeRequest({ path: "src/index.ts" }));
    expect(res2.status).toBe(400);

    const res3 = await GET(makeRequest({}));
    expect(res3.status).toBe(400);
  });

  it("2.2 — returns 403 for path traversal", async () => {
    const res = await GET(makeRequest({ slug: "test", path: "../../etc/passwd" }));
    expect(res.status).toBe(403);
  });

  it("2.3 — returns diff for modified file", async () => {
    const diffText = "@@ -1,3 +1,3 @@\n context\n-old\n+new";
    // First call: git status returns modified
    mockExecFile.mockResolvedValueOnce({ stdout: " M src/index.ts\n", stderr: "" } as never);
    // Second call: git diff returns diff
    mockExecFile.mockResolvedValueOnce({ stdout: diffText, stderr: "" } as never);

    const res = await GET(makeRequest({ slug: "test", path: "src/index.ts" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.diff).toBe(diffText);
  });

  it("2.4 — returns empty diff for no changes", async () => {
    // git status returns no output (no changes)
    mockExecFile.mockResolvedValueOnce({ stdout: "", stderr: "" } as never);
    // git diff returns empty
    mockExecFile.mockResolvedValueOnce({ stdout: "", stderr: "" } as never);

    const res = await GET(makeRequest({ slug: "test", path: "src/index.ts" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.diff).toBe("");
  });

  it("2.5 — returns 500 for git error", async () => {
    // git status succeeds
    mockExecFile.mockResolvedValueOnce({ stdout: " M src/index.ts\n", stderr: "" } as never);
    // git diff fails
    mockExecFile.mockRejectedValueOnce(new Error("git not found"));

    const res = await GET(makeRequest({ slug: "test", path: "src/index.ts" }));
    expect(res.status).toBe(500);
  });

  it("2.6 — uses --no-index for untracked files", async () => {
    const diffText = "@@ -0,0 +1,2 @@\n+new line 1\n+new line 2";
    // git status returns untracked
    mockExecFile.mockResolvedValueOnce({ stdout: "?? new-file.ts\n", stderr: "" } as never);
    // git diff --no-index exits with code 1 (normal for differences), stdout has diff
    mockExecFile.mockRejectedValueOnce({ stdout: diffText, code: 1 });

    const res = await GET(makeRequest({ slug: "test", path: "new-file.ts" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.diff).toBe(diffText);
  });

  it("2.7 — uses --cached for staged files", async () => {
    const diffText = "@@ -0,0 +1,1 @@\n+staged content";
    // git status returns staged
    mockExecFile.mockResolvedValueOnce({ stdout: "A  staged.ts\n", stderr: "" } as never);
    // git diff --cached returns diff
    mockExecFile.mockResolvedValueOnce({ stdout: diffText, stderr: "" } as never);

    const res = await GET(makeRequest({ slug: "test", path: "staged.ts" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.diff).toBe(diffText);
  });
});
