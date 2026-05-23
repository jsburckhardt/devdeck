"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Spinner,
  FileX,
  WarningCircle,
  PencilSimple,
  FloppyDisk,
  X,
  Eye,
  Code as CodeIcon,
} from "@phosphor-icons/react";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import markdown from "highlight.js/lib/languages/markdown";
import bash from "highlight.js/lib/languages/bash";
import yaml from "highlight.js/lib/languages/yaml";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace-context";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { DiffView } from "@/components/diff-view";
import { ExcalidrawView } from "@/components/excalidraw-view";
import type { FileContent, FileKind, FileNode } from "@/lib/types";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("css", css);
hljs.registerLanguage("json", json);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("python", python);
hljs.registerLanguage("sql", sql);

// Base64 encode/decode helpers using TextEncoder (avoids deprecated escape/unescape)
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (b) => String.fromCodePoint(b)).join("");
  return btoa(binString);
}

function fromBase64(base64: string): string {
  const binString = atob(base64);
  const bytes = Uint8Array.from(binString, (c) => c.codePointAt(0)!);
  return new TextDecoder().decode(bytes);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Configure marked renderer to use hljs for fenced code blocks
const renderer = new marked.Renderer();
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  if (lang === "mermaid") {
    const encoded = toBase64(text);
    const escaped = escapeHtml(text);
    return `<div class="mermaid-block" data-mermaid-source="${encoded}"><pre><code class="language-mermaid">${escaped}</code></pre></div>`;
  }
  const language = lang && hljs.getLanguage(lang) ? lang : undefined;
  const highlighted = language
    ? hljs.highlight(text, { language }).value
    : hljs.highlightAuto(text).value;
  return `<pre class="hljs"><code class="hljs language-${lang || "plaintext"}">${highlighted}</code></pre>`;
};
marked.use({ renderer });
marked.setOptions({ gfm: true, breaks: false });

function findFileStatus(
  tree: FileNode[],
  filePath: string,
): "added" | "modified" | "deleted" | undefined {
  for (const node of tree) {
    if (node.type === "file" && node.path === filePath) return node.status;
    if (node.type === "directory" && node.children) {
      const found = findFileStatus(node.children, filePath);
      if (found) return found;
    }
  }
  return undefined;
}

function highlightCode(code: string, language: string): string {
  try {
    if (hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }
    return hljs.highlightAuto(code).value;
  } catch {
    return code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

function CodeView({ content, language }: { content: string; language: string }) {
  const highlighted = useMemo(() => highlightCode(content, language), [content, language]);
  const lineCount = useMemo(() => content.split("\n").length, [content]);

  return (
    <div className="overflow-auto font-mono text-[13px] leading-relaxed">
      <div className="flex">
        <div
          className="select-none border-r border-border px-3 text-right text-xs text-muted-foreground/50"
          aria-hidden="true"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="flex-1 px-4">
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
      </div>
    </div>
  );
}

function MarkdownView({ content }: { content: string }) {
  const { theme } = useTheme();
  const articleRef = useRef<HTMLElement>(null);
  const rawHtml = useMemo(() => {
    const parsed = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(parsed);
  }, [content]);

  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;

    const mermaidBlocks = el.querySelectorAll<HTMLElement>("[data-mermaid-source]");
    if (mermaidBlocks.length === 0) return;

    let cancelled = false;

    import("mermaid")
      .then(async (mod) => {
        if (cancelled) return;
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: theme === "dark" ? "dark" : "default",
        });

        for (let i = 0; i < mermaidBlocks.length; i++) {
          if (cancelled) return;
          const block = mermaidBlocks[i];
          const encoded = block.getAttribute("data-mermaid-source") ?? "";
          let source: string;
          try {
            source = fromBase64(encoded);
          } catch {
            // Malformed base64 — leave placeholder as-is
            continue;
          }
          try {
            const { svg } = await mermaid.render(`mermaid-diagram-${Date.now()}-${i}`, source);
            if (!cancelled) {
              block.innerHTML = DOMPurify.sanitize(svg, {
                USE_PROFILES: { svg: true, svgFilters: true },
              });
            }
          } catch (err) {
            if (!cancelled) {
              const message = err instanceof Error ? err.message : "Diagram render failed";
              const escapedSource = escapeHtml(source);
              const escapedMessage = escapeHtml(message);
              block.innerHTML = `<div class="mermaid-error"><p>${escapedMessage}</p><pre><code>${escapedSource}</code></pre></div>`;
            }
          }
        }
      })
      .catch(() => {
        /* mermaid import failed — placeholders remain as fallback */
      });

    return () => {
      cancelled = true;
    };
  }, [rawHtml, theme]);

  return (
    <div className="overflow-auto p-6">
      <article
        ref={articleRef}
        className="markdown-preview max-w-4xl"
        dangerouslySetInnerHTML={{ __html: rawHtml }}
      />
    </div>
  );
}

