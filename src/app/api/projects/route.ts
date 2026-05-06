import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { Project } from "@/lib/types";

const PROJECTS_DIR = process.env.DEVDECK_PROJECTS_DIR ?? "/workspaces";

async function detectLanguage(projectPath: string): Promise<string> {
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

async function readPackageJson(
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

export async function GET() {
  try {
    const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
    const projects: Project[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;

      const projectPath = path.join(PROJECTS_DIR, entry.name);

      try {
        const stat = await fs.stat(projectPath);
        const hasGit = await fs
          .access(path.join(projectPath, ".git"))
          .then(() => true)
          .catch(() => false);
        const hasPkg = await fs
          .access(path.join(projectPath, "package.json"))
          .then(() => true)
          .catch(() => false);

        if (!hasGit && !hasPkg) continue;

        const pkg = await readPackageJson(projectPath);
        const language = await detectLanguage(projectPath);

        projects.push({
          slug: entry.name,
          name: pkg.name ?? entry.name,
          description: pkg.description ?? `A ${language} project`,
          path: projectPath,
          language,
          lastModified: stat.mtime.toISOString(),
        });
      } catch {
        continue;
      }
    }

    projects.sort((a, b) => {
      const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
      const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
      return dateB - dateA;
    });

    return NextResponse.json(projects);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to list projects", details: String(error) },
      { status: 500 },
    );
  }
}
