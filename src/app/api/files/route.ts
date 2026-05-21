import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolveProjectPath } from "@/lib/registry";
import type { FileKind, FileNode } from "@/lib/types";

const execFileAsync = promisify(execFile);

const EXCLUDED_NAMES = new Set([".git"]);

type GitStatus = "added" | "modified" | "deleted";

interface FileSystemStats {
  size: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isSocket(): boolean;
  isFIFO(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
}

interface ClassifiedEntry {
  type: "file" | "directory";
  kind: FileKind;
  unreadable?: boolean;
  size?: number;
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function isPermissionError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "EACCES" || code === "EPERM";
}

function classifyStats(stats: FileSystemStats): ClassifiedEntry {
  if (stats.isDirectory()) return { type: "directory", kind: "directory" };
  if (stats.isFile()) return { type: "file", kind: "regular-file", size: stats.size };
  if (stats.isSocket()) return { type: "file", kind: "socket", unreadable: true, size: stats.size };
  if (stats.isFIFO()) return { type: "file", kind: "fifo", unreadable: true, size: stats.size };
  if (stats.isBlockDevice()) {
    return { type: "file", kind: "block-device", unreadable: true, size: stats.size };
  }
  if (stats.isCharacterDevice()) {
    return { type: "file", kind: "character-device", unreadable: true, size: stats.size };
  }
  return { type: "file", kind: "unknown", unreadable: true, size: stats.size };
}

async function classifyPath(fullPath: string): Promise<ClassifiedEntry> {
  try {
    const lstat = (await fs.lstat(fullPath)) as FileSystemStats;
    if (lstat.isSymbolicLink()) {
      try {
        const stat = (await fs.stat(fullPath)) as FileSystemStats;
        if (stat.isFile()) {
          return { type: "file", kind: "symlink", size: stat.size };
        }
        return { type: "file", kind: "symlink", unreadable: true, size: lstat.size };
      } catch (error) {
        return {
          type: "file",
          kind: isPermissionError(error) ? "permission-denied" : "broken-symlink",
          unreadable: true,
          size: lstat.size,
        };
      }
    }
    return classifyStats(lstat);
  } catch (error) {
    return {
      type: "file",
      kind: isPermissionError(error) ? "permission-denied" : "unknown",
      unreadable: true,
      size: 0,
    };
  }
}

async function getGitStatus(projectRoot: string): Promise<Map<string, GitStatus>> {
  const statusMap = new Map<string, GitStatus>();
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
    // Not a git repo or git not available. Tree visibility must not depend on git status.
  }
  return statusMap;
}

async function hasDirectChildren(dirPath: string): Promise<boolean> {
  const entries = await fs.readdir(dirPath);
  return entries.length > 0;
}

async function readDirectoryChildren(
  dirPath: string,
  projectRoot: string,
  gitStatus: Map<string, GitStatus>,
): Promise<FileNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const filteredEntries = entries.filter((entry) => !EXCLUDED_NAMES.has(entry.name));

  const classifiedEntries = await Promise.all(
    filteredEntries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      return { entry, fullPath, classification: await classifyPath(fullPath) };
    }),
  );

  const nodes: FileNode[] = [];

  for (const { entry, fullPath, classification } of classifiedEntries) {
    const relativePath = path.relative(projectRoot, fullPath);
    const baseNode = {
      name: entry.name,
      path: relativePath,
      type: classification.type,
      kind: classification.kind,
      status:
        classification.type === "directory"
          ? inferDirStatus(relativePath, gitStatus)
          : gitStatus.get(relativePath),
      ...(classification.size !== undefined ? { size: classification.size } : {}),
      ...(classification.unreadable ? { unreadable: true } : {}),
    } satisfies Omit<FileNode, "children" | "hasChildren" | "childrenLoaded">;

    if (classification.type !== "directory") {
      nodes.push(baseNode);
      continue;
    }

    if (classification.unreadable) {
      nodes.push({
        ...baseNode,
        type: "directory",
        kind: classification.kind,
        unreadable: true,
        hasChildren: false,
        childrenLoaded: true,
        children: [],
      });
      continue;
    }

    try {
      const containsChildren = await hasDirectChildren(fullPath);
      nodes.push({
        ...baseNode,
        type: "directory",
        hasChildren: containsChildren,
        childrenLoaded: !containsChildren,
        ...(containsChildren ? {} : { children: [] }),
      });
    } catch (error) {
      nodes.push({
        ...baseNode,
        type: "directory",
        kind: isPermissionError(error) ? "permission-denied" : "unknown",
        unreadable: true,
        hasChildren: false,
        childrenLoaded: true,
        children: [],
      });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

function resolveRequestedDirectory(
  projectRoot: string,
  requestedPath: string | null,
): string | null {
  if (!requestedPath) return projectRoot;
  if (path.isAbsolute(requestedPath)) return null;

  const resolved = path.resolve(projectRoot, requestedPath);
  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

function inferDirStatus(dirPath: string, gitStatus: Map<string, GitStatus>): GitStatus | undefined {
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
  const requestedPath = searchParams.get("path");

  if (!slug) {
    return NextResponse.json(
      { error: "Missing 'slug' parameter", code: "MISSING_PARAMETERS" },
      { status: 400 },
    );
  }

  const root = await resolveProjectPath(slug);

  try {
    await fs.access(root);
  } catch {
    return NextResponse.json(
      { error: "Project not found", code: "PROJECT_NOT_FOUND" },
      { status: 404 },
    );
  }

  const targetDirectory = resolveRequestedDirectory(root, requestedPath);
  if (!targetDirectory) {
    return NextResponse.json(
      { error: "Invalid 'path' parameter", code: "INVALID_PATH" },
      { status: 400 },
    );
  }

  if (requestedPath) {
    try {
      const targetStats = (await fs.stat(targetDirectory)) as FileSystemStats;
      if (!targetStats.isDirectory()) {
        return NextResponse.json(
          { error: "Requested path is not a directory", code: "NOT_A_DIRECTORY" },
          { status: 400 },
        );
      }
    } catch (error) {
      const status = isPermissionError(error) ? 403 : 404;
      return NextResponse.json(
        { error: "Requested directory is not readable", code: "DIRECTORY_NOT_READABLE" },
        { status },
      );
    }
  }

  try {
    const gitStatus = await getGitStatus(root);
    const tree = await readDirectoryChildren(targetDirectory, root, gitStatus);
    return NextResponse.json(tree, {
      headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=15" },
    });
  } catch (error) {
    if (requestedPath && isPermissionError(error)) {
      return NextResponse.json(
        { error: "Requested directory is not readable", code: "DIRECTORY_NOT_READABLE" },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "Failed to read directory", code: "READ_DIRECTORY_FAILED", details: String(error) },
      { status: 500 },
    );
  }
}
