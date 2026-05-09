# Research Brief — Issue #18

## Mermaid Diagram Rendering in Markdown Preview

**Scope Type:** issue
**Issue:** #18
**Date:** 2025-07-17

---

## 1. Problem Analysis

The markdown preview in `FileViewer` renders all fenced code blocks — including those with language
`mermaid` — as syntax-highlighted source text via highlight.js. Mermaid is widely used in README
files and documentation for flowcharts, sequence diagrams, class diagrams, etc. Users who open
such files in DevDeck see raw mermaid DSL text instead of rendered diagrams.

**Root cause (`src/components/file-viewer.tsx:46-53`):**
The custom `marked.Renderer.code` intercepts all code blocks. For `lang === "mermaid"`,
`hljs.getLanguage("mermaid")` returns `undefined`, so `hljs.highlightAuto(text)` runs instead —
mermaid source is rendered as a highlighted code block, not a diagram.

---

## 2. Current Codebase Findings

### 2.1 MarkdownView Component

**File:** `src/components/file-viewer.tsx:105-114`

```typescript
function MarkdownView({ content }: { content: string }) {
  const rawHtml = marked.parse(content, { async: false }) as string;
  const html = DOMPurify.sanitize(rawHtml);
  return (
    <div className="overflow-auto p-6">
      <article className="markdown-preview max-w-4xl" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
```

- **Synchronous** — must be refactored to stateful component with `useEffect` for async mermaid
- **Does not consume `useTheme()`** — theme-unaware; needs to accept/read theme for mermaid
- `DOMPurify.sanitize()` is called with default config — **strips `<svg>` by default**

### 2.2 Marked Renderer Configuration

**File:** `src/components/file-viewer.tsx:46-54`

```typescript
const renderer = new marked.Renderer();
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const language = lang && hljs.getLanguage(lang) ? lang : undefined;
  const highlighted = language
    ? hljs.highlight(text, { language }).value
    : hljs.highlightAuto(text).value;
  return `<pre class="hljs"><code class="hljs language-${lang || "plaintext"}">${highlighted}</code></pre>`;
};
```

This renders mermaid blocks as highlighted code. Must be extended to handle `lang === "mermaid"`.

### 2.3 Theme System

**File:** `src/components/theme-provider.tsx:47-53`

`useTheme()` returns `{ theme: "dark" | "light", setTheme, toggleTheme }`. The `.dark` class is
applied to `<html>`. The current `MarkdownView` does not call `useTheme()`.

### 2.4 DOMPurify Configuration

`DOMPurify.sanitize(rawHtml)` is called without custom options. SVG elements are stripped. Mermaid
`render()` returns an SVG string — this cannot safely be embedded in the sanitized HTML blob
without special handling.

### 2.5 FileViewer Lazy Loading

**File:** `src/components/workspace-layout.tsx:11-18`

```typescript
const FileViewer = dynamic(() => import("@/components/file-viewer"), { ssr: false, ... });
```

`FileViewer` is already lazy-loaded. The `mermaid` library itself should additionally be
dynamically imported inside `useEffect` (only loaded when a mermaid block is encountered).

### 2.6 Raw/Preview Toggle

**File:** `src/components/file-viewer.tsx:461-464`

```typescript
isMarkdown && !showRaw ? (
  <MarkdownView content={fileContent.content} />
) : (
  <CodeView content={fileContent.content} language={fileContent.language} />
)
```

When `showRaw === true`, `CodeView` handles content. Mermaid blocks correctly show as source text.
**No changes needed to toggle logic.**

### 2.7 Error Boundary

**File:** `src/components/error-boundary.tsx:16-43`

`ErrorBoundary` already wraps `FileViewer` at `workspace-layout.tsx:164`. Mermaid render errors
should be caught **inline** (within the component, not escalated to the boundary), displaying the
raw source with an error indicator.

### 2.8 Existing Tests

**File:** `src/components/file-viewer.test.tsx:86-165`

Tests `4.1`, `4.4`, `4.5` cover basic markdown rendering and raw/preview toggle. New mermaid tests
will be co-located here following the existing pattern.

