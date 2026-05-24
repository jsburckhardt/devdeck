import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  resolveWorktreeRoot,
  WorktreeResolutionError,
  worktreeResolutionErrorResponse,
} from "@/lib/worktree-utils";

const execFileAsync = promisify(execFile);

async function getFileGitStatus(
  root: string,
  filePath: string,
): Promise<"untracked" | "staged" | "modified" | "none"> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain", "-u", "--", filePath], {
      cwd: root,
    });
    const line = stdout.trim();
    if (!line) return "none";
    const status = line.substring(0, 2);
    if (status === "??") return "untracked";
    if (status.startsWith("A")) return "staged";
    return "modified";
  } catch {
    return "none";
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const slug = searchParams.get("slug");
  const filePath = searchParams.get("path");
  const worktree = searchParams.get("worktree");

  if (!slug || !filePath) {
    return NextResponse.json({ error: "Missing 'slug' or 'path' parameter" }, { status: 400 });
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

  try {
    const status = await getFileGitStatus(root, relative);

    let gitArgs: string[];
    if (status === "untracked") {
      // Untracked files: diff against /dev/null to show all lines as added
      gitArgs = ["diff", "--no-index", "--", "/dev/null", relative];
    } else if (status === "staged") {
      // Staged additions: use --cached to diff against index
      gitArgs = ["diff", "--cached", "--", relative];
    } else {
      gitArgs = ["diff", "--", relative];
    }

    const { stdout } = await execFileAsync("git", gitArgs, {
      cwd: root,
      maxBuffer: 1024 * 1024,
    });
    return NextResponse.json({ diff: stdout });
  } catch (error) {
    const execError = error as { stdout?: string; code?: number };
    // git diff --no-index exits with 1 when files differ (normal behavior)
    if (execError.stdout !== undefined && execError.stdout.length > 0) {
      return NextResponse.json({ diff: execError.stdout });
    }
    return NextResponse.json(
      { error: "Failed to get diff", details: String(error) },
      { status: 500 },
    );
  }
}
