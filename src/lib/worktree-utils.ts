import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolveProjectPath } from "@/lib/registry";
import type {
  WorkspaceContextChoice,
  WorkspaceContextId,
  WorkspaceContextResponse,
  WorkspaceContextStatus,
} from "@/lib/types";

const execFileAsync = promisify(execFile);

export type WorktreeResolutionErrorCode =
  | "INVALID_WORKTREE"
  | "WORKSPACE_CONTEXT_STALE"
  | "WORKSPACE_CONTEXT_DISABLED"
  | "WORKSPACE_CONTEXT_CONFLICT"
  | "WORKSPACE_CONTEXT_UNAVAILABLE"
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

function normalizeRelativeWorktreeInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith(".trees/") ? trimmed.slice(".trees/".length) : trimmed;
}

export function normalizeHttpWorktree(worktree: string): string {
  const trimmed = worktree.trim();
  if (!trimmed) {
    throw new WorktreeResolutionError("INVALID_WORKTREE", "Invalid 'worktree' parameter", 400);
  }

  const relativeWorktree = normalizeRelativeWorktreeInput(trimmed);
  if (!relativeWorktree || path.isAbsolute(relativeWorktree)) {
    throw new WorktreeResolutionError("INVALID_WORKTREE", "Invalid 'worktree' parameter", 400);
  }

  const segments = relativeWorktree.split(/[\/]/);
  if (segments.some((segment) => segment === ".." || segment === "")) {
    throw new WorktreeResolutionError("INVALID_WORKTREE", "Invalid 'worktree' parameter", 400);
  }

  return relativeWorktree;
}

export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function createWorkspaceContextId(projectRoot: string, worktreePath: string): WorkspaceContextId {
  const hash = createHash("sha256")
    .update(`${projectRoot}\0${worktreePath}`)
    .digest("hex")
    .slice(0, 24);
  return `wt_${hash}` as WorkspaceContextId;
}

interface ParsedWorktreeEntry {
  worktreePath: string;
  branch: string;
  locked: boolean;
  prunable: boolean;
  detached: boolean;
}

function parseWorktreePorcelain(output: string): ParsedWorktreeEntry[] {
  const blocks = output.split("\n\n").filter((block) => block.trim());
  const entries: ParsedWorktreeEntry[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    let worktreePath = "";
    let branch = "";
    let locked = false;
    let prunable = false;
    let detached = false;

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        worktreePath = line.slice("worktree ".length);
      } else if (line.startsWith("branch ")) {
        branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
      } else if (line.trim() === "detached") {
        detached = true;
      } else if (line.startsWith("locked")) {
        locked = true;
      } else if (line.startsWith("prunable")) {
        prunable = true;
      }
    }

    if (!worktreePath) continue;
    entries.push({
      worktreePath,
      branch: branch || (detached ? "(detached)" : path.basename(worktreePath)),
      locked,
      prunable,
      detached,
    });
  }

  return entries;
}

function getWorktreeStatus(entry: ParsedWorktreeEntry): WorkspaceContextStatus {
  if (entry.locked || entry.prunable) {
    return entry.locked ? "locked" : "prunable";
  }
  return "active";
}

function buildWorktreeLabel(entry: ParsedWorktreeEntry, _projectRoot: string): string {
  const baseName = path.basename(entry.worktreePath) || "worktree";
  const normalizedPath = entry.worktreePath.replace(/\\/g, "/");
  const basename = normalizedPath.split("/").filter(Boolean).pop() ?? baseName;
  return basename || baseName;
}

function buildChoiceLabel(entry: ParsedWorktreeEntry, projectRoot: string): string {
  const fallbackLabel = buildWorktreeLabel(entry, projectRoot);
  if (!entry.branch || entry.branch === "(detached)") return fallbackLabel;
  return `${fallbackLabel} · ${entry.branch}`;
}

async function resolveParsedWorkspaceEntries(slug: string): Promise<ParsedWorktreeEntry[]> {
  const projectRoot = await resolveProjectPath(slug);
  let stdout = "";
  try {
    const result = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
      cwd: projectRoot,
    });
    stdout = result.stdout;
  } catch {
    return [];
  }
  return parseWorktreePorcelain(stdout);
}

