# Research Brief — Issue #7: Performance Improvements

## Scope Classification

**scope_type:** `issue`

This issue addresses code-level performance optimizations within the existing DevDeck application. No new architectural paradigm or cross-cutting concern is being introduced. One existing core-component (CORE-COMPONENT-0003 — WebSocket Terminal Communication) may need a minor update if output batching is formally adopted. No new ADR is required unless the planner decides to formalize lazy-loading conventions as an architectural decision.

---

## Problem Analysis

### 1. Bundle Size & Code Splitting

#### Finding 1.1 — `FileViewer` eagerly loads three heavy libraries at module parse time
**File:** `src/components/file-viewer.tsx:1–32`

At the top of `file-viewer.tsx`, ten highlight.js language modules, `framer-motion` (`motion`, `AnimatePresence`), `marked`, and `dompurify` are all **statically imported**. These libraries are bundled into the initial JS chunk regardless of whether the user ever opens a file. Estimated combined weight: highlight.js core ≈ 25 KB (gzip), each language ≈ 2–4 KB, framer-motion ≈ 40 KB (gzip), marked ≈ 15 KB (gzip), dompurify ≈ 12 KB (gzip).

```typescript
// file-viewer.tsx:6–18 — all eagerly imported
import { motion, AnimatePresence } from "framer-motion";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
// ... 9 more languages
import { marked } from "marked";
import DOMPurify from "dompurify";
```

**Impact:** HIGH — these libraries load and parse on every page visit, even before any file is selected.

#### Finding 1.2 — `FileTree` eagerly loads framer-motion
**File:** `src/components/file-tree.tsx:22`

```typescript
import { motion, AnimatePresence } from "framer-motion";
```

`framer-motion` is imported at the module level for the folder expand/collapse animation. This means framer-motion is in the critical path for the workspace page even if no folder is ever expanded.

**Impact:** MEDIUM — framer-motion is already likely chunked by Next.js, but not lazy-loaded.

#### Finding 1.3 — xterm.js is already correctly lazy-loaded ✅
**File:** `src/hooks/use-terminal.ts:82–87`

```typescript
const { Terminal } = await import("@xterm/xterm");
const { FitAddon } = await import("@xterm/addon-fit");
const { WebLinksAddon } = await import("@xterm/addon-web-links");
const { Unicode11Addon } = await import("@xterm/addon-unicode11");
await import("@xterm/xterm/css/xterm.css");
```

All xterm.js modules (including the CSS) are dynamically imported inside the async `connect()` function. This is the correct pattern and requires no change.

#### Finding 1.4 — No bundle analyzer configured
**File:** `next.config.ts:1–15`

`next.config.ts` has only `serverExternalPackages` and a `rewrites()` entry. There is no `@next/bundle-analyzer` or equivalent configured. There is no way to measure baseline bundle size without adding one.

**Impact:** BLOCKER for acceptance criteria — baseline cannot be measured without this tool.

---

### 2. React Rendering Optimization

#### Finding 2.1 — `CodeView` re-runs syntax highlighting on every render (no memoization)
**File:** `src/components/file-viewer.tsx:49–69`

```typescript
function CodeView({ content, language }: { content: string; language: string }) {
  const highlighted = highlightCode(content, language);  // computed every render
  const lineCount = content.split("\n").length;          // computed every render
```

`highlightCode()` calls `hljs.highlight()` which is a synchronous, CPU-intensive string transformation. On a large file (e.g., 500 lines), this runs on every render cycle of `FileViewer`. Since `FileViewer` consumes `useWorkspace()` context which updates on panel toggles, folder expansions, etc., this runs more often than necessary.

**Impact:** MEDIUM — noticeable jank on large files when interacting with the sidebar.

#### Finding 2.2 — `FileTreeItem` is not wrapped in `React.memo`
**File:** `src/components/file-tree.tsx:157–219`

`FileTreeItem` reads from `useWorkspace()` context, which means every workspace context change (file selection, folder toggle, panel toggle) triggers a re-render of **every visible tree node**. With a large file tree (e.g., 50+ items), this is O(n) re-renders per interaction.

`useCallback` is correctly used for `handleClick` (line 164), but without `React.memo`, the component still re-renders whenever the parent re-renders.

**Impact:** MEDIUM — visible in large projects with deep file trees.

