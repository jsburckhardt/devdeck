import { NextRequest, NextResponse } from "next/server";
import { listWorkspaceContexts, WorktreeResolutionError } from "@/lib/worktree-utils";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json(
      { error: "Missing 'slug' parameter", code: "MISSING_SLUG" },
      { status: 400 },
    );
  }

  try {
    const response = await listWorkspaceContexts(slug);
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" },
    });
  } catch (error) {
    if (error instanceof WorktreeResolutionError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          root: { id: "root", label: "Project root", kind: "root", status: "active" },
          choices: [],
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error: "Project not found",
        code: "PROJECT_NOT_FOUND",
        root: { id: "root", label: "Project root", kind: "root", status: "active" },
        choices: [],
      },
      { status: 404 },
    );
  }
}
