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

  it("2.3 — returns diff for valid request", async () => {
    const diffText = "@@ -1,3 +1,3 @@\n context\n-old\n+new";
    mockExecFile.mockResolvedValue({ stdout: diffText, stderr: "" } as never);

    const res = await GET(makeRequest({ slug: "test", path: "src/index.ts" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.diff).toBe(diffText);
  });

  it("2.4 — returns empty diff for no changes", async () => {
    mockExecFile.mockResolvedValue({ stdout: "", stderr: "" } as never);

    const res = await GET(makeRequest({ slug: "test", path: "src/index.ts" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.diff).toBe("");
  });

  it("2.5 — returns 500 for git error", async () => {
    mockExecFile.mockRejectedValue(new Error("git not found"));

    const res = await GET(makeRequest({ slug: "test", path: "src/index.ts" }));
    expect(res.status).toBe(500);
  });
});
