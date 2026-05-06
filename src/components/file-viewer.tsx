"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Spinner, FileX, WarningCircle } from "@phosphor-icons/react";
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
import { useWorkspace } from "@/lib/workspace-context";
import type { FileContent } from "@/lib/types";

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

marked.setOptions({
  gfm: true,
  breaks: false,
});

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
  const highlighted = highlightCode(content, language);
  const lineCount = content.split("\n").length;

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
  const rawHtml = marked.parse(content, { async: false }) as string;
  const html = DOMPurify.sanitize(rawHtml);

  return (
    <div className="overflow-auto p-6">
      <article
        className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-mono prose-headings:font-bold prose-code:rounded prose-code:bg-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-pre:bg-secondary prose-pre:p-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />
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

export function FileViewer() {
  const { project, selectedFile } = useWorkspace();
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project || !selectedFile) {
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
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load file: ${res.statusText}`);
        return res.json();
      })
      .then((data: FileContent) => {
        if (!cancelled) {
          setFileContent(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [project, selectedFile]);

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
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-destructive">
        <WarningCircle size={32} />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!fileContent) return null;

  const isMarkdown = fileContent.language === "markdown";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center border-b border-border bg-card/50 px-3">
        <span className="truncate font-mono text-xs text-muted-foreground">{fileContent.path}</span>
        <span className="ml-auto text-xs text-muted-foreground/50">
          {fileContent.language} · {(fileContent.size / 1024).toFixed(1)} KB
        </span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedFile}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="min-h-0 flex-1 overflow-auto"
        >
          {fileContent.isBinary ? (
            <BinaryFileView name={fileContent.name} size={fileContent.size} />
          ) : isMarkdown ? (
            <MarkdownView content={fileContent.content} />
          ) : (
            <CodeView content={fileContent.content} language={fileContent.language} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