#### Finding 2.3 — `WorkspaceContext` value memoization is correct ✅
**File:** `src/lib/workspace-context.tsx:82–115`

The context value is correctly wrapped in `useMemo` with all dependencies listed. All setter functions use `useCallback`. This is properly optimized.

#### Finding 2.4 — Panel group full remount on toggle is intentional but expensive
**File:** `src/components/workspace-layout.tsx:74–76`

```typescript
function layoutKey(showFileViewer: boolean, showTerminal: boolean): string {
  return `layout-${showFileViewer ? "f" : ""}-${showTerminal ? "t" : ""}`;
}
```

The `key` on the `Group` component changes when panel visibility changes, forcing a full remount of the entire panel group (including the file tree, file viewer, and terminal). The comment explains this is intentional for layout recalculation. However, the terminal panel remount causes a new WebSocket connection on each toggle — reconnecting to the PTY. This could be avoided with CSS-based show/hide instead of unmounting.

**Impact:** HIGH — toggling the terminal panel kills the shell session and reconnects.

---

### 3. Terminal (xterm.js + WebSocket) Performance

#### Finding 3.1 — ResizeObserver fires with no debouncing
**File:** `src/hooks/use-terminal.ts:127–136`

```typescript
const observer = new ResizeObserver(() => {
  if (fitAddonRef.current && termRef.current) {
    try {
      fitAddonRef.current.fit();
    } catch { /* ignore */ }
  }
});
```

During panel drag (via react-resizable-panels), the `ResizeObserver` fires many times per second. Each call triggers `fitAddon.fit()`, which recalculates terminal dimensions and fires `term.onResize`, which sends a JSON resize message over WebSocket. This floods the WebSocket with resize messages during drag.

**Impact:** MEDIUM — excessive WebSocket messages during drag, potential PTY resize thrashing.

#### Finding 3.2 — PTY output sent immediately without batching (server-side)
**File:** `src/server/terminal-server.mts:63–70`

```typescript
pty.onData((data: string) => {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(Buffer.from(data, "utf8"));
    } catch { /* send failed */ }
  }
});
```

Every PTY output event (potentially many per millisecond for high-throughput commands like `cat large-file.txt`) sends a separate WebSocket frame immediately. xterm.js handles rapid writes well, but excessive frame overhead can degrade performance for high-throughput programs.

**Impact:** LOW-MEDIUM — acceptable for typical interactive use; noticeable only for very high-throughput output (log streaming, etc.).

#### Finding 3.3 — Binary framing is correctly used ✅
**Files:** `src/server/terminal-server.mts:65`, `src/hooks/use-terminal.ts:156`

Server uses `Buffer.from(data, 'utf8')` for binary frames. Client sets `ws.binaryType = "arraybuffer"` and checks `event.data instanceof ArrayBuffer`. This is correctly implemented per CORE-COMPONENT-0003.

---

### 4. Next.js Optimizations

#### Finding 4.1 — Home page unnecessarily marked `"use client"`
**File:** `src/app/page.tsx:1`

```typescript
"use client";
```

The home page (`/`) fetches projects via `useEffect` + `useState`. This pattern could be replaced with a React Server Component that fetches data on the server, with a client component only for the loading/error state or a Suspense boundary. This would eliminate the client-side waterfall (HTML → JS parse → fetch → render).

**Impact:** MEDIUM — first contentful paint improvement, eliminates client-side data waterfall.

#### Finding 4.2 — Project page fetches entire project list to find one project
**File:** `src/app/project/[slug]/page.tsx:19–28`

```typescript
fetch("/api/projects")
  .then((res) => res.json())
  .then((projects: Project[]) => {
    const found = projects.find((p) => p.slug === slug);
```

The workspace page fetches `/api/projects` (which reads all project directories) and then filters to a single project. There is no `/api/projects/[slug]` route for fetching a single project. This is wasteful when there are many projects.

**Impact:** LOW-MEDIUM — wasted API work; more impactful with many projects.

#### Finding 4.3 — No HTTP caching on API routes
**Files:** `src/app/api/projects/route.ts`, `src/app/api/files/route.ts`, `src/app/api/files/content/route.ts`

None of the API routes set `Cache-Control` headers. Every request (including navigating back to the projects list or switching files) hits the filesystem. File tree construction involves directory recursion up to depth 6 plus a `git status` subprocess.

