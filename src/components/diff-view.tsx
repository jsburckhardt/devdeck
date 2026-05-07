"use client";

import { useMemo } from "react";
import type { DiffHunk } from "@/lib/types";
import { parseDiff } from "@/lib/diff-parser";

function HunkHeader({ header }: { header: string }) {
  return (
    <div className="border-y border-border bg-muted/30 px-4 py-1 font-mono text-xs text-muted-foreground">
      {header}
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffHunk["lines"][number] }) {
  const bgClass =
    line.type === "added" ? "bg-green-500/10" : line.type === "removed" ? "bg-red-500/10" : "";

  const textClass =
    line.type === "added" ? "text-green-400" : line.type === "removed" ? "text-red-400" : "";

  const Tag = line.type === "added" ? "ins" : line.type === "removed" ? "del" : "span";

  return (
    <div className={`flex ${bgClass}`}>
      <span
        className="w-12 shrink-0 select-none border-r border-border px-2 text-right text-xs text-muted-foreground/50"
        aria-hidden="true"
      >
        {line.oldLineNumber ?? ""}
      </span>
      <span
        className="w-12 shrink-0 select-none border-r border-border px-2 text-right text-xs text-muted-foreground/50"
        aria-hidden="true"
      >
        {line.newLineNumber ?? ""}
      </span>
      <span className="w-6 shrink-0 select-none text-center text-xs text-muted-foreground/50">
        {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
      </span>
      <Tag
        className={`flex-1 whitespace-pre-wrap break-all ${textClass}`}
        style={{ textDecoration: "none" }}
      >
        {line.content}
      </Tag>
    </div>
  );
}

export function DiffView({ diff }: { diff: string }) {
  const hunks = useMemo(() => parseDiff(diff), [diff]);

  if (hunks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <span className="text-sm">No changes</span>
      </div>
    );
  }

  return (
    <div className="overflow-auto font-mono text-[13px] leading-relaxed">
      {hunks.map((hunk, i) => (
        <div key={i}>
          <HunkHeader header={hunk.header} />
          {hunk.lines.map((line, j) => (
            <DiffLineRow key={j} line={line} />
          ))}
        </div>
      ))}
    </div>
  );
}
