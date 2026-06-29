// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs/promises");
vi.mock("@/lib/registry", () => ({
  loadRegistry: vi.fn(),
  saveRegistry: vi.fn(),
  detectLanguage: vi.fn(),
  readPackageJson: vi.fn(),
  resolveProjectRecord: vi.fn(),
}));

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

import fs from "fs/promises";
import { execFile } from "child_process";
import {
  loadRegistry,
  saveRegistry,
  detectLanguage,
  readPackageJson,
  resolveProjectRecord,
} from "@/lib/registry";
import { GET, PUT, DELETE } from "./route";

const mockFs = vi.mocked(fs);
const mockExecFile = vi.mocked(execFile);
const mockLoadRegistry = vi.mocked(loadRegistry);
const mockSaveRegistry = vi.mocked(saveRegistry);
const mockDetectLanguage = vi.mocked(detectLanguage);
const mockReadPackageJson = vi.mocked(readPackageJson);
const mockResolveProjectRecord = vi.mocked(resolveProjectRecord);

beforeEach(() => {
  vi.clearAllMocks();
  mockSaveRegistry.mockResolvedValue(undefined);
  mockDetectLanguage.mockResolvedValue("TypeScript");
  mockReadPackageJson.mockResolvedValue({ name: "test", description: "A test" });
  mockResolveProjectRecord.mockResolvedValue({
    slug: "proj",
    path: "/test/proj",
    source: "manual",
    exists: true,
  });
  mockExecFile.mockImplementation(((_cmd: string, _args: string[], _opts: unknown, cb: unknown) => {
    (cb as (err: Error | null, out: { stdout: string }) => void)(null, {
      stdout: "https://user:secret@example.com/org/repo.git\n",
    });
  }) as unknown as typeof execFile);
});

function makeRequest(body: object) {
  return new Request("http://localhost/api/projects/proj", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("GET /api/projects/[slug]", () => {
  it("returns sanitized project detail with credential-stripped origin", async () => {
    const res = await GET(new Request("http://localhost/api/projects/proj") as never, {
      params: Promise.resolve({ slug: "proj" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      slug: "proj",
      name: "test",
      description: "A test",
      language: "TypeScript",
      available: true,
      repoUrlStatus: "available",
      repoUrlDisplay: "example.com/org/repo.git",
    });
    expect(data.repoUrl).toBe("https://example.com/org/repo.git");
    expect(JSON.stringify(data)).not.toContain("secret");
  });

  it("returns 200 unavailable detail for known missing manual projects", async () => {
    mockResolveProjectRecord.mockResolvedValue({
      slug: "proj",
      path: "/missing/proj",
      source: "manual",
      name: "Missing",
      exists: false,
    });

    const res = await GET(new Request("http://localhost/api/projects/proj") as never, {
      params: Promise.resolve({ slug: "proj" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      slug: "proj",
      name: "Missing",
      available: false,
      repoUrl: null,
      repoUrlDisplay: null,
      repoUrlStatus: "unavailable",
    });
  });

  it("returns 404 for unknown slugs", async () => {
    mockResolveProjectRecord.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost/api/projects/missing") as never, {
      params: Promise.resolve({ slug: "missing" }),
    });

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("PROJECT_NOT_FOUND");
  });

  it("returns invalid instead of echoing malformed remotes", async () => {
    mockExecFile.mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: unknown,
    ) => {
      (cb as (err: Error | null, out: { stdout: string }) => void)(null, {
        stdout: "not a url",
      });
    }) as unknown as typeof execFile);

    const res = await GET(new Request("http://localhost/api/projects/proj") as never, {
      params: Promise.resolve({ slug: "proj" }),
    });
    const data = await res.json();

    expect(data.repoUrlStatus).toBe("invalid");
    expect(data.repoUrl).toBeNull();
    expect(data.repoUrlDisplay).toBeNull();
    expect(JSON.stringify(data)).not.toContain("not a url");
  });
});

describe("PUT /api/projects/[slug]", () => {
  it("updates metadata — returns 200 (T17)", async () => {
    mockLoadRegistry.mockResolvedValue({
      version: 1,
      projects: [{ slug: "proj", path: "/test/proj", source: "manual", name: "Old" }],
    });
    mockFs.stat.mockResolvedValue({ mtime: new Date() } as never);

    const res = await PUT(makeRequest({ name: "New Name" }), {
      params: Promise.resolve({ slug: "proj" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.name).toBe("New Name");
    expect(mockSaveRegistry).toHaveBeenCalled();
  });

  it("unknown slug returns 404 (T18)", async () => {
    mockLoadRegistry.mockResolvedValue({ version: 1, projects: [] });

    const res = await PUT(makeRequest({ name: "Test" }), {
      params: Promise.resolve({ slug: "nonexistent" }),
    });

    expect(res.status).toBe(404);
  });

  it("invalid new path returns 400", async () => {
    mockLoadRegistry.mockResolvedValue({
      version: 1,
      projects: [{ slug: "proj", path: "/test/proj", source: "manual" }],
    });
    mockFs.stat.mockRejectedValue(new Error("ENOENT"));

    const res = await PUT(makeRequest({ path: "/bad/path" }), {
      params: Promise.resolve({ slug: "proj" }),
    });

    expect(res.status).toBe(400);
  });

  it("ignores slug field in body", async () => {
    mockLoadRegistry.mockResolvedValue({
      version: 1,
      projects: [{ slug: "proj", path: "/test/proj", source: "manual", name: "Orig" }],
    });
    mockFs.stat.mockResolvedValue({ mtime: new Date() } as never);

    const res = await PUT(makeRequest({ slug: "other", name: "Updated" }), {
      params: Promise.resolve({ slug: "proj" }),
    });
    const data = await res.json();

    expect(data.slug).toBe("proj");
  });
});

describe("DELETE /api/projects/[slug]", () => {
  it("removes manual entry (T19)", async () => {
    mockLoadRegistry.mockResolvedValue({
      version: 1,
      projects: [{ slug: "manual-proj", path: "/test/manual-proj", source: "manual" }],
    });

    const req = new Request("http://localhost/api/projects/manual-proj", { method: "DELETE" });
    const res = await DELETE(req as never, {
      params: Promise.resolve({ slug: "manual-proj" }),
    });

    expect(res.status).toBe(200);
    // Verify entry was removed from saved registry
    const savedRegistry = mockSaveRegistry.mock.calls[0][0];
    expect(savedRegistry.projects).toHaveLength(0);
  });

  it("hides auto-discovered project (T20)", async () => {
    mockLoadRegistry.mockResolvedValue({ version: 1, projects: [] });

    // Mock auto-discovery to find the project
    mockFs.readdir.mockResolvedValue([
      {
        name: "auto-proj",
        isDirectory: () => true,
        isFile: () => false,
      } as never,
    ] as never);

    const req = new Request("http://localhost/api/projects/auto-proj", { method: "DELETE" });
    const res = await DELETE(req as never, {
      params: Promise.resolve({ slug: "auto-proj" }),
    });

    expect(res.status).toBe(200);
    const savedRegistry = mockSaveRegistry.mock.calls[0][0];
    expect(savedRegistry.projects[0].hidden).toBe(true);
  });

  it("unknown slug returns 404", async () => {
    mockLoadRegistry.mockResolvedValue({ version: 1, projects: [] });
    mockFs.readdir.mockResolvedValue([] as never);

    const req = new Request("http://localhost/api/projects/nope", { method: "DELETE" });
    const res = await DELETE(req as never, {
      params: Promise.resolve({ slug: "nope" }),
    });

    expect(res.status).toBe(404);
  });
});
