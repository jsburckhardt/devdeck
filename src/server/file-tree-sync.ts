import fs from "fs/promises";
import path from "path";
import { watch, type FSWatcher } from "chokidar";
import {
  normalizeHttpWorktree,
  resolveWorktreeRoot,
  WorktreeResolutionError,
} from "@/lib/worktree-utils";
import type { FileTreeChangedEvent, FileTreeDegradedEvent, FileTreeSyncScope } from "@/lib/types";

export const FILE_TREE_SYNC_DEBOUNCE_MS = 250;
export const FILE_TREE_SYNC_FORCE_FLUSH_MS = 1000;
export const FILE_TREE_SYNC_MAX_PATH_HINTS = 256;
export const FILE_TREE_SYNC_FALLBACK_POLL_INTERVAL_MS = 5000;

const DEFAULT_MAX_WATCHED_ROOTS = 32;
const DEFAULT_MAX_SUBSCRIBERS_PER_WATCHER = 32;
const DEFAULT_MAX_TOTAL_SUBSCRIBERS = 128;
const DEFAULT_RETRY_AFTER_MS = 1000;

type FileTreeWatcherEventName =
  | "add"
  | "addDir"
  | "change"
  | "unlink"
  | "unlinkDir"
  | "ready"
  | "error";

type WatchFactory = (
  root: string,
  options: {
    ignoreInitial: boolean;
    persistent: boolean;
    followSymlinks: boolean;
    ignored: (candidatePath: string) => boolean;
  },
) => Pick<FSWatcher, "on" | "close">;

interface FileTreeSyncLimits {
  maxWatchedRoots: number;
  maxSubscribersPerWatcher: number;
  maxTotalSubscribers: number;
}

export interface SubscribeFileTreeChangesOptions {
  slug: string;
  worktree?: string | null;
  onChange: (event: FileTreeChangedEvent) => void;
  onDegraded?: (event: FileTreeDegradedEvent) => void;
  signal?: AbortSignal;
}

export interface FileTreeWatcherSubscription {
  ok: true;
  scope: FileTreeSyncScope;
  unsubscribe: () => void;
}

export interface FileTreeWatcherDegradedResult {
  ok: false;
  scope: FileTreeSyncScope;
  code: string;
  message: string;
  retryAfterMs?: number;
  pollIntervalMs: number;
  fatal?: boolean;
  status?: number;
}

export type FileTreeWatcherSubscriptionResult =
  | FileTreeWatcherSubscription
  | FileTreeWatcherDegradedResult;

interface WatcherSubscriber {
  id: symbol;
  onChange: (event: FileTreeChangedEvent) => void;
  onDegraded?: (event: FileTreeDegradedEvent) => void;
}

interface PendingBatch {
  paths: Set<string>;
  directories: Set<string>;
  totalPathCount: number;
  rootChanged: boolean;
  gitStatusChanged: boolean;
  truncated: boolean;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  forceTimer: ReturnType<typeof setTimeout> | null;
}

interface WatcherRegistryEntry {
  key: string;
  scope: FileTreeSyncScope;
  root: string;
  watcher: Pick<FSWatcher, "on" | "close">;
  subscribers: Map<symbol, WatcherSubscriber>;
  pending: PendingBatch | null;
  version: number;
  closing: boolean;
}

const registry = new Map<string, WatcherRegistryEntry>();
let watchFactory: WatchFactory = watch;
let limits: FileTreeSyncLimits = {
  maxWatchedRoots: DEFAULT_MAX_WATCHED_ROOTS,
  maxSubscribersPerWatcher: DEFAULT_MAX_SUBSCRIBERS_PER_WATCHER,
  maxTotalSubscribers: DEFAULT_MAX_TOTAL_SUBSCRIBERS,
};

function totalSubscriberCount(): number {
  let total = 0;
  for (const entry of registry.values()) {
    total += entry.subscribers.size;
  }
  return total;
}

