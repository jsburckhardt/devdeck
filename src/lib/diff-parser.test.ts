import { describe, it, expect } from "vitest";
import { parseDiff } from "./diff-parser";

describe("parseDiff", () => {
  it("1.1 — parses a single-hunk diff with context, added, and removed lines", () => {
    const diff = `@@ -1,4 +1,4 @@
 line1
-old line
+new line
 line3`;

    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines).toHaveLength(4);
    expect(hunks[0].lines[0]).toEqual({
      type: "context",
      content: "line1",
      oldLineNumber: 1,
      newLineNumber: 1,
    });
    expect(hunks[0].lines[1]).toEqual({
      type: "removed",
      content: "old line",
      oldLineNumber: 2,
    });
    expect(hunks[0].lines[2]).toEqual({
      type: "added",
      content: "new line",
      newLineNumber: 2,
    });
    expect(hunks[0].lines[3]).toEqual({
      type: "context",
      content: "line3",
      oldLineNumber: 3,
      newLineNumber: 3,
    });
  });

  it("1.2 — parses multi-hunk diff", () => {
    const diff = `@@ -1,3 +1,3 @@
 context
-old1
+new1
@@ -10,3 +10,3 @@
 context2
-old2
+new2`;

    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].oldStart).toBe(1);
    expect(hunks[0].newStart).toBe(1);
    expect(hunks[1].oldStart).toBe(10);
    expect(hunks[1].newStart).toBe(10);
  });

  it("1.3 — returns empty array for empty diff", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("  \n  ")).toEqual([]);
  });

  it("1.4 — all-added file (new file)", () => {
    const diff = `@@ -0,0 +1,3 @@
+line1
+line2
+line3`;

    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines).toHaveLength(3);
    hunks[0].lines.forEach((line) => {
      expect(line.type).toBe("added");
    });
    expect(hunks[0].lines[0].newLineNumber).toBe(1);
    expect(hunks[0].lines[2].newLineNumber).toBe(3);
  });

  it("1.5 — all-removed file", () => {
    const diff = `@@ -1,3 +0,0 @@
-line1
-line2
-line3`;

    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(1);
    hunks[0].lines.forEach((line) => {
      expect(line.type).toBe("removed");
    });
    expect(hunks[0].lines[0].oldLineNumber).toBe(1);
    expect(hunks[0].lines[2].oldLineNumber).toBe(3);
  });

  it("1.6 — context-only lines", () => {
    const diff = `@@ -5,3 +5,3 @@
 line5
 line6
 line7`;

    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(1);
    hunks[0].lines.forEach((line) => {
      expect(line.type).toBe("context");
    });
  });

  it("1.7 — line number accuracy", () => {
    const diff = `@@ -5,5 +5,6 @@
 context
-removed
+added1
+added2
 context2
 context3`;

    const hunks = parseDiff(diff);
    const lines = hunks[0].lines;
    // context at old=5, new=5
    expect(lines[0]).toMatchObject({ oldLineNumber: 5, newLineNumber: 5 });
    // removed at old=6
    expect(lines[1]).toMatchObject({ type: "removed", oldLineNumber: 6 });
    // added1 at new=6
    expect(lines[2]).toMatchObject({ type: "added", newLineNumber: 6 });
    // added2 at new=7
    expect(lines[3]).toMatchObject({ type: "added", newLineNumber: 7 });
    // context2 at old=7, new=8
    expect(lines[4]).toMatchObject({ oldLineNumber: 7, newLineNumber: 8 });
  });

  it("1.8 — hunk header parsing", () => {
    const diff = `@@ -10,5 +12,7 @@ function foo()
 context`;

    const hunks = parseDiff(diff);
    expect(hunks[0].oldStart).toBe(10);
    expect(hunks[0].newStart).toBe(12);
    expect(hunks[0].header).toBe("@@ -10,5 +12,7 @@ function foo()");
  });

  it("5.2 — handles 'no newline at end of file' marker", () => {
    const diff = `@@ -1,2 +1,2 @@
-old
+new
\\ No newline at end of file`;

    const hunks = parseDiff(diff);
    expect(hunks[0].lines).toHaveLength(2);
    expect(hunks[0].lines.every((l) => l.type !== "context" || !l.content.startsWith("\\"))).toBe(
      true,
    );
  });
});