export function sanitizeRemoteLabel(remote: string): string {
  const trimmed = remote.trim();
  if (!trimmed) return "origin";

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      url.username = "";
      url.password = "";
      const pathname = url.pathname === "/" ? "" : url.pathname;
      return (
        `${url.protocol}//${url.host}${pathname}`.replace(/\/$/, "") ||
        `${url.protocol}//${url.host}`
      );
    }

    if (/^ssh:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      url.username = "";
      const pathname = url.pathname === "/" ? "" : url.pathname;
      return (
        `${url.protocol}//${url.host}${pathname}`.replace(/\/$/, "") ||
        `${url.protocol}//${url.host}`
      );
    }
  } catch {
    // fall through for scp-like remotes
  }

  if (/^[^@]+@[^:]+:.+$/.test(trimmed)) {
    const match = trimmed.match(/^[^@]+@([^:]+):(.+)$/);
    if (match) return `${match[1]}/${match[2].replace(/^\//, "")}`;
  }

  if (trimmed.includes("@") && trimmed.includes(":")) {
    return trimmed.split(":")[1] ?? "origin";
  }

  return trimmed.replace(/\?.*$/, "").replace(/#.*$/, "");
}

export async function listWorkspaceContexts(slug: string): Promise<WorkspaceContextResponse> {
  const projectRoot = await resolveProjectPath(slug);
  let realProjectRoot: string;
  try {
    realProjectRoot = await fs.realpath(projectRoot);
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new WorktreeResolutionError("PROJECT_NOT_FOUND", "Project not found", 404);
    }
    throw error;
  }

  const rootChoice: WorkspaceContextChoice = {
    id: "root",
    label: "Project root",
    kind: "root",
    status: "active",
    available: true,
    disabled: false,
    summary: "Project root",
  };

  let stdout = "";
  try {
    const result = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
      cwd: projectRoot,
    });
    stdout = result.stdout;
  } catch {
    return {
      root: rootChoice,
      choices: [rootChoice],
      repository: {
        status: "git-unavailable",
        message: "Git is unavailable for this repository",
        errorCode: "GIT_UNAVAILABLE",
      },
      selectedContextId: "root",
      empty: true,
    };
  }

  const entries = parseWorktreePorcelain(stdout);
  const seenIds = new Map<string, string>();
  const choices: WorkspaceContextChoice[] = [rootChoice];

  for (const entry of entries) {
    let resolvedWorktreePath = entry.worktreePath;
    try {
      resolvedWorktreePath = await fs.realpath(entry.worktreePath);
    } catch {
      // keep the path as reported when it is missing or unavailable
    }
    if (resolvedWorktreePath === realProjectRoot) {
      continue;
    }
    const id = createWorkspaceContextId(realProjectRoot, resolvedWorktreePath);
    const existingOwner = seenIds.get(id);
    const disabled = entry.locked || entry.prunable;
    const status = existingOwner ? "conflict" : disabled ? getWorktreeStatus(entry) : "active";
    const choice: WorkspaceContextChoice = {
      id,
      label: buildChoiceLabel(entry, realProjectRoot),
      kind: "worktree",
      status,
      available: !existingOwner && !disabled,
      disabled,
      disabledReason: disabled
        ? entry.locked
          ? "Locked worktree"
          : "Prunable worktree"
        : undefined,
      branch: entry.branch,
      repositoryLabel: path.basename(realProjectRoot) || "repository",
      remoteLabel: sanitizeRemoteLabel("origin"),
      pathLabel:
        path.relative(realProjectRoot, resolvedWorktreePath) || path.basename(resolvedWorktreePath),
      summary: entry.branch === "(detached)" ? "Detached HEAD" : entry.branch,
    };
    if (existingOwner) {
      choices.push({
        ...choice,
        label: `${choice.label} · duplicate`,
        status: "conflict",
        available: false,
        disabled: true,
        disabledReason: "Duplicate workspace context",
      });
    } else {
      choices.push(choice);
    }
    seenIds.set(id, entry.worktreePath);
  }

  return {
    root: rootChoice,
    choices,
    repository: {
      status: "ok",
      label: path.basename(realProjectRoot),
      remoteLabel: sanitizeRemoteLabel("origin"),
    },
    selectedContextId: "root",
    empty: choices.length === 1,
  };
}

function resolveLegacyWorktreeRoot(projectRoot: string, worktree?: string | null): string {
  if (worktree === undefined || worktree === null) return projectRoot;
  const relativeWorktree = normalizeHttpWorktree(worktree);
  const candidate = path.join(projectRoot, ".trees", relativeWorktree);
  return candidate;
}

