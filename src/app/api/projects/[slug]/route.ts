import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs/promises";
import { promisify } from "util";
import {
  loadRegistry,
  saveRegistry,
  detectLanguage,
  readPackageJson,
  resolveProjectRecord,
} from "@/lib/registry";
import type { Project, ProjectDetailResponse, RepoUrlStatus } from "@/lib/types";

const PROJECTS_DIR = process.env.DEVDECK_PROJECTS_DIR ?? "/workspaces";
const execFileAsync = promisify(execFile);
const CACHE_HEADERS = { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" };

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function sanitizeRemoteUrl(rawRemote: string): { repoUrl: string; repoUrlDisplay: string } | null {
  const remote = rawRemote.trim();
  if (!remote) return null;

  const scpLike = remote.match(/^(?:[^@/:]+@)?([^:]+):(.+)$/);
  if (scpLike && !remote.includes("://")) {
    const host = scpLike[1]?.trim();
    const repoPath = scpLike[2]?.trim().replace(/^\/+/, "");
    if (!host || !repoPath || host.includes("@")) return null;
    return {
      repoUrl: `ssh://${host}/${repoPath}`,
      repoUrlDisplay: `${host}/${repoPath}`,
    };
  }

  try {
    const url = new URL(remote);
    if (!["https:", "http:", "ssh:", "git:"].includes(url.protocol)) return null;
    url.username = "";
    url.password = "";
    const pathname = url.pathname.replace(/^\/+/, "");
    return {
      repoUrl: url.toString(),
      repoUrlDisplay: `${url.host}${pathname ? `/${pathname}` : ""}`,
    };
  } catch {
    return null;
  }
}

async function repoUrlStatus(projectPath: string): Promise<{
  repoUrl: string | null;
  repoUrlDisplay: string | null;
  repoUrlStatus: RepoUrlStatus;
}> {
  try {
    const { stdout } = await execFileAsync("git", ["config", "--get", "remote.origin.url"], {
      cwd: projectPath,
    });
    const sanitized = sanitizeRemoteUrl(stdout);
    if (!sanitized) {
      return { repoUrl: null, repoUrlDisplay: null, repoUrlStatus: "invalid" };
    }
    return { ...sanitized, repoUrlStatus: "available" };
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return { repoUrl: null, repoUrlDisplay: null, repoUrlStatus: "git-unavailable" };
    }

    const hasGitMetadata = await fs
      .access(`${projectPath}/.git`)
      .then(() => true)
      .catch(() => false);
    return {
      repoUrl: null,
      repoUrlDisplay: null,
      repoUrlStatus: hasGitMetadata ? "no-origin" : "not-git",
    };
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const record = await resolveProjectRecord(slug);
    if (!record) {
      return NextResponse.json(
        { error: "Project not found", code: "PROJECT_NOT_FOUND" },
        { status: 404 },
      );
    }

    if (!record.exists) {
      const body: ProjectDetailResponse = {
        slug: record.slug,
        name: record.name ?? record.slug,
        ...(record.description ? { description: record.description } : {}),
        available: false,
        repoUrl: null,
        repoUrlDisplay: null,
        repoUrlStatus: "unavailable",
      };
      return NextResponse.json(body, { headers: CACHE_HEADERS });
    }

    const pkg = await readPackageJson(record.path);
    const language = await detectLanguage(record.path);
    const repo = await repoUrlStatus(record.path);
    const body: ProjectDetailResponse = {
      slug: record.slug,
      name: record.name ?? pkg.name ?? record.slug,
      description: record.description ?? pkg.description ?? `A ${language} project`,
      language,
      available: true,
      ...repo,
    };

    return NextResponse.json(body, { headers: CACHE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load project", code: "PROJECT_DETAIL_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const registry = await loadRegistry();

    const entryIndex = registry.projects.findIndex((p) => p.slug === slug);
    if (entryIndex === -1) {
      return NextResponse.json({ error: "Project not found in registry" }, { status: 404 });
    }

    const entry = registry.projects[entryIndex];

    // Update fields (slug is immutable)
    if (body.name !== undefined) {
      if (typeof body.name !== "string") {
        return NextResponse.json({ error: "'name' must be a string" }, { status: 400 });
      }
      entry.name = body.name.trim() || undefined;
    }
    if (body.description !== undefined) {
      if (typeof body.description !== "string") {
        return NextResponse.json({ error: "'description' must be a string" }, { status: 400 });
      }
      entry.description = body.description.trim() || undefined;
    }
    if (body.path !== undefined) {
      if (typeof body.path !== "string" || !body.path.trim()) {
        return NextResponse.json({ error: "'path' must be a non-empty string" }, { status: 400 });
      }
      // Validate new path
      try {
        const stat = await fs.stat(body.path);
        if (!stat.isDirectory()) {
          return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
        }
        entry.path = body.path;
      } catch {
        return NextResponse.json({ error: "Path does not exist" }, { status: 400 });
      }
    }

    registry.projects[entryIndex] = entry;
    await saveRegistry(registry);

    // Build response project
    const language = await detectLanguage(entry.path);
    const pkg = await readPackageJson(entry.path);
    let lastModified: string | undefined;
    try {
      const stat = await fs.stat(entry.path);
      lastModified = stat.mtime.toISOString();
    } catch {
      // ignore
    }

    const project: Project = {
      slug: entry.slug,
      name: entry.name ?? pkg.name ?? entry.slug,
      description: entry.description ?? pkg.description ?? `A ${language} project`,
      language,
      lastModified,
      path: entry.path,
      source: entry.source,
    };

    return NextResponse.json(project);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update project", details: String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const registry = await loadRegistry();

    const entryIndex = registry.projects.findIndex((p) => p.slug === slug);

    if (entryIndex !== -1) {
      const entry = registry.projects[entryIndex];
      if (entry.source === "manual") {
        // Remove manual entries entirely
        registry.projects.splice(entryIndex, 1);
      } else {
        // Hide auto-discovered entries
        entry.hidden = true;
        registry.projects[entryIndex] = entry;
      }
      await saveRegistry(registry);
      return NextResponse.json({ message: `Project '${slug}' removed` });
    }

    // Check if it's an auto-discovered project
    try {
      const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
      const autoDiscovered = entries.some((e) => e.isDirectory() && e.name === slug);
      if (autoDiscovered) {
        // Add hidden entry for auto-discovered project
        registry.projects.push({
          slug,
          path: `${PROJECTS_DIR}/${slug}`,
          source: "auto",
          hidden: true,
        });
        await saveRegistry(registry);
        return NextResponse.json({ message: `Project '${slug}' hidden` });
      }
    } catch {
      // Can't read PROJECTS_DIR
    }

    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete project", details: String(error) },
      { status: 500 },
    );
  }
}
