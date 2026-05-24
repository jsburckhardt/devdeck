import fs from "fs/promises";
import path from "path";
import { resolveProjectPath } from "@/lib/registry";

export type WorktreeResolutionErrorCode =
  | "INVALID_WORKTREE"
  | "WORKTREE_NOT_FOUND"
  | "WORKTREE_ESCAPE"
  | "PROJECT_NOT_FOUND";

export class WorktreeResolutionError extends Error {
  constructor(
    public readonly code: WorktreeResolutionErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "WorktreeResolutionError";
  }
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function isNotFoundError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

export function normalizeHttpWorktree(worktree: string): string {
  const trimmed = worktree.trim();
  if (!trimmed) {
    throw new WorktreeResolutionError("INVALID_WORKTREE", "Invalid 'worktree' parameter", 400);
  }

  const relativeWorktree = trimmed.startsWith(".trees/")
    ? trimmed.slice(".trees/".length)
    : trimmed;

  if (!relativeWorktree || path.isAbsolute(relativeWorktree)) {
    throw new WorktreeResolutionError("INVALID_WORKTREE", "Invalid 'worktree' parameter", 400);
  }

  const segments = relativeWorktree.split(/[\\/]/);
  if (segments.some((segment) => segment === ".." || segment === "")) {
    throw new WorktreeResolutionError("INVALID_WORKTREE", "Invalid 'worktree' parameter", 400);
  }

  return relativeWorktree;
}

export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function resolveWorktreeRoot(slug: string, worktree?: string | null): Promise<string> {
  const projectRoot = await resolveProjectPath(slug);

  if (worktree === undefined || worktree === null) {
    return projectRoot;
  }

  const relativeWorktree = normalizeHttpWorktree(worktree);
  let realProjectRoot: string;
  try {
    realProjectRoot = await fs.realpath(projectRoot);
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new WorktreeResolutionError("PROJECT_NOT_FOUND", "Project not found", 404);
    }
    throw error;
  }

  const candidate = path.join(projectRoot, ".trees", relativeWorktree);
  let realWorktreeRoot: string;
  try {
    realWorktreeRoot = await fs.realpath(candidate);
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new WorktreeResolutionError("WORKTREE_NOT_FOUND", "Worktree not found", 404);
    }
    throw error;
  }

  if (!isPathInside(realProjectRoot, realWorktreeRoot)) {
    throw new WorktreeResolutionError(
      "WORKTREE_ESCAPE",
      "Worktree resolves outside project root",
      403,
    );
  }

  let worktreeStats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    worktreeStats = await fs.stat(realWorktreeRoot);
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new WorktreeResolutionError("WORKTREE_NOT_FOUND", "Worktree not found", 404);
    }
    throw error;
  }
  if (!worktreeStats.isDirectory()) {
    throw new WorktreeResolutionError("WORKTREE_NOT_FOUND", "Worktree not found", 404);
  }

  return realWorktreeRoot;
}

export function worktreeResolutionErrorResponse(error: WorktreeResolutionError) {
  return Response.json({ error: error.message, code: error.code }, { status: error.status });
}