export async function resolveWorkspaceContextRoot(
  slug: string,
  workspaceContext?: string | null,
  legacyWorktree?: string | null,
): Promise<{ root: string; context: WorkspaceContextId }> {
  const projectRoot = await resolveProjectPath(slug);
  const hasExplicitWorkspaceContext = workspaceContext !== undefined && workspaceContext !== null;
  const hasExplicitLegacyWorktree = legacyWorktree !== undefined && legacyWorktree !== null;
  const normalizedWorkspaceContext = (workspaceContext ?? "").trim();
  const normalizedLegacyWorktree = hasExplicitLegacyWorktree ? (legacyWorktree ?? "").trim() : "";
  const wantsLegacyWorktree =
    !hasExplicitWorkspaceContext ||
    normalizedWorkspaceContext === "" ||
    normalizedWorkspaceContext === "root";

  if (wantsLegacyWorktree && !hasExplicitLegacyWorktree) {
    return { root: projectRoot, context: "root" };
  }

  if (hasExplicitWorkspaceContext && normalizedWorkspaceContext === "") {
    throw new WorktreeResolutionError("INVALID_WORKTREE", "Invalid 'worktree' parameter", 400);
  }

  if (wantsLegacyWorktree && hasExplicitLegacyWorktree && !normalizedLegacyWorktree) {
    throw new WorktreeResolutionError("INVALID_WORKTREE", "Invalid 'worktree' parameter", 400);
  }

  const realProjectRoot = await fs.realpath(projectRoot).catch((error) => {
    if (isNotFoundError(error)) {
      throw new WorktreeResolutionError("PROJECT_NOT_FOUND", "Project not found", 404);
    }
    throw error;
  });

  if (!normalizedWorkspaceContext || normalizedWorkspaceContext === "root") {
    const legacyRoot = resolveLegacyWorktreeRoot(realProjectRoot, normalizedLegacyWorktree);
    let realWorktreeRoot: string;
    try {
      realWorktreeRoot = await fs.realpath(legacyRoot);
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

    let stat: { isDirectory(): boolean };
    try {
      stat = (await fs.stat(realWorktreeRoot)) as { isDirectory(): boolean };
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new WorktreeResolutionError("WORKTREE_NOT_FOUND", "Worktree not found", 404);
      }
      throw error;
    }

    if (!stat.isDirectory()) {
      throw new WorktreeResolutionError("WORKTREE_NOT_FOUND", "Worktree not found", 404);
    }

    return { root: realWorktreeRoot, context: "root" };
  }

  if (normalizedWorkspaceContext.startsWith("wt_")) {
    const entries = await resolveParsedWorkspaceEntries(slug);
    let matchedEntry: ParsedWorktreeEntry | undefined;
    for (const entry of entries) {
      let resolvedWorktreePath = entry.worktreePath;
      try {
        resolvedWorktreePath = await fs.realpath(entry.worktreePath);
      } catch {
        // keep the reported path if the worktree is currently unavailable
      }
      const candidateId = createWorkspaceContextId(realProjectRoot, resolvedWorktreePath);
      if (candidateId === normalizedWorkspaceContext) {
        matchedEntry = entry;
        break;
      }
    }
    if (!matchedEntry) {
      throw new WorktreeResolutionError(
        "WORKSPACE_CONTEXT_STALE",
        "Selected workspace is unavailable",
        409,
      );
    }

    const status = getWorktreeStatus(matchedEntry);
    if (status !== "active") {
      throw new WorktreeResolutionError(
        "WORKSPACE_CONTEXT_DISABLED",
        "Selected workspace is unavailable",
        409,
      );
    }

    let resolvedWorktreePath = matchedEntry.worktreePath;
    try {
      resolvedWorktreePath = await fs.realpath(matchedEntry.worktreePath);
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new WorktreeResolutionError(
          "WORKSPACE_CONTEXT_STALE",
          "Selected workspace is unavailable",
          409,
        );
      }
      throw error;
    }
    if (!isPathInside(realProjectRoot, resolvedWorktreePath)) {
      throw new WorktreeResolutionError(
        "WORKTREE_ESCAPE",
        "Worktree resolves outside project root",
        403,
      );
    }
    return {
      root: resolvedWorktreePath,
      context: normalizedWorkspaceContext as WorkspaceContextId,
    };
  }

  const legacyRoot = resolveLegacyWorktreeRoot(
    realProjectRoot,
    normalizedLegacyWorktree || normalizedWorkspaceContext,
  );
  let realWorktreeRoot: string;
  try {
    realWorktreeRoot = await fs.realpath(legacyRoot);
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

  return { root: realWorktreeRoot, context: "root" };
}

export async function resolveWorktreeRoot(slug: string, worktree?: string | null): Promise<string> {
  const { root } = await resolveWorkspaceContextRoot(slug, undefined, worktree ?? null);
  return root;
}

export function worktreeResolutionErrorResponse(error: WorktreeResolutionError) {
  return Response.json({ error: error.message, code: error.code }, { status: error.status });
}
