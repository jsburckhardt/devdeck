import { NextRequest, NextResponse } from "next/server";
import {
  buildWorktreeListResponse,
  readGitWorktreePorcelain,
  WorktreeResolutionError,
} from "@/lib/worktree-utils";
import { resolveProjectRecord } from "@/lib/registry";
import type { WorktreeListResponse, WorktreeListStatus } from "@/lib/types";

const CACHE_HEADERS = { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" };

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function emptyResponse(
  projectSlug: string,
  status: WorktreeListStatus,
  activeWorktreeId: string | null,
): WorktreeListResponse {
  return {
    projectSlug,
    status,
    root: {
      id: null,
      name: "Project root",
      active: activeWorktreeId === null,
    },
    worktrees: [],
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const slug = searchParams.get("slug")?.trim();
  const activeWorktreeId = searchParams.get("activeWorktree") || null;

  if (!slug) {
    return NextResponse.json(
      { error: "Missing 'slug' parameter", code: "MISSING_SLUG" },
      { status: 400 },
    );
  }

  const record = await resolveProjectRecord(slug);
  if (!record) {
    return NextResponse.json(
      { error: "Project not found", code: "PROJECT_NOT_FOUND" },
      { status: 404 },
    );
  }

  if (!record.exists) {
    return NextResponse.json(emptyResponse(record.slug, "project-unavailable", activeWorktreeId), {
      headers: CACHE_HEADERS,
    });
  }

  try {
    const porcelain = await readGitWorktreePorcelain(record.path);
    const response = await buildWorktreeListResponse({
      activeWorktreeId,
      porcelain,
      projectRoot: record.path,
      projectSlug: record.slug,
    });
    return NextResponse.json(response, { headers: CACHE_HEADERS });
  } catch (error) {
    if (error instanceof WorktreeResolutionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    const status: WorktreeListStatus =
      getErrorCode(error) === "ENOENT" ? "git-unavailable" : "not-git";
    return NextResponse.json(emptyResponse(record.slug, status, activeWorktreeId), {
      headers: CACHE_HEADERS,
    });
  }
}
