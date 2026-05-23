import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolveProjectPath } from "@/lib/registry";
import type { Worktree } from "@/lib/types";

const execFileAsync = promisify(execFile);

function parseWorktreePorcelain(output: string): Worktree[] {
  const treesMarker = "/.trees/";
  const blocks = output.split("\n\n").filter((b) => b.trim());
  const worktrees: Worktree[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    let worktreePath = "";
    let branch = "";

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        worktreePath = line.slice("worktree ".length);
      } else if (line.startsWith("branch ")) {
        branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
      } else if (line.trim() === "detached") {
        branch = "(detached)";
      }
    }

    // Only include entries whose path contains /.trees/
    if (!worktreePath || !worktreePath.includes(treesMarker)) continue;

    // Derive name as the basename after .trees/
    const treesIdx = worktreePath.lastIndexOf(treesMarker);
    const name = worktreePath.slice(treesIdx + treesMarker.length);
    if (!name) continue;

    worktrees.push({
      name,
      branch: branch || name,
    });
  }

  return worktrees;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json(
      { error: "Missing 'slug' parameter", code: "MISSING_SLUG" },
      { status: 400 },
    );
  }

  let root: string;
  try {
    root = await resolveProjectPath(slug);
  } catch {
    return NextResponse.json(
      { error: "Project not found", code: "PROJECT_NOT_FOUND" },
      { status: 404 },
    );
  }

  try {
    const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
      cwd: root,
    });
    const worktrees = parseWorktreePorcelain(stdout);
    return NextResponse.json(worktrees, {
      headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" },
    });
  } catch {
    // Git not available, not a git repo, or .trees/ absent — return empty array
    return NextResponse.json([], {
      headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" },
    });
  }
}
