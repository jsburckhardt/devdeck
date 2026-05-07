// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";

// Mock fs/promises before importing the module
vi.mock("fs/promises");

import fs from "fs/promises";
import {
  loadRegistry,
  saveRegistry,
  resolveProjectPath,
  detectLanguage,
  readPackageJson,
} from "./registry";

const mockFs = vi.mocked(fs);

beforeEach(() => {
  vi.clearAllMocks();
  // Clear environment overrides
  delete process.env.DEVDECK_DATA_DIR;
  delete process.env.DEVDECK_PROJECTS_DIR;
});

describe("loadRegistry", () => {
  it("returns empty registry when file missing (T1)", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockFs.readFile.mockRejectedValue(err);

    const result = await loadRegistry();
    expect(result).toEqual({ version: 1, projects: [] });
  });

  it("parses valid JSON file (T2)", async () => {
    const registry = {
      version: 1,
      projects: [
        { slug: "proj1", path: "/a/proj1", source: "manual" },
        { slug: "proj2", path: "/b/proj2", source: "auto" },
      ],
    };
    mockFs.readFile.mockResolvedValue(JSON.stringify(registry));

    const result = await loadRegistry();
    expect(result.projects).toHaveLength(2);
    expect(result.projects[0].slug).toBe("proj1");
    expect(result.projects[1].source).toBe("auto");
  });

  it("handles corrupt JSON gracefully (T3)", async () => {
    mockFs.readFile.mockResolvedValue("not valid json{");

    const result = await loadRegistry();
    expect(result).toEqual({ version: 1, projects: [] });
  });
});

describe("saveRegistry", () => {
  it("writes atomically (T4)", async () => {
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);

    const registry = {
      version: 1 as const,
      projects: [{ slug: "test", path: "/test", source: "manual" as const }],
    };

    await saveRegistry(registry);

    expect(mockFs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("registry.json.tmp"),
      expect.stringContaining('"slug": "test"'),
      "utf-8",
    );
    expect(mockFs.rename).toHaveBeenCalledWith(
      expect.stringContaining("registry.json.tmp"),
      expect.stringContaining("registry.json"),
    );
    // Ensure rename target does NOT end with .tmp
    const renameTarget = mockFs.rename.mock.calls[0][1] as string;
    expect(renameTarget).not.toMatch(/\.tmp$/);
  });
});

describe("resolveProjectPath", () => {
  it("returns registry path for known slug (T5)", async () => {
    const registry = {
      version: 1,
      projects: [{ slug: "myproject", path: "/custom/path/myproject", source: "manual" }],
    };
    mockFs.readFile.mockResolvedValue(JSON.stringify(registry));

    const result = await resolveProjectPath("myproject");
    expect(result).toBe("/custom/path/myproject");
  });

  it("falls back for unknown slug (T6)", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockFs.readFile.mockRejectedValue(err);

    const result = await resolveProjectPath("someslug");
    expect(result).toBe(path.resolve("/workspaces", "someslug"));
  });

  it("sanitizes slug (T7)", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockFs.readFile.mockRejectedValue(err);

    const result = await resolveProjectPath("../etc/passwd");
    expect(result).toBe(path.resolve("/workspaces", "etcpasswd"));
  });
});

describe("detectLanguage", () => {
  it("identifies supported languages (T8)", async () => {
    mockFs.readdir.mockResolvedValueOnce(["package.json", "src"] as unknown as never);
    expect(await detectLanguage("/test")).toBe("TypeScript");

    mockFs.readdir.mockResolvedValueOnce(["Cargo.toml"] as unknown as never);
    expect(await detectLanguage("/test")).toBe("Rust");

    mockFs.readdir.mockResolvedValueOnce(["go.mod"] as unknown as never);
    expect(await detectLanguage("/test")).toBe("Go");

    mockFs.readdir.mockResolvedValueOnce(["requirements.txt"] as unknown as never);
    expect(await detectLanguage("/test")).toBe("Python");

    mockFs.readdir.mockResolvedValueOnce(["unknown.xyz"] as unknown as never);
    expect(await detectLanguage("/test")).toBe("Unknown");
  });
});

describe("readPackageJson", () => {
  it("reads name and description", async () => {
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({ name: "my-app", description: "A test app" }),
    );
    const result = await readPackageJson("/test");
    expect(result).toEqual({ name: "my-app", description: "A test app" });
  });

  it("handles missing file", async () => {
    mockFs.readFile.mockRejectedValue(new Error("ENOENT"));
    const result = await readPackageJson("/test");
    expect(result).toEqual({});
  });
});
