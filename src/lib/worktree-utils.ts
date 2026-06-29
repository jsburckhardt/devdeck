import { execFile } from "child_process";
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { resolveProjectPath } from "@/lib/registry";
import type { WorktreeListResponse, WorktreeSummary, WorktreeSummaryState } from "@/lib/types";

const execFileAsync = promisify(execFile);
const WORKTREE_ID_SHORT_LENGTH = 16;
const WORKTREE_ID_LONG_LENGTH = 32;

export type WorktreeResolutionErrorCode =
  | "INVALID_WORKTREE"
  | "WORKTREE_NOT_FOUND"
  | "WORKTREE_ESCAPE"
  | "WORKTREE_ID_CONFLICT"
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

interface ParsedWorktreeBlock {
  worktreePath: string;
  branch: string | null;
  head: string | null;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
}

interface InternalWorktreeSummary extends WorktreeSummary {
  resolvedPath: string;
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

export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeCanonicalKey(value: string): string {
  return path
    .resolve(value)
    .replace(/[\\/]+$/, "")
    .replace(/\\/g, "/")
    .normalize("NFC");
}

async function canonicalWorktreeKey(worktreePath: string): Promise<string> {
  const resolved = path.resolve(worktreePath);
  try {
    return normalizeCanonicalKey(await fs.realpath(resolved));
  } catch {
    return normalizeCanonicalKey(resolved);
  }
}

export function worktreeIdForCanonicalKey(
  canonicalKey: string,
  length = WORKTREE_ID_SHORT_LENGTH,
): string {
  return createHash("sha256").update(canonicalKey).digest("hex").slice(0, length);
}

function parseWorktreePorcelainBlocks(output: string): ParsedWorktreeBlock[] {
  const blocks = output.split(/\n\s*\n/).filter((block) => block.trim());
  return blocks.flatMap((block) => {
    const parsed: ParsedWorktreeBlock = {
      worktreePath: "",
      branch: null,
      head: null,
      detached: false,
      locked: false,
      prunable: false,
    };

    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) {
        parsed.worktreePath = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        parsed.head = line.slice("HEAD ".length) || null;
      } else if (line.startsWith("branch ")) {
        parsed.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "") || null;
      } else if (line.trim() === "detached") {
        parsed.detached = true;
      } else if (line.startsWith("locked")) {
        parsed.locked = true;
      } else if (line.startsWith("prunable")) {
        parsed.prunable = true;
      }
    }

    return parsed.worktreePath ? [parsed] : [];
  });
}

async function pathState(block: ParsedWorktreeBlock): Promise<WorktreeSummaryState> {
  if (block.locked) return "locked";
  if (block.prunable) return "prunable";

  try {
    const stat = await fs.stat(path.resolve(block.worktreePath));
    if (!stat.isDirectory()) return "missing";
  } catch {
    return "missing";
  }

  return block.detached ? "detached" : "available";
}

function repoRelativeLabel(projectRoot: string, worktreePath: string): string | null {
  const relative = path.relative(projectRoot, worktreePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.replace(/\\/g, "/");
}

function displayNameForWorktree(block: ParsedWorktreeBlock, projectRoot: string): string {
  const relativeLabel = repoRelativeLabel(projectRoot, path.resolve(block.worktreePath));
  if (relativeLabel?.startsWith(".trees/")) {
    return relativeLabel.slice(".trees/".length) || path.basename(block.worktreePath);
  }
  if (relativeLabel) return relativeLabel;
  return (block.branch ?? path.basename(block.worktreePath)) || "worktree";
}

function disambiguateDuplicateNames(
  worktrees: InternalWorktreeSummary[],
): InternalWorktreeSummary[] {
  const counts = new Map<string, number>();
  for (const worktree of worktrees) {
    counts.set(worktree.name, (counts.get(worktree.name) ?? 0) + 1);
  }

  return worktrees.map((worktree) =>
    (counts.get(worktree.name) ?? 0) > 1
      ? { ...worktree, name: `${worktree.name} (${worktree.id.slice(0, 6)})` }
      : worktree,
  );
}

function ensureUniqueWorktreeIds(
  entries: Array<Omit<InternalWorktreeSummary, "id"> & { canonicalKey: string }>,
): InternalWorktreeSummary[] {
  const shortGroups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const shortId = worktreeIdForCanonicalKey(entry.canonicalKey, WORKTREE_ID_SHORT_LENGTH);
    const group = shortGroups.get(shortId) ?? [];
    group.push(entry);
    shortGroups.set(shortId, group);
  }

  const withIds: InternalWorktreeSummary[] = [];
  for (const [shortId, group] of shortGroups) {
    if (group.length === 1) {
      const { canonicalKey: _canonicalKey, ...entry } = group[0];
      withIds.push({ ...entry, id: shortId });
      continue;
    }

    const longGroups = new Map<string, typeof group>();
    for (const entry of group) {
      const longId = worktreeIdForCanonicalKey(entry.canonicalKey, WORKTREE_ID_LONG_LENGTH);
      const longGroup = longGroups.get(longId) ?? [];
      longGroup.push(entry);
      longGroups.set(longId, longGroup);
    }

    if (Array.from(longGroups.values()).some((longGroup) => longGroup.length > 1)) {
      throw new WorktreeResolutionError(
        "WORKTREE_ID_CONFLICT",
        "Worktree identifiers conflict",
        409,
      );
    }

    for (const [longId, longGroup] of longGroups) {
      const { canonicalKey: _canonicalKey, ...entry } = longGroup[0];
      withIds.push({ ...entry, id: longId });
    }
  }

  return withIds;
}

