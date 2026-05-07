import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { Project } from "@/lib/types";
import { loadRegistry, saveRegistry, detectLanguage, readPackageJson } from "@/lib/registry";

const PROJECTS_DIR = process.env.DEVDECK_PROJECTS_DIR ?? "/workspaces";

export async function GET() {
  try {
    const registry = await loadRegistry();
    const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
    const projects: Project[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;

      const projectPath = path.join(PROJECTS_DIR, entry.name);

      // Check if hidden in registry
      const regEntry = registry.projects.find((p) => p.slug === entry.name);
      if (regEntry?.hidden) continue;

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
          name: regEntry?.name ?? pkg.name ?? entry.name,
          description: regEntry?.description ?? pkg.description ?? `A ${language} project`,
          language,
          lastModified: stat.mtime.toISOString(),
          path: projectPath,
          source: "auto",
        });
      } catch {
        continue;
      }
    }

    // Add manual registry entries
    for (const regEntry of registry.projects) {
      if (regEntry.source !== "manual") continue;
      if (regEntry.hidden) continue;

      let available = true;
      try {
        await fs.access(regEntry.path);
      } catch {
        available = false;
      }

      let language = "Unknown";
      let pkg: { name?: string; description?: string } = {};
      let lastModified: string | undefined;

      if (available) {
        try {
          language = await detectLanguage(regEntry.path);
          pkg = await readPackageJson(regEntry.path);
          const stat = await fs.stat(regEntry.path);
          lastModified = stat.mtime.toISOString();
        } catch {
          // ignore metadata errors
        }
      }

      projects.push({
        slug: regEntry.slug,
        name: regEntry.name ?? pkg.name ?? regEntry.slug,
        description: regEntry.description ?? pkg.description ?? `A ${language} project`,
        language,
        lastModified,
        path: regEntry.path,
        source: "manual",
        available,
      });
    }

    projects.sort((a, b) => {
      const dateA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
      const dateB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
      return dateB - dateA;
    });

    return NextResponse.json(projects, {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to list projects", details: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectPath = body.path;

    if (!projectPath || typeof projectPath !== "string" || projectPath.trim() === "") {
      return NextResponse.json({ error: "Missing or empty 'path' field" }, { status: 400 });
    }

    // Validate optional string fields
    if (body.name !== undefined && typeof body.name !== "string") {
      return NextResponse.json({ error: "'name' must be a string" }, { status: 400 });
    }
    if (body.description !== undefined && typeof body.description !== "string") {
      return NextResponse.json({ error: "'description' must be a string" }, { status: 400 });
    }

    const normalizedPath = path.resolve(projectPath.trim());

    // Validate path exists and is a directory
    try {
      const stat = await fs.stat(normalizedPath);
      if (!stat.isDirectory()) {
        return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Path does not exist" }, { status: 400 });
    }

    // Derive slug from basename, sanitized
    const slug = path.basename(normalizedPath).replace(/[^a-zA-Z0-9_-]/g, "");
    if (!slug) {
      return NextResponse.json({ error: "Cannot derive a valid slug from path" }, { status: 400 });
    }

    // Check for slug collision
    const registry = await loadRegistry();
    const existingEntry = registry.projects.find((p) => p.slug === slug);
    if (existingEntry) {
      return NextResponse.json(
        { error: `Project with slug '${slug}' already exists` },
        { status: 409 },
      );
    }

    // Check for duplicate path in registry
    const duplicatePath = registry.projects.find(
      (p) => path.resolve(p.path) === normalizedPath && !p.hidden,
    );
    if (duplicatePath) {
      return NextResponse.json(
        { error: `A project at this path already exists (slug: '${duplicatePath.slug}')` },
        { status: 409 },
      );
    }

    // Check auto-discovered projects for collision
    try {
      const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name === slug) {
          return NextResponse.json(
            { error: `Project with slug '${slug}' already exists` },
            { status: 409 },
          );
        }
      }
    } catch {
      // If we can't read PROJECTS_DIR, skip collision check for auto-discovered
    }

    // Auto-populate metadata
    const pkg = await readPackageJson(normalizedPath);
    const language = await detectLanguage(normalizedPath);

    const name = body.name?.trim() || pkg.name || slug;
    const description = body.description?.trim() || pkg.description || `A ${language} project`;

    let lastModified: string | undefined;
    try {
      const stat = await fs.stat(normalizedPath);
      lastModified = stat.mtime.toISOString();
    } catch {
      // ignore
    }

    // Save to registry
    registry.projects.push({
      slug,
      path: normalizedPath,
      source: "manual",
      name: body.name?.trim() || undefined,
      description: body.description?.trim() || undefined,
    });
    await saveRegistry(registry);

    const project: Project = {
      slug,
      name,
      description,
      language,
      lastModified,
      path: normalizedPath,
      source: "manual",
      available: true,
    };

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to add project", details: String(error) },
      { status: 500 },
    );
  }
}