**Impact:** MEDIUM — unnecessary repeated I/O; noticeable on slow filesystems or large repos.

#### Finding 4.4 — Turbopack already enabled for dev ✅
**File:** `package.json:6`

```json
"dev": "next dev --turbopack --hostname 0.0.0.0 --port 8001"
```

Turbopack is already in use for the dev server.

---

### 5. Asset Loading

#### Finding 5.1 — Icon tree-shaking works correctly ✅
**Files:** `src/components/file-tree.tsx`, `src/components/header.tsx`, etc.

All `@phosphor-icons/react` imports are named imports. The package is ESM-compatible and tree-shakeable. Only imported icons are bundled.

#### Finding 5.2 — Duplicate icon mapping between `file-tree.tsx` and `file-icons.tsx`
**Files:** `src/components/file-tree.tsx:26–57`, `src/lib/file-icons.tsx:23–62`

The extension-to-icon mapping is duplicated between `file-tree.tsx` (which has its own `extensionIconMap` and `nameIconMap`) and `src/lib/file-icons.tsx` (which has `extensionMap` and `nameMap`). The `file-tree.tsx` component does not use `getFileIcon()` from `file-icons.tsx`, maintaining a separate copy.

**Impact:** LOW — maintenance burden; no runtime performance impact.

#### Finding 5.3 — highlight.js CSS avoided correctly ✅
**File:** `src/app/globals.css:82–133`

Custom `.hljs-*` styles are defined inline in `globals.css` rather than importing the hljs CSS theme file. This avoids an extra stylesheet import and allows theme-aware coloring.

#### Finding 5.4 — File tree API does sequential `fs.stat()` per file
**File:** `src/app/api/files/route.ts:82`

```typescript
const stat = await fs.stat(fullPath).catch(() => null);
```

Inside `readDirectory()`, `fs.stat()` is awaited sequentially for each file entry. For a directory with 50 files, this is 50 sequential disk reads. Using `Promise.all` would parallelize them.

**Impact:** MEDIUM — on large projects, file tree API response time is significantly longer than necessary.

---

## Current State Assessment

### What Works Well
- **xterm.js lazy loading** — all terminal modules are dynamic imports; terminal never loads unless the terminal panel is opened
- **WorkspaceContext memoization** — `useMemo` + `useCallback` throughout; no unnecessary context-triggered cascades
- **Binary WebSocket framing** — correct implementation per CORE-COMPONENT-0003
- **Tailwind CSS v4 purging** — automatic CSS purging; no unused utility classes in production
- **Google Fonts optimization** — `next/font` handles font preloading and subsetting
- **highlight.js selective import** — using `highlight.js/lib/core` + individual language imports (not the 1 MB full build)
- **File size limits** — 1 MB cap on file content API prevents reading huge files
- **Directory depth limit** — `maxDepth: 6` prevents infinite recursion on deep trees

### What Needs Improvement
1. **FileViewer initial load cost** — heavy deps (hljs languages, framer-motion, marked, dompurify) in the critical path
2. **CodeView render cost** — syntax highlighting recalculated on every render
3. **FileTreeItem re-renders** — all tree nodes re-render on any workspace context change
4. **Terminal panel remount on toggle** — kills active shell session; WebSocket reconnects
5. **ResizeObserver debouncing** — resize flood during panel drag
6. **File tree API sequential I/O** — serial `fs.stat()` calls per file
7. **No API response caching** — every navigation hits the filesystem
8. **No bundle analyzer** — cannot measure baseline or verify improvements

---

## Specific Recommendations

### Priority 1 (HIGH IMPACT)

#### REC-1: Lazy-load `FileViewer` as a Next.js dynamic import
**Estimated impact:** Removes ~100 KB (gzip) from initial bundle.

Use `next/dynamic` to code-split the entire `FileViewer` component:

```typescript
// workspace-layout.tsx
import dynamic from "next/dynamic";
const FileViewer = dynamic(() => import("@/components/file-viewer"), {
  loading: () => <Spinner />,
  ssr: false,
});
```

This defers loading of highlight.js (10 languages), framer-motion, marked, and dompurify until the first file is opened.

**Files to change:** `src/components/workspace-layout.tsx`

#### REC-2: Prevent terminal remount on panel toggle using CSS visibility
**Estimated impact:** Eliminates WebSocket reconnect on every terminal toggle; maintains shell session.

