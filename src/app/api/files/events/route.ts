import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getToken, parseCookieToken, validateToken } from "@/lib/auth";
import { WorktreeResolutionError } from "@/lib/worktree-utils";
import type {
  FileTreeChangedEvent,
  FileTreeDegradedEvent,
  FileTreeReadyEvent,
  FileTreeSyncScope,
} from "@/lib/types";
import {
  FILE_TREE_SYNC_FALLBACK_POLL_INTERVAL_MS,
  resolveFileTreeSyncScope,
  subscribeFileTreeChanges,
} from "@/server/file-tree-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 15000;
const SAFE_SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function structuredError(error: string, code: string, status: number) {
  return jsonResponse({ error, code }, status);
}

function requestToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  const cookieToken = parseCookieToken(request.headers.get("cookie"));
  if (cookieToken) return cookieToken;

  return request.nextUrl.searchParams.get("token");
}

function validateRequestAuth(request: NextRequest): NextResponse | null {
  const expectedToken = getToken();
  if (!expectedToken) return null;
  if (validateToken(requestToken(request), expectedToken)) return null;
  return structuredError("Unauthorized", "AUTH_REQUIRED", 401);
}

function validateOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (origin === request.nextUrl.origin) return null;
  return structuredError("Invalid request origin", "INVALID_ORIGIN", 403);
}

function resolutionErrorResponse(error: unknown): NextResponse {
  if (error instanceof WorktreeResolutionError) {
    return structuredError(error.message, error.code, error.status);
  }

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  if (code === "ENOENT" || code === "ENOTDIR") {
    return structuredError("Project not found", "PROJECT_NOT_FOUND", 404);
  }

  return structuredError("Project not found", "PROJECT_NOT_FOUND", 404);
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseComment(comment: string): string {
  return `: ${comment}\n\n`;
}

function isSafeRelativeHint(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  if (path.posix.isAbsolute(value) || /^[a-zA-Z]:/.test(value)) return false;
  const normalized = value.replace(/\\/g, "/");
  if (normalized === ".git" || normalized.startsWith(".git/")) return false;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "..")) return false;
  return true;
}

function sanitizeChangedEvent(event: FileTreeChangedEvent): FileTreeChangedEvent {
  const paths = event.paths.filter(isSafeRelativeHint);
  const directories = event.directories.filter((directory) => {
    if (directory === "") return true;
    return isSafeRelativeHint(directory);
  });
  const truncated =
    event.truncated ||
    paths.length !== event.paths.length ||
    directories.length !== event.directories.length;

  return {
    ...event,
    paths,
    directories,
    truncated,
    rootChanged: event.rootChanged || truncated,
  };
}

function degradedPayload(
  scope: FileTreeSyncScope,
  code: string,
  message: string,
  options: { retryAfterMs?: number; fatal?: boolean } = {},
): FileTreeDegradedEvent {
  return {
    type: "file-tree:degraded",
    scope,
    code,
    message,
    pollIntervalMs: FILE_TREE_SYNC_FALLBACK_POLL_INTERVAL_MS,
    ...(options.retryAfterMs !== undefined ? { retryAfterMs: options.retryAfterMs } : {}),
    ...(options.fatal !== undefined ? { fatal: options.fatal } : {}),
  };
}

export async function GET(request: NextRequest) {
  const authError = validateRequestAuth(request);
  if (authError) return authError;

  const originError = validateOrigin(request);
  if (originError) return originError;

  const slug = request.nextUrl.searchParams.get("slug")?.trim();
  const worktree = request.nextUrl.searchParams.get("worktree");
  const workspaceContext = request.nextUrl.searchParams.get("workspaceContext");
  if (!slug) {
    return structuredError("Missing 'slug' parameter", "MISSING_PARAMETERS", 400);
  }
  if (!SAFE_SLUG_PATTERN.test(slug)) {
    return structuredError("Invalid 'slug' parameter", "INVALID_SLUG", 400);
  }

  let resolvedScope: FileTreeSyncScope;
  try {
    const resolved =
      workspaceContext !== null
        ? await resolveFileTreeSyncScope(slug, worktree, workspaceContext)
        : await resolveFileTreeSyncScope(slug, worktree);
    resolvedScope = resolved.scope;
  } catch (error) {
    return resolutionErrorResponse(error);
  }

  if (request.nextUrl.searchParams.get("preflight") === "1") {
    return jsonResponse({
      ok: true,
      scope: resolvedScope,
      pollIntervalMs: FILE_TREE_SYNC_FALLBACK_POLL_INTERVAL_MS,
    });
  }

  const encoder = new TextEncoder();
  let subscription: { unsubscribe: () => void } | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const readyPayload: FileTreeReadyEvent = {
    type: "file-tree:ready",
    scope: resolvedScope,
    pollIntervalMs: FILE_TREE_SYNC_FALLBACK_POLL_INTERVAL_MS,
  };

  function closeStream() {
    if (closed) return;
    closed = true;
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    subscription?.unsubscribe();
    subscription = null;
    request.signal.removeEventListener("abort", closeStream);
    try {
      controllerRef?.close();
    } catch {
      // The stream may already be closed by the client.
    }
  }

  function write(chunk: string) {
    if (closed || !controllerRef) return;
    try {
      controllerRef.enqueue(encoder.encode(chunk));
    } catch {
      closeStream();
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;
      request.signal.addEventListener("abort", closeStream, { once: true });

      const result = await subscribeFileTreeChanges({
        slug,
        ...(worktree !== null ? { worktree } : {}),
        ...(workspaceContext !== null ? { workspaceContext } : {}),
        signal: request.signal,
        onChange: (event) => write(sseEvent("file-tree:changed", sanitizeChangedEvent(event))),
        onDegraded: (event) => write(sseEvent("file-tree:degraded", event)),
      });

      if (closed) {
        if (result.ok) result.unsubscribe();
        return;
      }

      if (!result.ok) {
        write(
          sseEvent(
            "file-tree:degraded",
            degradedPayload(result.scope, result.code, result.message, {
              retryAfterMs: result.retryAfterMs,
              fatal: result.fatal,
            }),
          ),
        );
        closeStream();
        return;
      }

      subscription = result;
      write(sseEvent("file-tree:ready", readyPayload));
      heartbeat = setInterval(() => {
        write(sseComment("heartbeat"));
        write(sseEvent("file-tree:ready", readyPayload));
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      closeStream();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