function normalizedSlug(slug: string): string | null {
  const trimmed = slug.trim();
  if (!trimmed || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

export function normalizeFileTreeSyncWorktree(worktree: string | null | undefined): string | null {
  if (worktree === null || worktree === undefined) return null;
  const relativeWorktree = normalizeHttpWorktree(worktree);
  return `.trees/${relativeWorktree}`;
}

export async function resolveFileTreeSyncScope(
  slug: string,
  worktree: string | null | undefined,
): Promise<{ scope: FileTreeSyncScope; root: string }> {
  const safeSlug = normalizedSlug(slug);
  if (!safeSlug) {
    throw new WorktreeResolutionError("PROJECT_NOT_FOUND", "Invalid 'slug' parameter", 400);
  }

  const scopeWorktree = normalizeFileTreeSyncWorktree(worktree);
  const root = await resolveWorktreeRoot(safeSlug, scopeWorktree);
  const realRoot = await fs.realpath(root);
  return {
    scope: { slug: safeSlug, worktree: scopeWorktree },
    root: realRoot,
  };
}

function registryKey(scope: FileTreeSyncScope, root: string): string {
  return JSON.stringify([scope.slug, scope.worktree, root]);
}

function toPosixRelative(root: string, candidatePath: string): string | null {
  const resolved = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(root, candidatePath);
  const relative = path.relative(root, resolved);
  if (!relative) return "";
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join(path.posix.sep).replace(/\\/g, "/");
}

function isGitPath(relativePath: string): boolean {
  return relativePath === ".git" || relativePath.startsWith(".git/");
}

function isSafeGitMetadataPath(relativePath: string): boolean {
  return (
    relativePath === ".git" ||
    relativePath === ".git/HEAD" ||
    relativePath === ".git/index" ||
    relativePath.startsWith(".git/refs/") ||
    relativePath.startsWith(".git/worktrees/")
  );
}

function shouldIgnoreWatchedPath(root: string, candidatePath: string): boolean {
  const relativePath = toPosixRelative(root, candidatePath);
  if (relativePath === null || !isGitPath(relativePath)) return false;
  return !isSafeGitMetadataPath(relativePath);
}

function parentDirectory(relativePath: string): string {
  const parent = path.posix.dirname(relativePath);
  return parent === "." ? "" : parent;
}

function emptyPendingBatch(): PendingBatch {
  return {
    paths: new Set(),
    directories: new Set(),
    totalPathCount: 0,
    rootChanged: false,
    gitStatusChanged: false,
    truncated: false,
    debounceTimer: null,
    forceTimer: null,
  };
}

function clearBatchTimers(batch: PendingBatch): void {
  if (batch.debounceTimer) {
    clearTimeout(batch.debounceTimer);
    batch.debounceTimer = null;
  }
  if (batch.forceTimer) {
    clearTimeout(batch.forceTimer);
    batch.forceTimer = null;
  }
}

function notifyDegraded(
  entry: WatcherRegistryEntry,
  code: string,
  message: string,
  options: { retryAfterMs?: number; fatal?: boolean } = {},
): void {
  const event: FileTreeDegradedEvent = {
    type: "file-tree:degraded",
    scope: entry.scope,
    code,
    message,
    pollIntervalMs: FILE_TREE_SYNC_FALLBACK_POLL_INTERVAL_MS,
    ...(options.retryAfterMs !== undefined ? { retryAfterMs: options.retryAfterMs } : {}),
    ...(options.fatal !== undefined ? { fatal: options.fatal } : {}),
  };

  for (const subscriber of entry.subscribers.values()) {
    try {
      subscriber.onDegraded?.(event);
    } catch (error) {
      console.error("File-tree sync degraded subscriber failed", {
        slug: entry.scope.slug,
        worktree: entry.scope.worktree,
        code,
        error,
      });
    }
  }
}

function flushEntry(entry: WatcherRegistryEntry): void {
  const batch = entry.pending;
  if (!batch) return;
  entry.pending = null;
  clearBatchTimers(batch);

  if (
    batch.paths.size === 0 &&
    batch.directories.size === 0 &&
    !batch.rootChanged &&
    !batch.gitStatusChanged &&
    !batch.truncated
  ) {
    return;
  }

  entry.version += 1;
  const event: FileTreeChangedEvent = {
    type: "file-tree:changed",
    scope: entry.scope,
    paths: Array.from(batch.paths).sort(),
    directories: Array.from(batch.directories).sort(),
    rootChanged: batch.rootChanged || batch.truncated,
    gitStatusChanged: batch.gitStatusChanged,
    truncated: batch.truncated,
    version: entry.version,
  };

  for (const subscriber of entry.subscribers.values()) {
    try {
      subscriber.onChange(event);
    } catch (error) {
      console.error("File-tree sync changed subscriber failed", {
        slug: entry.scope.slug,
        worktree: entry.scope.worktree,
        error,
      });
    }
  }
}

function scheduleFlush(entry: WatcherRegistryEntry): void {
  const batch = entry.pending;
  if (!batch) return;

  if (batch.debounceTimer) clearTimeout(batch.debounceTimer);
  batch.debounceTimer = setTimeout(() => flushEntry(entry), FILE_TREE_SYNC_DEBOUNCE_MS);

  if (!batch.forceTimer) {
    batch.forceTimer = setTimeout(() => flushEntry(entry), FILE_TREE_SYNC_FORCE_FLUSH_MS);
  }
}

function recordRelativePath(
  batch: PendingBatch,
  relativePath: string,
  eventName: FileTreeWatcherEventName,
): void {
  if (!relativePath) {
    batch.rootChanged = true;
    return;
  }

  const directory = parentDirectory(relativePath);
  if (!directory) {
    batch.rootChanged = true;
  } else {
    batch.directories.add(directory);
  }

  if (eventName === "addDir" || eventName === "unlinkDir") {
    batch.directories.add(relativePath);
  }

  batch.totalPathCount += 1;
  if (batch.totalPathCount > FILE_TREE_SYNC_MAX_PATH_HINTS) {
    batch.truncated = true;
    batch.rootChanged = true;
    return;
  }

  batch.paths.add(relativePath);
}

function handleRawWatcherEvent(
  entry: WatcherRegistryEntry,
  eventName: FileTreeWatcherEventName,
  eventPath: string | Buffer,
): void {
  if (entry.closing) return;
  const relativePath = toPosixRelative(entry.root, String(eventPath));
  if (relativePath === null) return;

  const batch = entry.pending ?? emptyPendingBatch();
  entry.pending = batch;

  if (isGitPath(relativePath)) {
    if (isSafeGitMetadataPath(relativePath)) {
      batch.gitStatusChanged = true;
      batch.rootChanged = true;
      scheduleFlush(entry);
    }
    return;
  }

  recordRelativePath(batch, relativePath, eventName);
  scheduleFlush(entry);
}

function closeEntry(entry: WatcherRegistryEntry): void {
  if (entry.closing) return;
  entry.closing = true;
  if (entry.pending) {
    clearBatchTimers(entry.pending);
    entry.pending = null;
  }
  registry.delete(entry.key);
  void entry.watcher.close();
}

function addSubscriber(
  entry: WatcherRegistryEntry,
  options: SubscribeFileTreeChangesOptions,
): FileTreeWatcherSubscription {
  const id = Symbol("file-tree-sync-subscriber");
  const subscriber: WatcherSubscriber = {
    id,
    onChange: options.onChange,
    onDegraded: options.onDegraded,
  };
  entry.subscribers.set(id, subscriber);

  let unsubscribed = false;
  const unsubscribe = () => {
    if (unsubscribed) return;
    unsubscribed = true;
    entry.subscribers.delete(id);
    if (entry.subscribers.size === 0) {
      closeEntry(entry);
    }
  };

  if (options.signal) {
    if (options.signal.aborted) {
      unsubscribe();
    } else {
      options.signal.addEventListener("abort", unsubscribe, { once: true });
    }
  }

  return {
    ok: true,
    scope: entry.scope,
    unsubscribe,
  };
}

function degradedResult(
  scope: FileTreeSyncScope,
  code: string,
  message: string,
  options: { retryAfterMs?: number; fatal?: boolean; status?: number } = {},
): FileTreeWatcherDegradedResult {
  return {
    ok: false,
    scope,
    code,
    message,
    pollIntervalMs: FILE_TREE_SYNC_FALLBACK_POLL_INTERVAL_MS,
    ...(options.retryAfterMs !== undefined ? { retryAfterMs: options.retryAfterMs } : {}),
    ...(options.fatal !== undefined ? { fatal: options.fatal } : {}),
    ...(options.status !== undefined ? { status: options.status } : {}),
  };
}

function createWatcherEntry(
  scope: FileTreeSyncScope,
  root: string,
  key: string,
): WatcherRegistryEntry {
  const watcher = watchFactory(root, {
    ignoreInitial: true,
    persistent: true,
    followSymlinks: false,
    ignored: (candidatePath) => shouldIgnoreWatchedPath(root, candidatePath),
  });
  const entry: WatcherRegistryEntry = {
    key,
    scope,
    root,
    watcher,
    subscribers: new Map(),
    pending: null,
    version: 0,
    closing: false,
  };

  for (const eventName of ["add", "addDir", "change", "unlink", "unlinkDir"] as const) {
    watcher.on(eventName, (eventPath) => handleRawWatcherEvent(entry, eventName, eventPath));
  }
  watcher.on("error", (error) => {
    notifyDegraded(entry, "WATCHER_ERROR", "File watcher reported an error", {
      retryAfterMs: DEFAULT_RETRY_AFTER_MS,
      fatal: false,
    });
    console.error("File-tree watcher error", {
      slug: scope.slug,
      worktree: scope.worktree,
      error,
    });
  });

  registry.set(key, entry);
  return entry;
}

export async function subscribeFileTreeChanges(
  options: SubscribeFileTreeChangesOptions,
): Promise<FileTreeWatcherSubscriptionResult> {
  let resolved: { scope: FileTreeSyncScope; root: string };
  try {
    resolved = await resolveFileTreeSyncScope(options.slug, options.worktree);
  } catch (error) {
    if (error instanceof WorktreeResolutionError) {
      return degradedResult(
        {
          slug: normalizedSlug(options.slug) ?? options.slug.trim(),
          worktree:
            options.worktree === null || options.worktree === undefined
              ? null
              : options.worktree.trim() || null,
        },
        error.code,
        error.message,
        { fatal: true, status: error.status },
      );
    }
    return degradedResult(
      {
        slug: normalizedSlug(options.slug) ?? options.slug.trim(),
        worktree: null,
      },
      "PROJECT_NOT_FOUND",
      "Project not found",
      { fatal: true, status: 404 },
    );
  }

  const { scope, root } = resolved;
  if (options.signal?.aborted) {
    return degradedResult(scope, "ABORTED", "File sync subscriber was aborted", {
      fatal: true,
      status: 499,
    });
  }

  const key = registryKey(scope, root);
  let entry = registry.get(key);

  if (!entry && registry.size >= limits.maxWatchedRoots) {
    return degradedResult(scope, "WATCHER_LIMIT_EXCEEDED", "Too many active watched roots", {
      retryAfterMs: DEFAULT_RETRY_AFTER_MS,
      fatal: false,
      status: 503,
    });
  }

  if (entry && entry.subscribers.size >= limits.maxSubscribersPerWatcher) {
    return degradedResult(scope, "SUBSCRIBER_LIMIT_EXCEEDED", "Too many file sync subscribers", {
      retryAfterMs: DEFAULT_RETRY_AFTER_MS,
      fatal: false,
      status: 503,
    });
  }

  if (totalSubscriberCount() >= limits.maxTotalSubscribers) {
    return degradedResult(scope, "SUBSCRIBER_LIMIT_EXCEEDED", "Too many file sync subscribers", {
      retryAfterMs: DEFAULT_RETRY_AFTER_MS,
      fatal: false,
      status: 503,
    });
  }

  if (!entry) {
    try {
      entry = createWatcherEntry(scope, root, key);
    } catch (error) {
      console.error("Failed to create file-tree watcher", {
        slug: scope.slug,
        worktree: scope.worktree,
        error,
      });
      return degradedResult(scope, "WATCHER_SETUP_FAILED", "File watcher could not start", {
        retryAfterMs: DEFAULT_RETRY_AFTER_MS,
        fatal: false,
        status: 503,
      });
    }
  }

  return addSubscriber(entry, options);
}

export function getFileTreeSyncRegistrySnapshotForTests() {
  return Array.from(registry.values()).map((entry) => ({
    key: entry.key,
    scope: entry.scope,
    subscriberCount: entry.subscribers.size,
    version: entry.version,
  }));
}

export function setFileTreeSyncLimitsForTests(nextLimits: Partial<FileTreeSyncLimits>): void {
  limits = {
    ...limits,
    ...nextLimits,
  };
}

export function setFileTreeSyncWatchFactoryForTests(nextFactory: WatchFactory): void {
  watchFactory = nextFactory;
}

export async function resetFileTreeSyncForTests(): Promise<void> {
  const entries = Array.from(registry.values());
  registry.clear();
  for (const entry of entries) {
    entry.closing = true;
    if (entry.pending) clearBatchTimers(entry.pending);
    await entry.watcher.close();
  }
  watchFactory = watch;
  limits = {
    maxWatchedRoots: DEFAULT_MAX_WATCHED_ROOTS,
    maxSubscribersPerWatcher: DEFAULT_MAX_SUBSCRIBERS_PER_WATCHER,
    maxTotalSubscribers: DEFAULT_MAX_TOTAL_SUBSCRIBERS,
  };
}