Instead of using a layout `key` that unmounts the entire panel group, keep the terminal mounted but hide it via CSS. This requires decoupling the terminal from the panel visibility.

```typescript
// Use CSS to hide instead of conditional render
{/* Always mount terminal but control visibility */}
<Panel
  className={showTerminal ? "" : "hidden"}
  defaultSize={...}
  style={{ display: showTerminal ? undefined : "none" }}
>
  <TerminalPanel />
</Panel>
```

Note: `react-resizable-panels` may need careful handling to ensure hidden panels don't affect layout calculations. The `layoutKey` remount strategy exists specifically to address this. A possible approach is to keep the terminal panel mounted and use the Panel's `collapsible` prop with a min size of 0, rather than conditional rendering.

**Files to change:** `src/components/workspace-layout.tsx`, possibly `CORE-COMPONENT-0007`

#### REC-3: Add `@next/bundle-analyzer` and measure baseline
**Estimated impact:** Enables quantitative measurement for all other improvements (required for acceptance criteria).

```typescript
// next.config.ts
import bundleAnalyzer from "@next/bundle-analyzer";
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});
export default withBundleAnalyzer(nextConfig);
```

**Files to change:** `next.config.ts`, `package.json` (add `@next/bundle-analyzer` dev dep)

---

### Priority 2 (MEDIUM IMPACT)

#### REC-4: Memoize syntax highlighting in `CodeView`
**Estimated impact:** Eliminates redundant CPU work on every render cycle for large files.

```typescript
function CodeView({ content, language }: { content: string; language: string }) {
  const highlighted = useMemo(() => highlightCode(content, language), [content, language]);
  const lineCount = useMemo(() => content.split("\n").length, [content]);
  // ...
}
```

**Files to change:** `src/components/file-viewer.tsx`

#### REC-5: Wrap `FileTreeItem` in `React.memo`
**Estimated impact:** Reduces re-renders from O(n) per interaction to O(changed items).

```typescript
const FileTreeItem = React.memo(function FileTreeItem({ node, depth }: ...) {
  // ...
});
```

The `isExpanded` and `isSelected` values are computed from `expandedFolders` (a `Set`) and `selectedFile` inside the component, so memo will only help if the parent's reference to `node` is stable. Consider also memoizing the `nodes` array passed to `FileTree`.

**Files to change:** `src/components/file-tree.tsx`

#### REC-6: Debounce `fitAddon.fit()` in ResizeObserver
**Estimated impact:** Reduces WebSocket resize messages from ~60/second during drag to ~4/second.

```typescript
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
const observer = new ResizeObserver(() => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (fitAddonRef.current && termRef.current) {
      try { fitAddonRef.current.fit(); } catch { /* ignore */ }
    }
    resizeTimer = null;
  }, 16); // ~1 frame
});
```

**Files to change:** `src/hooks/use-terminal.ts`

#### REC-7: Parallelize `fs.stat()` calls in file tree API
**Estimated impact:** Reduces file tree API response time by 40-70% on projects with many files.

```typescript
// Instead of sequential awaits, batch the stat calls
const fileEntries = entries.filter(e => !e.isDirectory());
const stats = await Promise.all(
  fileEntries.map(entry => fs.stat(path.join(dirPath, entry.name)).catch(() => null))
);
```

