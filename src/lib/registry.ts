import fs from "fs/promises";
import path from "path";
import os from "os";
import type { ProjectRegistry } from "@/lib/types";
import type { InitialProjectConfig } from "./config";

function getProjectsDir(): string {
  return process.env.DEVDECK_PROJECTS_DIR ?? "/workspaces";
}

function slugFromProjectPath(projectPath: string): string {
  return path.basename(projectPath).replace(/[^a-zA-Z0-9_-]/g, "");
}

export function getDataDir(): string {
  return process.env.DEVDECK_DATA_DIR ?? path.join(os.homedir(), ".config", "devdeck");
}

function getRegistryPath(): string {
  return path.join(getDataDir(), "registry.json");
}

export async function loadRegistry(): Promise<ProjectRegistry> {
  try {
    const content = await fs.readFile(getRegistryPath(), "utf-8");
    return JSON.parse(content) as ProjectRegistry;
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, projects: [] };
    }
    // Permission errors, corrupt JSON, etc. — surface the error
    throw new Error(`Failed to load registry: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function saveRegistry(registry: ProjectRegistry): Promise<void> {
  const registryPath = getRegistryPath();
  const dir = path.dirname(registryPath);
  const tmpPath = registryPath + ".tmp";

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(registry, null, 2), "utf-8");
  await fs.rename(tmpPath, registryPath);
}

export async function resolveProjectPath(slug: string): Promise<string> {
  const registry = await loadRegistry();
  const entry = registry.projects.find((p) => p.slug === slug);
  if (entry) return entry.path;
  const sanitized = slug.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.resolve(getProjectsDir(), sanitized);
}

export interface ResolvedProjectRecord {
  slug: string;
  path: string;
  source: "auto" | "manual";
  name?: string;
  description?: string;
  hidden?: boolean;
  exists: boolean;
}

async function directoryExists(projectPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(projectPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function resolveProjectRecord(slug: string): Promise<ResolvedProjectRecord | null> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug || /[^a-zA-Z0-9_-]/.test(normalizedSlug)) return null;

  const registry = await loadRegistry();
  const entry = registry.projects.find((project) => project.slug === normalizedSlug);
  if (entry) {
    if (entry.hidden) return null;
    return {
      slug: entry.slug,
      path: entry.path,
      source: entry.source,
      name: entry.name,
      description: entry.description,
      hidden: entry.hidden,
      exists: await directoryExists(entry.path),
    };
  }

  const projectPath = path.resolve(getProjectsDir(), normalizedSlug);
  if (!(await directoryExists(projectPath))) return null;

  return {
    slug: normalizedSlug,
    path: projectPath,
    source: "auto",
    exists: true,
  };
}

export async function detectLanguage(projectPath: string): Promise<string> {
  try {
    const files = await fs.readdir(projectPath);
    if (files.includes("package.json")) return "TypeScript";
    if (files.includes("Cargo.toml")) return "Rust";
    if (files.includes("go.mod")) return "Go";
    if (files.includes("requirements.txt") || files.includes("pyproject.toml")) return "Python";
    if (files.includes("Gemfile")) return "Ruby";
    if (files.includes("pom.xml") || files.includes("build.gradle")) return "Java";
    return "Unknown";
  } catch {
    return "Unknown";
  }
}

export async function readPackageJson(
  projectPath: string,
): Promise<{ name?: string; description?: string }> {
  try {
    const content = await fs.readFile(path.join(projectPath, "package.json"), "utf-8");
    const pkg = JSON.parse(content);
    return { name: pkg.name, description: pkg.description };
  } catch {
    return {};
  }
}

export interface SeedInitialProjectsResult {
  seeded: string[];
  skipped: Array<{ path: string; reason: string }>;
}

export interface SeedInitialProjectsOptions {
  log?: (message: string) => void;
  projectsDir?: string;
}

async function getAutoDiscoveredSlugs(projectsDir: string): Promise<Set<string>> {
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    return new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  } catch {
    return new Set();
  }
}

export async function seedInitialProjects(
  initialProjects: readonly InitialProjectConfig[],
  options: SeedInitialProjectsOptions = {},
): Promise<SeedInitialProjectsResult> {
  const log = options.log ?? console.info;
  const projectsDir = options.projectsDir ?? getProjectsDir();
  const result: SeedInitialProjectsResult = { seeded: [], skipped: [] };
  if (initialProjects.length === 0) return result;

  const registry = await loadRegistry();
  const autoSlugs = await getAutoDiscoveredSlugs(projectsDir);
  const additions: ProjectRegistry["projects"] = [];

  const skip = (projectPath: string, reason: string) => {
    result.skipped.push({ path: projectPath, reason });
    log("Skipped initial project " + projectPath + ": " + reason);
  };

  for (const entry of initialProjects) {
    const projectPath = entry.path;
    const normalizedPath = path.resolve(projectPath);
    const slug = slugFromProjectPath(normalizedPath);

    if (!slug) {
      skip(projectPath, "empty-slug");
      continue;
    }

    if (registry.projects.some((p) => p.slug === slug) || additions.some((p) => p.slug === slug)) {
      skip(normalizedPath, "duplicate-slug");
      continue;
    }

    if (
      registry.projects.some((p) => path.resolve(p.path) === normalizedPath && !p.hidden) ||
      additions.some((p) => path.resolve(p.path) === normalizedPath && !p.hidden)
    ) {
      skip(normalizedPath, "duplicate-path");
      continue;
    }

    if (autoSlugs.has(slug)) {
      skip(normalizedPath, "auto-discovered-slug");
      continue;
    }

    try {
      const stat = await fs.stat(normalizedPath);
      if (!stat.isDirectory()) {
        skip(normalizedPath, "not-directory");
        continue;
      }
    } catch {
      skip(normalizedPath, "path-not-found");
      continue;
    }

    const name = entry.name?.trim();
    const description = entry.description?.trim();
    additions.push({
      slug,
      path: normalizedPath,
      source: "manual",
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    });
    result.seeded.push(slug);
    log("Seeded initial project " + slug + ": " + normalizedPath);
  }

  if (additions.length > 0) {
    registry.projects.push(...additions);
    await saveRegistry(registry);
  }

  return result;
}
