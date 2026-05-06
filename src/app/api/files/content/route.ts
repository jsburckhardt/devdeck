import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getLanguageFromFilename, isBinaryFile } from "@/lib/file-utils";
import type { FileContent } from "@/lib/types";

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const root = searchParams.get("root");
  const filePath = searchParams.get("path");

  if (!root || !filePath) {
    return NextResponse.json({ error: "Missing 'root' or 'path' parameter" }, { status: 400 });
  }

  const fullPath = path.join(root, filePath);

  // Prevent path traversal
  if (!fullPath.startsWith(root)) {
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
      return NextResponse.json(result);
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
      return NextResponse.json(result);
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
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read file", details: String(error) },
      { status: 500 },
    );
  }
}
