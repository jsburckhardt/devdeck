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
  seedInitialProjects,
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

  it("throws on corrupt JSON (T3)", async () => {
    mockFs.readFile.mockResolvedValue("not valid json{");

    await expect(loadRegistry()).rejects.toThrow("Failed to load registry");
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

describe("seedInitialProjects", () => {
  const dirent = (name: string, directory = true) => ({
    name,
    isDirectory: () => directory,
  });
  const directoryStat = { isDirectory: () => true };
  const fileStat = { isDirectory: () => false };
  const emptyRegistry = JSON.stringify({ version: 1, projects: [] });

  beforeEach(() => {
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
  });

  it("treats empty initialProjects as a no-op", async () => {
    const result = await seedInitialProjects([], { log: vi.fn() });

    expect(result).toEqual({ seeded: [], skipped: [] });
    expect(mockFs.readFile).not.toHaveBeenCalled();
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("adds a valid directory as a manual registry entry", async () => {
    mockFs.readFile.mockResolvedValue(emptyRegistry);
    mockFs.readdir.mockResolvedValue([] as unknown as never);
    mockFs.stat.mockResolvedValue(directoryStat as never);
    const log = vi.fn();

    const result = await seedInitialProjects([{ path: "/repos/my-app" }], { log });

    expect(result.seeded).toEqual(["my-app"]);
    expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
    const saved = mockFs.writeFile.mock.calls[0][1] as string;
    expect(saved).toContain('"source": "manual"');
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Seeded initial project my-app"));
  });

  it("skips duplicate slugs", async () => {
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({
        version: 1,
        projects: [{ slug: "app", path: "/old/app", source: "manual" }],
      }),
    );
    mockFs.readdir.mockResolvedValue([] as unknown as never);
    const log = vi.fn();

    const result = await seedInitialProjects([{ path: "/new/app" }], { log });

    expect(result.skipped[0].reason).toBe("duplicate-slug");
    expect(mockFs.writeFile).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("duplicate-slug"));
  });

  it("skips duplicate normalized paths", async () => {
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({
        version: 1,
        projects: [{ slug: "existing", path: path.resolve("/new/app"), source: "manual" }],
      }),
    );
    mockFs.readdir.mockResolvedValue([] as unknown as never);

    const result = await seedInitialProjects([{ path: "/new/app" }], { log: vi.fn() });

    expect(result.skipped[0].reason).toBe("duplicate-path");
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("skips slugs that match auto-discovered directories", async () => {
    mockFs.readFile.mockResolvedValue(emptyRegistry);
    mockFs.readdir.mockResolvedValue([dirent("app")] as unknown as never);

    const result = await seedInitialProjects([{ path: "/seed/app" }], { log: vi.fn() });

    expect(result.skipped[0].reason).toBe("auto-discovered-slug");
    expect(mockFs.stat).not.toHaveBeenCalled();
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("uses the resolved projectsDir option for auto-discovery", async () => {
    process.env.DEVDECK_PROJECTS_DIR = "/env/projects";
    mockFs.readFile.mockResolvedValue(emptyRegistry);
    mockFs.readdir.mockResolvedValue([dirent("app")] as unknown as never);

    await seedInitialProjects([{ path: "/seed/app" }], {
      log: vi.fn(),
      projectsDir: "/config/projects",
    });

    expect(mockFs.readdir).toHaveBeenCalledWith("/config/projects", { withFileTypes: true });
    expect(mockFs.readdir).not.toHaveBeenCalledWith("/env/projects", { withFileTypes: true });
  });

  it("skips nonexistent paths", async () => {
    mockFs.readFile.mockResolvedValue(emptyRegistry);
    mockFs.readdir.mockResolvedValue([] as unknown as never);
    mockFs.stat.mockRejectedValue(new Error("missing"));

    const result = await seedInitialProjects([{ path: "/missing/app" }], { log: vi.fn() });

    expect(result.skipped[0].reason).toBe("path-not-found");
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("skips file paths", async () => {
    mockFs.readFile.mockResolvedValue(emptyRegistry);
    mockFs.readdir.mockResolvedValue([] as unknown as never);
    mockFs.stat.mockResolvedValue(fileStat as never);

    const result = await seedInitialProjects([{ path: "/files/app" }], { log: vi.fn() });

    expect(result.skipped[0].reason).toBe("not-directory");
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("accepts symlinked directories via stat", async () => {
    mockFs.readFile.mockResolvedValue(emptyRegistry);
    mockFs.readdir.mockResolvedValue([] as unknown as never);
    mockFs.stat.mockResolvedValue(directoryStat as never);

    const result = await seedInitialProjects([{ path: "/links/app" }], { log: vi.fn() });

    expect(result.seeded).toEqual(["app"]);
  });

  it("skips paths with empty sanitized slugs", async () => {
    mockFs.readFile.mockResolvedValue(emptyRegistry);
    mockFs.readdir.mockResolvedValue([] as unknown as never);

    const result = await seedInitialProjects([{ path: "/!!!" }], { log: vi.fn() });

    expect(result.skipped[0].reason).toBe("empty-slug");
    expect(mockFs.stat).not.toHaveBeenCalled();
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("seeds only valid entries from mixed inputs and writes once", async () => {
    mockFs.readFile.mockResolvedValue(emptyRegistry);
    mockFs.readdir.mockResolvedValue([] as unknown as never);
    mockFs.stat.mockImplementation(async (projectPath) => {
      if (String(projectPath).includes("missing")) throw new Error("missing");
      return directoryStat as never;
    });

    const result = await seedInitialProjects(
      [{ path: "/repos/valid-one" }, { path: "/repos/missing" }, { path: "/repos/valid-two" }],
      {
        log: vi.fn(),
      },
    );

    expect(result.seeded).toEqual(["valid-one", "valid-two"]);
    expect(result.skipped.map((entry) => entry.reason)).toEqual(["path-not-found"]);
    expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
  });

  it("is idempotent across repeated seeding", async () => {
    mockFs.readFile.mockResolvedValueOnce(emptyRegistry);
    mockFs.readdir.mockResolvedValue([] as unknown as never);
    mockFs.stat.mockResolvedValue(directoryStat as never);

    const first = await seedInitialProjects([{ path: "/repos/app" }], { log: vi.fn() });
    const savedRegistry = mockFs.writeFile.mock.calls[0][1] as string;
    mockFs.readFile.mockResolvedValueOnce(savedRegistry);
    mockFs.writeFile.mockClear();

    const second = await seedInitialProjects([{ path: "/repos/app" }], { log: vi.fn() });

    expect(first.seeded).toEqual(["app"]);
    expect(second.skipped[0].reason).toBe("duplicate-slug");
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("sanitizes slugs the same way as project creation", async () => {
    mockFs.readFile.mockResolvedValue(emptyRegistry);
    mockFs.readdir.mockResolvedValue([] as unknown as never);
    mockFs.stat.mockResolvedValue(directoryStat as never);

    const result = await seedInitialProjects([{ path: "/repos/my app!" }], { log: vi.fn() });

    expect(result.seeded).toEqual(["myapp"]);
  });

  it("persists trimmed metadata for seeded manual entries", async () => {
    mockFs.readFile.mockResolvedValue(emptyRegistry);
    mockFs.readdir.mockResolvedValue([] as unknown as never);
    mockFs.stat.mockResolvedValue(directoryStat as never);

    await seedInitialProjects(
      [{ path: "/repos/my-app", name: " My App ", description: "  A configured app  " }],
      { log: vi.fn() },
    );

    const saved = mockFs.writeFile.mock.calls[0][1] as string;
    expect(JSON.parse(saved)).toMatchObject({
      projects: [
        {
          slug: "my-app",
          path: path.resolve("/repos/my-app"),
          source: "manual",
          name: "My App",
          description: "A configured app",
        },
      ],
    });
  });

  it("omits blank metadata for seeded manual entries", async () => {
    mockFs.readFile.mockResolvedValue(emptyRegistry);
    mockFs.readdir.mockResolvedValue([] as unknown as never);
    mockFs.stat.mockResolvedValue(directoryStat as never);

    await seedInitialProjects([{ path: "/repos/my-app", name: " ", description: "" }], {
      log: vi.fn(),
    });

    const saved = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string) as {
      projects: Array<{ name?: string; description?: string }>;
    };
    expect(saved.projects[0]).not.toHaveProperty("name");
    expect(saved.projects[0]).not.toHaveProperty("description");
  });
});