Note: Node.js `readdir` with `withFileTypes: true` already provides `Dirent` objects; only the size requires `stat()`. An alternative is to store size separately or omit it from the tree response (it's only shown in the file viewer header).

**Files to change:** `src/app/api/files/route.ts`

---

### Priority 3 (LOW-MEDIUM IMPACT)

#### REC-8: Add short-lived `Cache-Control` headers to API routes
**Estimated impact:** Eliminates redundant filesystem reads for repeated navigation.

```typescript
// projects/route.ts
return NextResponse.json(projects, {
  headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" },
});
// files/route.ts
return NextResponse.json(tree, {
  headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=15" },
});
```

**Files to change:** `src/app/api/projects/route.ts`, `src/app/api/files/route.ts`, `src/app/api/files/content/route.ts`

#### REC-9: Add `/api/projects/[slug]` route to avoid over-fetching
**Estimated impact:** Workspace page loads with a single focused API call instead of fetching all projects.

**Files to change:** New file `src/app/api/projects/[slug]/route.ts`; update `src/app/project/[slug]/page.tsx`

#### REC-10: Output batching on terminal server (optional)
**Estimated impact:** LOW for interactive use; potentially significant for log-streaming/high-throughput commands.

If implemented, add a small buffer (≤16ms) on the server to coalesce rapid PTY output into fewer WebSocket frames. This would require updating CORE-COMPONENT-0003 to document the batching strategy.

**Files to change:** `src/server/terminal-server.mts`; CORE-COMPONENT-0003 if strategy is formalized.

#### REC-11: Consolidate duplicate icon mapping
**Estimated impact:** LOW — maintenance improvement only.

`src/components/file-tree.tsx` should use `getFileIcon()` from `src/lib/file-icons.tsx` instead of maintaining its own duplicate map.

**Files to change:** `src/components/file-tree.tsx`

---

## ADR / Core-Component Requirements

| Artifact | Action | Reason |
|----------|--------|--------|
| CORE-COMPONENT-0003 | **Optional update** | If terminal output batching (REC-10) is adopted, document the batching strategy in the WebSocket Terminal Communication component |
| CORE-COMPONENT-0007 | **Optional update** | If CSS-visibility approach for panel toggle (REC-2) changes the shell layout rules, update the rule about conditional rendering |
| New ADR | **Not required** | No new architectural paradigm; all changes are code-level optimizations within existing decisions |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Terminal CSS-hide approach breaks `react-resizable-panels` layout sizing | HIGH | Prototype and test before committing; fall back to remount with reconnect-preservation (store pty session on server) |
| `React.memo` on `FileTreeItem` causing stale renders if node references mutate | MEDIUM | Verify node objects are stable references from the API response; add deep equality if needed |
| `Cache-Control` on file content causing stale reads after user edits | MEDIUM | Set short TTL (5s) and `stale-while-revalidate`; or add ETag based on mtime |
| `next/dynamic` for FileViewer causing layout shift during lazy load | LOW | Show a spinner/skeleton matching the panel dimensions |
| Parallel `fs.stat()` overwhelming the OS file descriptor limit on very large trees | LOW | Already bounded by `maxDepth: 6` and ignored directories; acceptable risk |
| PTY output batching introducing perceptible input latency | LOW | Keep batch window ≤16ms; skip batching for interactive (stdin-triggered) output |

---

## Acceptance Criteria Mapping

| Acceptance Criterion | Addressed By |
|---------------------|-------------|
| Bundle size baseline measured and documented | REC-3 (bundle analyzer) |
| At least 3 actionable improvements with estimated impact | REC-1, REC-4, REC-5, REC-6, REC-7 (5 medium+ impact items) |
| Performance improvements with before/after measurements | REC-3 enables before/after; implement then re-run analyzer |
| No regressions in existing tests | All changes must pass existing vitest suite; REC-2 requires terminal reconnection test updates |

---

## Files Surveyed

| File | Key Findings |
|------|-------------|
| `src/components/file-viewer.tsx` | Eager heavy imports (hljs ×10, framer-motion, marked, dompurify); CodeView has no memoization |
| `src/components/file-tree.tsx` | Eager framer-motion; FileTreeItem not memoized; duplicate icon mapping |
| `src/components/workspace-layout.tsx` | Panel group remounts on toggle (kills terminal session) |
| `src/hooks/use-terminal.ts` | xterm lazy-loaded ✅; ResizeObserver has no debounce |
| `src/server/terminal-server.mts` | PTY output sent per-event with no batching |
| `src/app/api/files/route.ts` | Sequential fs.stat(); no caching headers |
| `src/app/api/projects/route.ts` | Sequential fs.access() per project; no caching |
| `src/app/api/files/content/route.ts` | No caching headers |
| `src/app/project/[slug]/page.tsx` | Fetches all projects to find one; full client component |
| `src/app/page.tsx` | Unnecessary "use client"; could be server component |
| `src/lib/workspace-context.tsx` | Well-optimized: useMemo + useCallback throughout ✅ |
| `next.config.ts` | Minimal config; no bundle analyzer |
| `package.json` | All correct dependencies; Turbopack enabled for dev ✅ |
| `src/app/globals.css` | Inline hljs theme (no external CSS needed) ✅ |
```