async function buildInternalWorktrees(
  porcelain: string,
  projectRoot: string,
  activeWorktreeId: string | null = null,
): Promise<InternalWorktreeSummary[]> {
  const normalizedProjectRoot = await canonicalWorktreeKey(projectRoot);
  const entries = await Promise.all(
    parseWorktreePorcelainBlocks(porcelain).map(async (block) => {
      const resolvedPath = path.resolve(block.worktreePath);
      const canonicalKey = await canonicalWorktreeKey(resolvedPath);
      if (canonicalKey === normalizedProjectRoot) return null;

      return {
        canonicalKey,
        name: displayNameForWorktree(block, projectRoot),
        branch: block.branch,
        head: block.head,
        state: await pathState(block),
        active: false,
        repoRelativeLabel: repoRelativeLabel(projectRoot, resolvedPath),
        resolvedPath,
      };
    }),
  );

  const worktrees = ensureUniqueWorktreeIds(
    entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null),
  ).map((worktree) => ({
    ...worktree,
    active: activeWorktreeId === worktree.id,
  }));

  return disambiguateDuplicateNames(worktrees);
}

export async function buildWorktreeListResponse({
  activeWorktreeId = null,
  porcelain,
  projectRoot,
  projectSlug,
}: {
  activeWorktreeId?: string | null;
  porcelain: string;
  projectRoot: string;
  projectSlug: string;
}): Promise<WorktreeListResponse> {
  const worktrees = await buildInternalWorktrees(porcelain, projectRoot, activeWorktreeId);
  return {
    projectSlug,
    status: "available",
    root: {
      id: null,
      name: "Project root",
      active: activeWorktreeId === null,
    },
    worktrees: worktrees.map(({ resolvedPath: _resolvedPath, ...worktree }) => worktree),
  };
}

export async function readGitWorktreePorcelain(projectRoot: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
    cwd: projectRoot,
  });
  return stdout;
}

export function normalizeHttpWorktree(worktree: string): string {
  const trimmed = worktree.trim();
  if (!trimmed) {
    throw new WorktreeResolutionError("INVALID_WORKTREE", "Invalid 'worktree' parameter", 400);
  }
  if (
    path.isAbsolute(trimmed) ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.split(".").some((segment) => segment === "..")
  ) {
    throw new WorktreeResolutionError("INVALID_WORKTREE", "Invalid 'worktree' parameter", 400);
  }
  return trimmed;
}

export async function resolveWorktreeRoot(slug: string, worktree?: string | null): Promise<string> {
  const projectRoot = await resolveProjectPath(slug);

  if (worktree === undefined || worktree === null) {
    return projectRoot;
  }

  const worktreeId = normalizeHttpWorktree(worktree);
  let porcelain: string;
  try {
    porcelain = await readGitWorktreePorcelain(projectRoot);
  } catch {
    throw new WorktreeResolutionError("WORKTREE_NOT_FOUND", "Worktree not found", 404);
  }
  const worktrees = await buildInternalWorktrees(porcelain, projectRoot, worktreeId);
  const match = worktrees.find((candidate) => candidate.id === worktreeId);
  if (
    !match ||
    match.state === "locked" ||
    match.state === "prunable" ||
    match.state === "missing"
  ) {
    throw new WorktreeResolutionError("WORKTREE_NOT_FOUND", "Worktree not found", 404);
  }

  let realWorktreeRoot: string;
  try {
    realWorktreeRoot = await fs.realpath(match.resolvedPath);
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new WorktreeResolutionError("WORKTREE_NOT_FOUND", "Worktree not found", 404);
    }
    throw error;
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
