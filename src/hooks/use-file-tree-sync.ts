"use client";

import { useEffect } from "react";
import type {
  FileTreeChangedEvent,
  FileTreeDegradedEvent,
  FileTreeReadyEvent,
  FileTreeSyncError,
  FileTreeSyncScope,
  FileTreeSyncStatus,
} from "@/lib/types";

export const FILE_TREE_SYNC_FALLBACK_POLL_INTERVAL_MS = 5000;
export const FILE_TREE_SYNC_HEARTBEAT_TIMEOUT_MS = 45000;

const RETRY_BACKOFF_MS = [1000, 2000, 4000] as const;
const NON_RETRY_CODES = new Set([
  "AUTH_REQUIRED",
  "INVALID_ORIGIN",
  "INVALID_SLUG",
  "INVALID_WORKTREE",
  "WORKTREE_ESCAPE",
  "INVALID_PARAMETERS",
  "MISSING_PARAMETERS",
  "PROJECT_NOT_FOUND",
  "WORKTREE_NOT_FOUND",
]);

export interface UseFileTreeSyncOptions {
  slug?: string;
  worktree?: string | null;
  retryNonce?: number;
  onStatusChange: (status: FileTreeSyncStatus, error?: FileTreeSyncError | null) => void;
  onFallbackChange: (active: boolean) => void;
  onReady?: (scope: FileTreeSyncScope) => Promise<void> | void;
  onChanged: (event: FileTreeChangedEvent) => Promise<void> | void;
  heartbeatTimeoutMs?: number;
  eventSourceFactory?: (url: string) => EventSource;
}

function fileTreeEventsParams(slug: string, worktree?: string | null): URLSearchParams {
  const params = new URLSearchParams({ slug });
  if (worktree) params.set("worktree", worktree);
  return params;
}

export function buildFileTreeEventsUrl(slug: string, worktree?: string | null): string {
  const params = fileTreeEventsParams(slug, worktree);
  return `/api/files/events?${params.toString()}`;
}

export function buildFileTreeEventsPreflightUrl(slug: string, worktree?: string | null): string {
  const params = fileTreeEventsParams(slug, worktree);
  params.set("preflight", "1");
  return `/api/files/events?${params.toString()}`;
}

function scopeMatches(scope: FileTreeSyncScope | undefined, slug: string, worktree: string | null) {
  return Boolean(scope && scope.slug === slug && scope.worktree === worktree);
}

function parseEventData<T>(event: MessageEvent): T | null {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return null;
  }
}

function isNonRetryableCode(code: string | undefined): boolean {
  return Boolean(code && NON_RETRY_CODES.has(code));
}

function statusForNonRetryable(code: string): FileTreeSyncStatus {
  return code === "AUTH_REQUIRED" ? "unauthorized" : "error";
}

function retryableError(
  code: string,
  message: string,
  options: { retryAfterMs?: number; pollIntervalMs?: number } = {},
): FileTreeSyncError {
  return {
    code,
    message,
    retryable: true,
    ...(options.retryAfterMs !== undefined ? { retryAfterMs: options.retryAfterMs } : {}),
    ...(options.pollIntervalMs !== undefined ? { pollIntervalMs: options.pollIntervalMs } : {}),
  };
}

function nonRetryableError(code: string, message: string): FileTreeSyncError {
  return {
    code,
    message,
    retryable: false,
    fatal: true,
  };
}

function classifyEventSourceError(event: Event): FileTreeSyncError {
  const details = event as Event & {
    status?: number;
    code?: string;
    message?: string;
  };
  const code =
    details.code ??
    (details.status === 401
      ? "AUTH_REQUIRED"
      : details.status === 403
        ? "INVALID_ORIGIN"
        : details.status === 400
          ? "INVALID_PARAMETERS"
          : "STREAM_ERROR");
  const message = details.message ?? "File sync stream disconnected";
  return isNonRetryableCode(code)
    ? nonRetryableError(code, message)
    : retryableError(code, message);
}

function codeForPreflightStatus(status: number): string {
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "INVALID_ORIGIN";
  if (status === 404) return "PROJECT_NOT_FOUND";
  if (status >= 400 && status < 500) return "INVALID_PARAMETERS";
  return "PREFLIGHT_FAILED";
}

async function parsePreflightJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const payload = (await response.json()) as unknown;
    return typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function classifyPreflightResponse(response: Response): Promise<FileTreeSyncError | null> {
  if (response.ok) return null;

  const payload = await parsePreflightJson(response);
  const code =
    typeof payload?.code === "string" ? payload.code : codeForPreflightStatus(response.status);
  const message =
    typeof payload?.error === "string"
      ? payload.error
      : typeof payload?.message === "string"
        ? payload.message
        : `File sync preflight failed with HTTP ${response.status}`;

  return isNonRetryableCode(code)
    ? nonRetryableError(code, message)
    : retryableError(code, message);
}