### 2.9 Current Dependencies

```json
"marked": "^18.0.3",
"dompurify": "^3.4.2",
"highlight.js": "^11.11.1"
```

**`mermaid` is NOT in `package.json`** — it is a new runtime dependency (~500KB minified,
~200KB gzipped).

---

## 3. Mermaid Library Research

**Source:** https://mermaid.js.org/config/usage.html

### 3.1 Core API

```typescript
// Dynamic import (lazy loading)
const mermaid = (await import('mermaid')).default;

// Initialize before rendering (call before each render batch)
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',      // default: encodes HTML in labels
  theme: 'dark' | 'default',    // theme mapped from useTheme()
});

// Render a single diagram
const { svg, bindFunctions } = await mermaid.render(
  `mermaid-${uniqueId}`,  // unique DOM id per diagram (required)
  graphDefinition          // mermaid source string
);
// svg: SVG markup string
// bindFunctions: optional; binds click/tooltip events after DOM insertion

// Validate syntax without rendering
const result = await mermaid.parse(code, { suppressErrors: true });
// returns { diagramType: string } or false if invalid
```

### 3.2 Available Themes

| Mermaid theme | Use when |
|---------------|----------|
| `'dark'`      | App theme is `"dark"` |
| `'default'`   | App theme is `"light"` |
| `'neutral'`   | (alternative for light) |
| `'base'`      | Custom theming via `themeVariables` |

### 3.3 Security Configuration

Default `securityLevel: 'strict'` is appropriate for DevDeck — HTML tags in diagram labels are
encoded, click functionality is disabled. This prevents XSS from malicious mermaid source.

### 3.4 Mermaid's Own Recommended Pattern for `marked`

From the mermaid docs:
```javascript
renderer.code = function (code, language) {
  if (language === 'mermaid') {
    return '<pre class="mermaid">' + code + '</pre>';
  }
  // ... other languages
};
```

Then after rendering, use `mermaid.run({ querySelector: '.mermaid' })` or `mermaid.render()` per
element. DevDeck will use the `mermaid.render()` per-element approach for greater control.

---

## 4. Technical Approach Recommendation

### 4.1 DOMPurify + SVG Problem (Critical)

**Problem:** `DOMPurify.sanitize()` strips `<svg>` by default. Mermaid outputs SVG.

**Recommended approach — DOM post-processing:**

1. In the custom `renderer.code`, when `lang === 'mermaid'`, output a safe HTML placeholder:
   ```html
   <div class="mermaid-block" data-mermaid-source="...HTML-escaped mermaid source...">
     <pre><code>raw mermaid source (shown while loading)</code></pre>
   </div>
   ```
   `<div>`, `<pre>`, `<code>` are all safe — DOMPurify preserves them. `data-*` attributes on
   known elements are preserved by DOMPurify.

2. `MarkdownView` becomes a stateful component with a `ref` on the `<article>` element.

3. In `useEffect`, after the HTML renders into the DOM:
   - Query `articleRef.current.querySelectorAll('[data-mermaid-source]')`
   - For each element, dynamically import mermaid, call `mermaid.initialize({ theme })`, and
     `mermaid.render(uniqueId, source)` asynchronously
   - Replace the element's `innerHTML` with the returned SVG
   - On render error, show inline error UI with raw source

4. The `useEffect` dependency array includes `[content, theme]` — re-renders mermaid diagrams
   when file content changes or theme toggles.

### 4.2 Component Architecture

**New component:** `MermaidBlock` is NOT needed — the DOM post-processing approach handles all
mermaid blocks within the `MarkdownView` component itself. A simpler helper function
`renderMermaidBlocks(articleEl, theme)` can be extracted for testability.

**Modified:** `MarkdownView` becomes:
```typescript
function MarkdownView({ content }: { content: string }) {
  const { theme } = useTheme();
  const articleRef = useRef<HTMLElement>(null);
  const rawHtml = useMemo(() => {
    const html = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(html);
  }, [content]);

  useEffect(() => {
    if (!articleRef.current) return;
    renderMermaidBlocks(articleRef.current, theme);
  }, [rawHtml, theme]);

  return (
