import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolveProjectPath } from "@/lib/registry";

const execFileAsync = promisify(execFile);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const slug = searchParams.get("slug");
  const filePath = searchParams.get("path");

  if (!slug || !filePath) {
    return NextResponse.json({ error: "Missing 'slug' or 'path' parameter" }, { status: 400 });
  }

  const root = await resolveProjectPath(slug);
  const fullPath = path.resolve(root, filePath);

  const relative = path.relative(root, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  try {
    const { stdout } = await execFileAsync("git", ["diff", "--", relative], {
      cwd: root,
      maxBuffer: 1024 * 1024,
    });
    return NextResponse.json({ diff: stdout });
  } catch (error) {
    const execError = error as { stdout?: string; code?: number };
    // git diff exits with 0 for no changes and 1 for changes in some configs
    if (execError.stdout !== undefined) {
      return NextResponse.json({ diff: execError.stdout });
    }
    return NextResponse.json(
      { error: "Failed to get diff", details: String(error) },
      { status: 500 },
    );
  }
}
