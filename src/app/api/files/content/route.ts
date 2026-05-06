import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { resolveProjectPath } from "@/app/api/projects/route";
import { getLanguageFromFilename, isBinaryFile } from "@/lib/file-utils";
import type { FileContent } from "@/lib/types";

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

const CACHE_HEADERS = { "Cache-Control": "private, max-age=5, stale-while-revalidate=15" };

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const slug = searchParams.get("slug");
  const filePath = searchParams.get("path");

  if (!slug || !filePath) {
    return NextResponse.json({ error: "Missing 'slug' or 'path' parameter" }, { status: 400 });
  }

  const root = resolveProjectPath(slug);
  const fullPath = path.resolve(root, filePath);

  // Prevent path traversal — resolved path must remain under root
  const relative = path.relative(root, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 403 });
  }

  try {
    const stat = await fs.stat(fullPath);
    const filename = path.basename(fullPath);

    if (isBinaryFile(filename)) {
      const result: FileContent = {
        content: "",
        language: "binary",
        size: stat.size,
        isBinary: true,
        path: filePath,
        name: filename,
      };
      return NextResponse.json(result, { headers: CACHE_HEADERS });
    }

    if (stat.size > MAX_FILE_SIZE) {
      const result: FileContent = {
        content: `File is too large to display (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 1MB.`,
        language: getLanguageFromFilename(filename),
        size: stat.size,
        isBinary: false,
        path: filePath,
        name: filename,
      };
      return NextResponse.json(result, { headers: CACHE_HEADERS });
    }

    const content = await fs.readFile(fullPath, "utf-8");
    const result: FileContent = {
      content,
      language: getLanguageFromFilename(filename),
      size: stat.size,
      isBinary: false,
      path: filePath,
      name: filename,
    };
    return NextResponse.json(result, { headers: CACHE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read file", details: String(error) },
      { status: 500 },
    );
  }
}