interface PreviewErrorState {
  message: string;
  code?: string;
  kind?: FileKind;
}

interface PreviewErrorResponse {
  error?: string;
  code?: string;
  kind?: FileKind;
  details?: unknown;
}

function formatFileKind(kind?: FileKind): string {
  return kind ? kind.replace(/-/g, " ") : "this item";
}

function getPreviewErrorMessage(error: PreviewErrorResponse, status: number): string {
  if (error.code === "PERMISSION_DENIED") {
    return "DevDeck does not have permission to preview this file.";
  }
  if (error.code === "NOT_REGULAR_FILE") {
    return error.kind
      ? `DevDeck cannot preview ${formatFileKind(error.kind)} entries.`
      : "DevDeck cannot preview this item.";
  }
  if (error.code === "BROKEN_SYMLINK") {
    return "DevDeck cannot preview this broken symlink.";
  }
  if (error.code === "FILE_NOT_FOUND") {
    return "This file no longer exists.";
  }
  return error.error || `Cannot preview file (HTTP ${status}).`;
}

function CannotPreviewView({ error }: { error: PreviewErrorState }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <WarningCircle size={36} className="text-amber-500" />
      <p className="text-sm font-medium text-foreground">Cannot preview file</p>
      <p className="max-w-sm text-center text-sm">{error.message}</p>
      {error.kind && <p className="text-xs opacity-70">Kind: {formatFileKind(error.kind)}</p>}
    </div>
  );
}

function BinaryFileView({ name, size }: { name: string; size: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <FileX size={48} className="opacity-50" />
      <p className="text-sm font-medium">Binary file</p>
      <p className="text-xs">
        {name} ({(size / 1024).toFixed(1)} KB)
      </p>
      <p className="text-xs opacity-60">Binary files cannot be displayed</p>
    </div>
  );
}

function EditView({ content, onChange }: { content: string; onChange: (value: string) => void }) {
  return (
    <textarea
      className="h-full w-full resize-none bg-transparent p-4 font-mono text-[13px] leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      value={content}
      onChange={(e) => onChange(e.target.value)}
      aria-label="File editor"
      spellCheck={false}
    />
  );
}

