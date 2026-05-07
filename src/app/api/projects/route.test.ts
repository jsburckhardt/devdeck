// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs/promises");
vi.mock("@/lib/registry", () => ({
  loadRegistry: vi.fn(),
  saveRegistry: vi.fn(),
  detectLanguage: vi.fn(),
  readPackageJson: vi.fn(),
}));

import fs from "fs/promises";
import { loadRegistry, saveRegistry, detectLanguage, readPackageJson } from "@/lib/registry";
import { GET, POST } from "./route";

const mockFs = vi.mocked(fs);
const mockLoadRegistry = vi.mocked(loadRegistry);
const mockSaveRegistry = vi.mocked(saveRegistry);
const mockDetectLanguage = vi.mocked(detectLanguage);
const mockReadPackageJson = vi.mocked(readPackageJson);

function makeDirent(name: string, isDir = true) {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: "/workspaces",
    parentPath: "/workspaces",
  } as unknown as ReturnType<
    typeof fs.readdir extends (...args: unknown[]) => Promise<infer R> ? R : never
  >[number];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadRegistry.mockResolvedValue({ version: 1, projects: [] });
  mockSaveRegistry.mockResolvedValue(undefined);
  mockDetectLanguage.mockResolvedValue("TypeScript");
  mockReadPackageJson.mockResolvedValue({ name: "test", description: "A test project" });
});

describe("GET /api/projects", () => {
  it("returns auto-discovered projects with path and source fields (T9)", async () => {
    mockFs.readdir.mockResolvedValue([makeDirent("projectA")] as never);
    mockFs.stat.mockResolvedValue({ mtime: new Date("2024-01-01") } as never);
    mockFs.access.mockResolvedValue(undefined);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].source).toBe("auto");
    expect(data[0].path).toContain("projectA");
  });

  it("excludes hidden auto-discovered projects (T10)", async () => {
    mockLoadRegistry.mockResolvedValue({
      version: 1,
      projects: [{ slug: "projectA", path: "/workspaces/projectA", source: "auto", hidden: true }],
    });
    mockFs.readdir.mockResolvedValue([makeDirent("projectA"), makeDirent("projectB")] as never);
    mockFs.stat.mockResolvedValue({ mtime: new Date("2024-01-01") } as never);
    mockFs.access.mockResolvedValue(undefined);

    const res = await GET();
    const data = await res.json();

    const slugs = data.map((p: { slug: string }) => p.slug);
    expect(slugs).not.toContain("projectA");
    expect(slugs).toContain("projectB");
  });

  it("includes manual registry entries (T11)", async () => {
    mockLoadRegistry.mockResolvedValue({
      version: 1,
      projects: [{ slug: "external", path: "/other/external", source: "manual" }],
    });
    mockFs.readdir.mockResolvedValue([] as never);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ mtime: new Date("2024-01-01") } as never);

    const res = await GET();
    const data = await res.json();

    expect(
      data.some(
        (p: { slug: string; source: string }) => p.slug === "external" && p.source === "manual",
      ),
    ).toBe(true);
  });

  it("marks inaccessible manual projects (T12)", async () => {
    mockLoadRegistry.mockResolvedValue({
      version: 1,
      projects: [{ slug: "gone", path: "/does/not/exist", source: "manual" }],
    });
    mockFs.readdir.mockResolvedValue([] as never);
    mockFs.access.mockRejectedValue(new Error("ENOENT"));

    const res = await GET();
    const data = await res.json();

    const gone = data.find((p: { slug: string }) => p.slug === "gone");
    expect(gone.available).toBe(false);
  });

  it("applies registry metadata overrides", async () => {
    mockLoadRegistry.mockResolvedValue({
      version: 1,
      projects: [
        { slug: "projectA", path: "/workspaces/projectA", source: "auto", name: "Custom Name" },
      ],
    });
    mockFs.readdir.mockResolvedValue([makeDirent("projectA")] as never);
    mockFs.stat.mockResolvedValue({ mtime: new Date("2024-01-01") } as never);
    mockFs.access.mockResolvedValue(undefined);

    const res = await GET();
    const data = await res.json();

    expect(data[0].name).toBe("Custom Name");
  });

  it("returns empty array when no projects found", async () => {
    mockFs.readdir.mockResolvedValue([] as never);

    const res = await GET();
    const data = await res.json();

    expect(data).toEqual([]);
  });
});

describe("POST /api/projects", () => {
  it("happy path — valid path, returns 201 (T13)", async () => {
    mockFs.stat.mockResolvedValue({ isDirectory: () => true, mtime: new Date() } as never);
    mockFs.readdir.mockResolvedValue([] as never);

    const req = new Request("http://localhost/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/workspaces/newproject" }),
    });

    const res = await POST(req as never);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.slug).toBe("newproject");
    expect(data.source).toBe("manual");
    expect(mockSaveRegistry).toHaveBeenCalled();
  });

  it("missing path returns 400 (T14)", async () => {
    const req = new Request("http://localhost/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("nonexistent path returns 400 (T15)", async () => {
    mockFs.stat.mockRejectedValue(new Error("ENOENT"));

    const req = new Request("http://localhost/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/does/not/exist" }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("slug collision returns 409 (T16)", async () => {
    mockLoadRegistry.mockResolvedValue({
      version: 1,
      projects: [{ slug: "myproject", path: "/other/myproject", source: "manual" }],
    });
    mockFs.stat.mockResolvedValue({ isDirectory: () => true } as never);

    const req = new Request("http://localhost/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/new/myproject" }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(409);
  });

  it("auto-populates metadata from package.json", async () => {
    mockFs.stat.mockResolvedValue({ isDirectory: () => true, mtime: new Date() } as never);
    mockFs.readdir.mockResolvedValue([] as never);
    mockReadPackageJson.mockResolvedValue({ name: "pkg-name", description: "pkg-desc" });

    const req = new Request("http://localhost/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/workspaces/autopkg" }),
    });

    const res = await POST(req as never);
    const data = await res.json();

    expect(data.name).toBe("pkg-name");
    expect(data.description).toBe("pkg-desc");
  });

  it("uses user-provided name/description", async () => {
    mockFs.stat.mockResolvedValue({ isDirectory: () => true, mtime: new Date() } as never);
    mockFs.readdir.mockResolvedValue([] as never);

    const req = new Request("http://localhost/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/workspaces/custom", name: "My Name", description: "My Desc" }),
    });

    const res = await POST(req as never);
    const data = await res.json();

    expect(data.name).toBe("My Name");
    expect(data.description).toBe("My Desc");
  });
});
