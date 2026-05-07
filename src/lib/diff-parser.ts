import type { DiffHunk } from "./types";

export function parseDiff(diffText: string): DiffHunk[] {
  if (!diffText.trim()) return [];

  const lines = diffText.trimEnd().split("\n");
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentHunk = {
        header: line,
        oldStart: parseInt(hunkMatch[1], 10),
        newStart: parseInt(hunkMatch[2], 10),
        lines: [],
      };
      oldLine = currentHunk.oldStart;
      newLine = currentHunk.newStart;
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    // Skip "\ No newline at end of file"
    if (line.startsWith("\\")) continue;

    if (line.startsWith("+")) {
      currentHunk.lines.push({
        type: "added",
        content: line.substring(1),
        newLineNumber: newLine,
      });
      newLine++;
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        type: "removed",
        content: line.substring(1),
        oldLineNumber: oldLine,
      });
      oldLine++;
    } else {
      const content = line.startsWith(" ") ? line.substring(1) : line;
      currentHunk.lines.push({
        type: "context",
        content,
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      });
      oldLine++;
      newLine++;
    }
  }

  return hunks;
}
