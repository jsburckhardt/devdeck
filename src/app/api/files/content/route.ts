import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import {
  resolveWorktreeRoot,
  WorktreeResolutionError,
  worktreeResolutionErrorResponse,
} from "@/lib/worktree-utils";
import { getLanguageFromFilename, isBinaryFile } from "@/lib/file-utils";
import type { FileContent, FileKind } from "@/lib/types";

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

const CACHE_HEADERS = { "Cache-Control": "private, max-age=5, stale-while-revalidate=15" };

interface FileSystemStats {
  size: number;
  mtimeMs: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isSocket(): boolean;
  isFIFO(): boolean;
  isBlockDevice(): boolean;
  isCharacterDevice(): boolean;
}

interface PreviewTarget {
  ok: true;
  stat: FileSystemStats;
}

interface PreviewError {
  ok: false;
  status: number;
  code: string;
  kind?: FileKind;
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

function isNotFoundError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

function nonRegularError(kind: Exclude<FileKind, "regular-file" | "symlink">): PreviewError {
  if (kind === "permission-denied") {
    return { ok: false, status: 403, code: "PERMISSION_DENIED", kind };
  }
  if (kind === "broken-symlink") {
    return { ok: false, status: 422, code: "BROKEN_SYMLINK", kind };
  }
  return { ok: false, status: 415, code: "NOT_REGULAR_FILE", kind };
}

function classifyNonRegular(stat: FileSystemStats): FileKind {
  if (stat.isDirectory()) return "directory";
  if (stat.isSocket()) return "socket";
  if (stat.isFIFO()) return "fifo";
  if (stat.isBlockDevice()) return "block-device";
  if (stat.isCharacterDevice()) return "character-device";
  return "unknown";
}

async function classifyPreviewTarget(fullPath: string): Promise<PreviewTarget | PreviewError> {
  let lstat: FileSystemStats;
  try {
    lstat = (await fs.lstat(fullPath)) as FileSystemStats;
  } catch (error) {
    if (isPermissionError(error)) return nonRegularError("permission-denied");
    if (isNotFoundError(error)) {
      return { ok: false, status: 404, code: "FILE_NOT_FOUND", kind: "unknown" };
    }
    return { ok: false, status: 500, code: "READ_FAILED", kind: "unknown" };
  }

  if (lstat.isSymbolicLink()) {
    try {
      const stat = (await fs.stat(fullPath)) as FileSystemStats;
      if (stat.isFile()) return { ok: true, stat };
      return nonRegularError(
        classifyNonRegular(stat) as Exclude<FileKind, "regular-file" | "symlink">,
      );
    } catch (error) {
      if (isPermissionError(error)) return nonRegularError("permission-denied");
      return nonRegularError("broken-symlink");
    }
  }

  if (lstat.isFile()) return { ok: true, stat: lstat };
  return nonRegularError(
    classifyNonRegular(lstat) as Exclude<FileKind, "regular-file" | "symlink">,
  );
}

function previewErrorResponse(error: PreviewError) {
  return NextResponse.json(
    { error: "Cannot preview file", code: error.code, ...(error.kind ? { kind: error.kind } : {}) },
    { status: error.status },
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const slug = searchParams.get("slug");
  const filePath = searchParams.get("path");
  const worktree = searchParams.get("worktree");

  if (!slug || !filePath) {
    return NextResponse.json(
      { error: "Missing 'slug' or 'path' parameter", code: "MISSING_PARAMETERS" },
      { status: 400 },
    );
  }

  let root: string;
  try {
    root = await resolveWorktreeRoot(slug, worktree);
  } catch (error) {
    if (error instanceof WorktreeResolutionError) {
      return worktreeResolutionErrorResponse(error);
    }
    return NextResponse.json(
      { error: "Project not found", code: "PROJECT_NOT_FOUND" },
      { status: 404 },
    );
  }
  const fullPath = path.resolve(root, filePath);

  // Prevent path traversal — resolved path must remain under root
  const relative = path.relative(root, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return NextResponse.json({ error: "Invalid path", code: "INVALID_PATH" }, { status: 403 });
  }

  const target = await classifyPreviewTarget(fullPath);
  if (!target.ok) {
    return previewErrorResponse(target);
  }

  try {
    const stat = target.stat;
    const filename = path.basename(fullPath);

    if (isBinaryFile(filename)) {
      const result: FileContent = {
        content: "",
        language: "binary",
        size: stat.size,
        isBinary: true,
        path: filePath,
        name: filename,
        mtime: stat.mtimeMs,
      };
      return NextResponse.json(result, { headers: CACHE_HEADERS });
    }

    if (stat.size > MAX_FILE_SIZE) {
      const result: FileContent = {
        content: `File is too large to display (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 1MB.`,
        language: getLanguageFromFilename(filename),
        size: stat.size,
        isBinary: false,
        path: filePath,
        name: filename,
        mtime: stat.mtimeMs,
      };
      return NextResponse.json(result, { headers: CACHE_HEADERS });
    }

    const content = await fs.readFile(fullPath, "utf-8");
    const result: FileContent = {
      content,
      language: getLanguageFromFilename(filename),
      size: stat.size,
      isBinary: false,
      path: filePath,
      name: filename,
      mtime: stat.mtimeMs,
    };
    return NextResponse.json(result, { headers: CACHE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Cannot preview file",
        code: "READ_FAILED",
        kind: "regular-file",
        details: String(error),
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  let body: {
    slug?: string;
    path?: string;
    content?: string;
    mtime?: number;
    worktree?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { slug, path: filePath, content, mtime, worktree } = body;

  if (!slug || !filePath || content === undefined || content === null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let root: string;
  try {
    root = await resolveWorktreeRoot(slug, worktree);
  } catch (error) {
    if (error instanceof WorktreeResolutionError) {
      return worktreeResolutionErrorResponse(error);
    }
    return NextResponse.json(
      { error: "Project not found", code: "PROJECT_NOT_FOUND" },
      { status: 404 },
    );
  }
  const fullPath = path.resolve(root, filePath);

  const relative = path.relative(root, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  const filename = path.basename(fullPath);
  if (isBinaryFile(filename)) {
    return NextResponse.json({ error: "Cannot edit binary files" }, { status: 403 });
  }

  const contentStr = String(content);
  if (Buffer.byteLength(contentStr, "utf-8") > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Content too large" }, { status: 413 });
  }

  try {
    const stat = await fs.stat(fullPath);

    // Optimistic concurrency: reject if file was modified since load
    if (mtime !== undefined && Math.floor(stat.mtimeMs) !== Math.floor(mtime)) {
      return NextResponse.json(
        { error: "File was modified externally", code: "CONFLICT" },
        { status: 409 },
      );
    }

    // Atomic write: temp file + rename
    const tmpPath = fullPath + ".tmp." + Date.now();
    await fs.writeFile(tmpPath, contentStr, "utf-8");
    await fs.rename(tmpPath, fullPath);

    const newStat = await fs.stat(fullPath);
    const result: FileContent = {
      content: contentStr,
      language: getLanguageFromFilename(filename),
      size: newStat.size,
      isBinary: false,
      path: filePath,
      name: filename,
      mtime: newStat.mtimeMs,
    };
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to write file", details: String(error) },
      { status: 500 },
    );
  }
}