function classifyPreflightNetworkError(error: unknown): FileTreeSyncError {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "File sync preflight failed before the stream could connect";
  return retryableError("PREFLIGHT_NETWORK_ERROR", message);
}

export function useFileTreeSync({
  slug,
  worktree = null,
  retryNonce = 0,
  onStatusChange,
  onFallbackChange,
  onReady,
  onChanged,
  heartbeatTimeoutMs = FILE_TREE_SYNC_HEARTBEAT_TIMEOUT_MS,
  eventSourceFactory,
}: UseFileTreeSyncOptions): void {
  useEffect(() => {
    const normalizedSlug = slug?.trim();
    const normalizedWorktree = worktree ?? null;
    if (!normalizedSlug) return;
    const activeSlug = normalizedSlug;

    if (typeof window === "undefined" || typeof document === "undefined") return;

    const configuredEventSource =
      eventSourceFactory ??
      (typeof window.EventSource !== "undefined"
        ? (url: string) => new window.EventSource(url)
        : null);
    const createEventSource = configuredEventSource;
    const fetchPreflight =
      typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;

    let closed = false;
    let retryAttempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    let preflightController: AbortController | null = null;
    let source: EventSource | null = null;
    const url = buildFileTreeEventsUrl(activeSlug, normalizedWorktree);
    const preflightUrl = buildFileTreeEventsPreflightUrl(activeSlug, normalizedWorktree);

    const clearRetryTimer = () => {
      if (!retryTimer) return;
      clearTimeout(retryTimer);
      retryTimer = null;
    };

    const clearHeartbeatTimer = () => {
      if (!heartbeatTimer) return;
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    };

    const closeSource = () => {
      if (!source) return;
      source.close();
      source = null;
    };

    const abortPreflight = () => {
      if (!preflightController) return;
      preflightController.abort();
      preflightController = null;
    };

    const cleanup = () => {
      closed = true;
      clearRetryTimer();
      clearHeartbeatTimer();
      abortPreflight();
      closeSource();
    };

    const resetHeartbeatTimer = (onTimeout: () => void) => {
      clearHeartbeatTimer();
      heartbeatTimer = setTimeout(onTimeout, heartbeatTimeoutMs);
    };

    const enterNonRetryable = (error: FileTreeSyncError) => {
      clearRetryTimer();
      clearHeartbeatTimer();
      abortPreflight();
      closeSource();
      onFallbackChange(false);
      onStatusChange(statusForNonRetryable(error.code), error);
    };

    const enterDegradedFallback = (error: FileTreeSyncError) => {
      clearRetryTimer();
      clearHeartbeatTimer();
      abortPreflight();
      closeSource();
      onStatusChange("degraded", {
        ...error,
        retryable: true,
        pollIntervalMs: error.pollIntervalMs ?? FILE_TREE_SYNC_FALLBACK_POLL_INTERVAL_MS,
      });
      onFallbackChange(true);
    };

    const handleRecoverableFailure = (error: FileTreeSyncError) => {
      if (closed) return;
      clearHeartbeatTimer();
      abortPreflight();
      closeSource();

      if (retryAttempt < RETRY_BACKOFF_MS.length) {
        const retryAfterMs = RETRY_BACKOFF_MS[retryAttempt];
        retryAttempt += 1;
        onStatusChange("connecting", {
          ...error,
          retryable: true,
          retryAfterMs,
        });
        retryTimer = setTimeout(() => {
          void connect();
        }, retryAfterMs);
        return;
      }

      enterDegradedFallback(
        retryableError(
          "STREAM_RETRY_EXHAUSTED",
          "File sync stream unavailable; polling every 5 seconds.",
          { pollIntervalMs: FILE_TREE_SYNC_FALLBACK_POLL_INTERVAL_MS },
        ),
      );
    };

    const handleInvalidEvent = () => {
      handleRecoverableFailure(
        retryableError("INVALID_EVENT", "File sync stream sent invalid data"),
      );
    };

    async function preflight(signal: AbortSignal): Promise<FileTreeSyncError | null> {
      if (!fetchPreflight) {
        return retryableError(
          "PREFLIGHT_UNSUPPORTED",
          "File sync validation is unsupported; polling every 5 seconds.",
          { pollIntervalMs: FILE_TREE_SYNC_FALLBACK_POLL_INTERVAL_MS },
        );
      }

      try {
        const response = await fetchPreflight(preflightUrl, {
          cache: "no-store",
          credentials: "same-origin",
          signal,
        });
        return await classifyPreflightResponse(response);
      } catch (error) {
        if (signal.aborted) return null;
        return classifyPreflightNetworkError(error);
      }
    }

    function openEventSource() {
      if (closed) return;
      if (!createEventSource) {
        enterDegradedFallback(
          retryableError(
            "EVENTSOURCE_UNSUPPORTED",
            "File sync stream is unsupported; polling every 5 seconds.",
            { pollIntervalMs: FILE_TREE_SYNC_FALLBACK_POLL_INTERVAL_MS },
          ),
        );
        return;
      }
      const nextSource = createEventSource(url);
      source = nextSource;

      const heartbeatTimeout = () => {
        handleRecoverableFailure(
          retryableError("HEARTBEAT_TIMEOUT", "File sync heartbeat timed out"),
        );
      };

      nextSource.onopen = () => {
        if (closed || source !== nextSource) return;
        resetHeartbeatTimer(heartbeatTimeout);
      };

      nextSource.addEventListener("file-tree:ready", (event) => {
        if (closed || source !== nextSource) return;
        const payload = parseEventData<FileTreeReadyEvent>(event as MessageEvent);
        if (!payload) {
          handleInvalidEvent();
          return;
        }
        if (!scopeMatches(payload.scope, activeSlug, normalizedWorktree)) return;
        retryAttempt = 0;
        resetHeartbeatTimer(heartbeatTimeout);
        onFallbackChange(false);
        onStatusChange("ready", null);
        if (onReady) {
          void Promise.resolve()
            .then(() => onReady(payload.scope))
            .catch(() => {
              if (!closed && source === nextSource) {
                console.error("Failed to refresh file tree after ready event", {
                  slug: activeSlug,
                  worktree: normalizedWorktree,
                });
              }
            });
        }
      });

      nextSource.addEventListener("file-tree:changed", (event) => {
        if (closed || source !== nextSource) return;
        const payload = parseEventData<FileTreeChangedEvent>(event as MessageEvent);
        if (!payload) {
          handleInvalidEvent();
          return;
        }
        if (!scopeMatches(payload.scope, activeSlug, normalizedWorktree)) return;
        resetHeartbeatTimer(heartbeatTimeout);
        onStatusChange("syncing", null);
        Promise.resolve(onChanged(payload))
          .then(() => {
            if (!closed && source === nextSource) {
              onStatusChange("ready", null);
            }
          })
          .catch(() => {
            if (!closed && source === nextSource) {
              handleRecoverableFailure(
                retryableError("INVALIDATION_FAILED", "File tree refresh failed after sync event"),
              );
            }
          });
      });

      nextSource.addEventListener("file-tree:degraded", (event) => {
        if (closed || source !== nextSource) return;
        const payload = parseEventData<FileTreeDegradedEvent>(event as MessageEvent);
        if (!payload) {
          handleInvalidEvent();
          return;
        }
        if (!scopeMatches(payload.scope, activeSlug, normalizedWorktree)) return;
        const error =
          payload.fatal || isNonRetryableCode(payload.code)
            ? nonRetryableError(payload.code, payload.message)
            : retryableError(payload.code, payload.message, {
                retryAfterMs: payload.retryAfterMs,
                pollIntervalMs: payload.pollIntervalMs,
              });
        if (error.retryable) {
          enterDegradedFallback(error);
        } else {
          enterNonRetryable(error);
        }
      });

      nextSource.onerror = (event) => {
        if (closed || source !== nextSource) return;
        const error = classifyEventSourceError(event);
        if (error.retryable) {
          handleRecoverableFailure(error);
        } else {
          enterNonRetryable(error);
        }
      };
    }

    async function connect() {
      if (closed) return;
      clearRetryTimer();
      clearHeartbeatTimer();
      closeSource();
      abortPreflight();
      onStatusChange("connecting", null);

      const controller = new AbortController();
      preflightController = controller;
      const preflightError = await preflight(controller.signal);
      if (closed || controller.signal.aborted || preflightController !== controller) return;
      preflightController = null;

      if (preflightError) {
        if (preflightError.retryable) {
          handleRecoverableFailure(preflightError);
        } else {
          enterNonRetryable(preflightError);
        }
        return;
      }

      openEventSource();
    }

    void connect();

    return cleanup;
  }, [
    eventSourceFactory,
    heartbeatTimeoutMs,
    onChanged,
    onFallbackChange,
    onReady,
    onStatusChange,
    retryNonce,
    slug,
    worktree,
  ]);
}
