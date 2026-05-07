import fs from "fs/promises";
import path from "path";
import os from "os";
import type { ProjectRegistry } from "@/lib/types";

const PROJECTS_DIR = process.env.DEVDECK_PROJECTS_DIR ?? "/workspaces";

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
    // Corrupt JSON or other read errors: return empty registry
    return { version: 1, projects: [] };
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
  return path.resolve(PROJECTS_DIR, sanitized);
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
