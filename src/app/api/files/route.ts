import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolveProjectPath } from "@/app/api/projects/route";
import type { FileNode } from "@/lib/types";

const execFileAsync = promisify(execFile);

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  ".cache",
  ".devcontainer",
  "__pycache__",
  ".playwright-mcp",
]);

const IGNORED_FILES = new Set([".DS_Store", "Thumbs.db", "package-lock.json"]);

async function getGitStatus(
  projectRoot: string,
): Promise<Map<string, "added" | "modified" | "deleted">> {
  const statusMap = new Map<string, "added" | "modified" | "deleted">();
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain", "-u"], {
      cwd: projectRoot,
    });
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const status = line.substring(0, 2).trim();
      const filePath = line.substring(3).trim();
      if (status.includes("A") || status === "??") {
        statusMap.set(filePath, "added");
      } else if (status.includes("D")) {
        statusMap.set(filePath, "deleted");
      } else if (status.includes("M") || status.includes("R")) {
        statusMap.set(filePath, "modified");
      }
    }
  } catch {
    // Not a git repo or git not available
  }
  return statusMap;
}

async function readDirectory(
  dirPath: string,
  projectRoot: string,
  gitStatus: Map<string, "added" | "modified" | "deleted">,
  depth: number = 0,
  maxDepth: number = 6,
): Promise<FileNode[]> {
  if (depth > maxDepth) return [];

  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  const filteredEntries = entries.filter(
    (entry) => !IGNORED_DIRS.has(entry.name) && !IGNORED_FILES.has(entry.name),
  );

  const nodes: FileNode[] = [];

  // Separate directories and files for processing
  const dirEntries = filteredEntries.filter((e) => e.isDirectory());
  const fileEntries = filteredEntries.filter((e) => !e.isDirectory());

  // Process directories (sequential recursion is fine)
  for (const entry of dirEntries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(projectRoot, fullPath);
    const children = await readDirectory(fullPath, projectRoot, gitStatus, depth + 1, maxDepth);
    const dirStatus = inferDirStatus(relativePath, gitStatus);
    nodes.push({
      name: entry.name,
      path: relativePath,
      type: "directory",
      children,
      status: dirStatus,
    });
  }

  // Parallelize fs.stat() calls for files
  const fileStats = await Promise.all(
    fileEntries.map((entry) => {
      const fullPath = path.join(dirPath, entry.name);
      return fs.stat(fullPath).catch(() => null);
    }),
  );

  for (let i = 0; i < fileEntries.length; i++) {
    const entry = fileEntries[i];
    const relativePath = path.relative(projectRoot, path.join(dirPath, entry.name));
    const stat = fileStats[i];
    nodes.push({
      name: entry.name,
      path: relativePath,
      type: "file",
      size: stat?.size ?? 0,
      status: gitStatus.get(relativePath),
    });
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

function inferDirStatus(
  dirPath: string,
  gitStatus: Map<string, "added" | "modified" | "deleted">,
): "added" | "modified" | "deleted" | undefined {
  for (const [filePath] of gitStatus) {
    if (filePath.startsWith(dirPath + "/")) {
      return "modified";
    }
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing 'slug' parameter" }, { status: 400 });
  }

  const root = resolveProjectPath(slug);

  try {
    await fs.access(root);
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const gitStatus = await getGitStatus(root);
    const tree = await readDirectory(root, root, gitStatus);
    return NextResponse.json(tree, {
      headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=15" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read directory", details: String(error) },
      { status: 500 },
    );
  }
}