export default function FileViewer() {
  const { project, selectedFile, fileTree, refreshFileTree, showFileViewer } = useWorkspace();
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PreviewErrorState | null>(null);

  // Markdown raw/preview toggle
  const [showRaw, setShowRaw] = useState(false);

  // Diff view
  const [viewMode, setViewMode] = useState<"file" | "changes">("file");
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [originalContent, setOriginalContent] = useState("");

  const isDirty = editMode && editContent !== originalContent;

  const fileStatus = useMemo(() => {
    if (!selectedFile || fileTree.length === 0) return undefined;
    return findFileStatus(fileTree, selectedFile);
  }, [selectedFile, fileTree]);

  // Reset state when file changes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- resetting derived state when selectedFile changes is the standard pattern */
    setShowRaw(false);
    setViewMode("file");
    setDiffContent(null);
    setEditMode(false);
    setEditContent("");
    setOriginalContent("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedFile]);

  // Fetch file content — skip when the panel is collapsed to avoid wasted
  // network/CPU while the preview is hidden.
  useEffect(() => {
    if (!project || !selectedFile || !showFileViewer) {
      if (!showFileViewer) return; // keep stale content so re-expand doesn't flash blank
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting state when deps clear is the standard pattern
      setFileContent(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(
      `/api/files/content?slug=${encodeURIComponent(project.slug)}&path=${encodeURIComponent(selectedFile)}`,
    )
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as PreviewErrorResponse;
          console.error("Failed to preview file", {
            path: selectedFile,
            status: res.status,
            code: data.code,
            kind: data.kind,
          });
          throw {
            message: getPreviewErrorMessage(data, res.status),
            code: data.code,
            kind: data.kind,
          } satisfies PreviewErrorState;
        }
        return res.json();
      })
      .then((data: FileContent) => {
        if (!cancelled) {
          setFileContent(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const previewError =
            typeof err === "object" && err !== null && "message" in err
              ? (err as PreviewErrorState)
              : { message: "Cannot preview file." };
          console.error("File preview failed", { path: selectedFile, error: err });
          setError(previewError);
          setFileContent(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [project, selectedFile, showFileViewer]);

  // Fetch diff when switching to changes tab
  useEffect(() => {
    if (viewMode !== "changes" || !project || !selectedFile) return;
    if (diffContent !== null) return; // Already fetched

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setting loading state before async fetch is the standard pattern
    setDiffLoading(true);

    fetch(
      `/api/files/diff?slug=${encodeURIComponent(project.slug)}&path=${encodeURIComponent(selectedFile)}`,
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load diff");
        return res.json();
      })
      .then((data: { diff: string }) => {
        if (!cancelled) {
          setDiffContent(data.diff);
          setDiffLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDiffContent("");
          setDiffLoading(false);
          toast.error("Failed to load diff");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode, project, selectedFile, diffContent]);

  const handleEdit = useCallback(() => {
    if (!fileContent) return;
    setEditMode(true);
    setEditContent(fileContent.content);
    setOriginalContent(fileContent.content);
  }, [fileContent]);

  const handleDiscard = useCallback(() => {
    if (isDirty && !window.confirm("Discard unsaved changes?")) return;
    setEditMode(false);
    setEditContent("");
    setOriginalContent("");
  }, [isDirty]);

  const handleSave = useCallback(async () => {
    if (!project || !selectedFile || !fileContent) return;
    setSaving(true);

    try {
      const res = await fetch("/api/files/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: project.slug,
          path: selectedFile,
          content: editContent,
          mtime: fileContent.mtime,
        }),
      });

      if (res.status === 409) {
        toast.error("File was modified externally. Reload and try again.");
        setSaving(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Save failed" }));
        toast.error(data.error || "Failed to save file");
        setSaving(false);
        return;
      }

      const updated: FileContent = await res.json();
      setFileContent(updated);
      setEditMode(false);
      setEditContent("");
      setOriginalContent("");
      // Reset diff cache so it re-fetches with new content
      setDiffContent(null);
      toast.success("File saved");
      // Silent refresh so the explorer reflects new git status (Decision #61).
      void refreshFileTree();
    } catch {
      toast.error("Network error — your changes are preserved");
    } finally {
      setSaving(false);
    }
  }, [project, selectedFile, fileContent, editContent, refreshFileTree]);

  if (!selectedFile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <span className="text-sm">Select a file to view its contents</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <CannotPreviewView error={error} />;
  }

  if (!fileContent) return null;

  const isMarkdown = fileContent.language === "markdown";
  const isExcalidraw = fileContent.language === "excalidraw";
  const showTabs = fileStatus === "modified" || fileStatus === "added";

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex h-9 shrink-0 items-center border-b border-border bg-card/50 px-3">
        <span className="truncate font-mono text-xs text-muted-foreground">{fileContent.path}</span>

        {/* Dirty indicator */}
        {isDirty && (
          <span
            className="ml-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
            title="Unsaved changes"
            data-testid="dirty-indicator"
          />
        )}

        {/* Changes/File tabs */}
        {showTabs && !editMode && (
          <div className="ml-3 flex gap-1">
            <button
              className={cn(
                "rounded px-2 py-0.5 text-xs transition-colors",
                viewMode === "file"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setViewMode("file")}
            >
              File
            </button>
            <button
              className={cn(
                "rounded px-2 py-0.5 text-xs transition-colors",
                viewMode === "changes"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setViewMode("changes")}
            >
              Changes
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {/* Markdown Raw/Preview toggle */}
          {(isMarkdown || isExcalidraw) && !editMode && viewMode === "file" && (
            <button
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setShowRaw((v) => !v)}
              aria-label={showRaw ? "Show preview" : "Show raw source"}
              aria-pressed={showRaw}
              title={showRaw ? "Show preview" : "Show raw source"}
            >
              {showRaw ? <Eye size={14} /> : <CodeIcon size={14} />}
            </button>
          )}

          {/* Edit / Save / Discard buttons */}
          {!fileContent.isBinary && !editMode && viewMode === "file" && (
            <button
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={handleEdit}
              aria-label="Edit file"
              title="Edit file"
            >
              <PencilSimple size={14} />
            </button>
          )}

          {editMode && (
            <>
              <button
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                onClick={handleSave}
                disabled={saving || !isDirty}
                aria-label="Save file"
              >
                <FloppyDisk size={14} />
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={handleDiscard}
                disabled={saving}
                aria-label="Discard changes"
              >
                <X size={14} />
                Discard
              </button>
            </>
          )}

          {/* File info */}
          <span className="text-xs text-muted-foreground/50">
            {fileContent.language} · {(fileContent.size / 1024).toFixed(1)} KB
          </span>
        </div>
      </div>

      {/* Content area */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${selectedFile}-${viewMode}-${editMode}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="min-h-0 flex-1 overflow-auto"
        >
          {editMode ? (
            <EditView content={editContent} onChange={setEditContent} />
          ) : viewMode === "changes" ? (
            diffLoading ? (
              <div className="flex h-full items-center justify-center">
                <Spinner size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <DiffView diff={diffContent ?? ""} />
            )
          ) : fileContent.isBinary ? (
            <BinaryFileView name={fileContent.name} size={fileContent.size} />
          ) : isExcalidraw && !showRaw ? (
            <ExcalidrawView content={fileContent.content} />
          ) : isMarkdown && !showRaw ? (
            <MarkdownView content={fileContent.content} />
          ) : (
            <CodeView content={fileContent.content} language={fileContent.language} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
