# Task Breakdown — Issue #7: Performance Improvements

## Task 1: Add `@next/bundle-analyzer` and capture baseline metrics

- **Status:** pending
- **Complexity:** low
- **Dependencies:** none
- **Related ADRs:** ADR-0002
- **Related Core-Components:** none

### Description
Install `@next/bundle-analyzer` as a dev dependency and wire it into `next.config.ts` behind an `ANALYZE=true` environment variable. Add an `analyze` script to `package.json`. Run it once to establish baseline bundle sizes and document them in a comment or markdown file for before/after comparison.

### Acceptance Criteria
- `@next/bundle-analyzer` is listed in `devDependencies`
- `next.config.ts` wraps the config with `withBundleAnalyzer` when `ANALYZE=true`
- `package.json` has an `"analyze": "ANALYZE=true next build"` script
- Running `npm run analyze` produces `.next/analyze/` output without errors
- Existing `npm run build` still works without the analyzer (when `ANALYZE` is unset)

### Test Coverage
- Verify `next.config.ts` exports a valid config (manual build test)
- Verify `npm run build` succeeds without regression
- No unit tests required — this is a tooling/config change

---

## Task 2: Lazy-load FileViewer via `next/dynamic`

- **Status:** pending
- **Complexity:** medium
- **Dependencies:** Task 1 (baseline must exist for before/after comparison)
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0007

### Description
Replace the static import of `FileViewer` in `workspace-layout.tsx` with a `next/dynamic` import with `ssr: false`. Add a loading fallback (spinner) matching the existing loading pattern. The `FileViewer` component in `file-viewer.tsx` must use a default export for `next/dynamic` compatibility.

**Files to change:**
- `src/components/workspace-layout.tsx` — replace `import { FileViewer }` with `dynamic(() => import(...))`
- `src/components/file-viewer.tsx` — add `export default FileViewer` (or change named to default export)

### Acceptance Criteria
- `FileViewer` is loaded via `next/dynamic` with `ssr: false`
- A loading spinner is shown while `FileViewer` chunk loads
- highlight.js, framer-motion, marked, and dompurify are NOT in the initial JS bundle (verifiable via bundle analyzer)
- File viewing works correctly after lazy load — selecting a file still renders content
- No TypeScript errors

### Test Coverage
- Existing `FileViewer` tests must pass (functionality unchanged)
- Manual verification via bundle analyzer that initial chunk size decreased
- E2E: selecting a file still renders file content correctly

---

## Task 3: Memoize CodeView syntax highlighting and line count

- **Status:** pending
- **Complexity:** low
- **Dependencies:** none
- **Related ADRs:** ADR-0002
- **Related Core-Components:** none

### Description
Wrap the `highlightCode()` call and `content.split("\n").length` computation in `useMemo` with `[content, language]` and `[content]` dependencies respectively.

**Files to change:**
- `src/components/file-viewer.tsx` — add `useMemo` to `CodeView`

### Acceptance Criteria
- `highlightCode(content, language)` is wrapped in `useMemo` with deps `[content, language]`
- `content.split("\n").length` is wrapped in `useMemo` with dep `[content]`
- `useMemo` is imported from React
- File viewing still works correctly for code files and markdown

### Test Coverage
- Unit test: `CodeView` renders correctly with highlighted content (existing tests if any)
- Unit test: verify `CodeView` does not call `highlightCode` on re-render when `content` and `language` are unchanged (can test via spy/mock on `hljs.highlight`)

---

## Task 4: Wrap FileTreeItem in `React.memo` and consolidate icon mapping

- **Status:** pending
- **Complexity:** medium
- **Dependencies:** none
- **Related ADRs:** ADR-0002
- **Related Core-Components:** none

### Description
**Part A — React.memo:** Wrap `FileTreeItem` in `React.memo` to prevent re-renders when the component's props (`node`, `depth`) haven't changed. Since `FileTreeItem` reads from `useWorkspace()` context internally, memo will prevent re-renders only when the parent re-renders but context hasn't changed. This is still valuable for preventing cascade re-renders from parent `FileTree` re-renders.

**Part B — Icon consolidation (REC-11):** Remove the duplicate `extensionIconMap` and `nameIconMap` from `file-tree.tsx` and replace `resolveFileIcon()` with a call to `getFileIcon()` from `src/lib/file-icons.tsx`. Remove the now-unused icon imports that are already available from `file-icons.tsx`.

**Files to change:**
- `src/components/file-tree.tsx` — wrap `FileTreeItem` in `React.memo`, replace local icon maps with `getFileIcon()`

### Acceptance Criteria
- `FileTreeItem` is wrapped in `React.memo`
- `file-tree.tsx` no longer contains `extensionIconMap` or `nameIconMap`
- `file-tree.tsx` imports `getFileIcon` from `@/lib/file-icons`
- `resolveFileIcon` function is removed from `file-tree.tsx`
- File tree renders correctly: icons, expand/collapse, selection all work
- No duplicate icon type imports between `file-tree.tsx` and `file-icons.tsx`

### Test Coverage
- Unit test: `FileTree` renders file nodes with correct icons
- Unit test: `FileTree` expand/collapse still works
- Manual: verify tree rendering in the browser matches previous behavior

---

## Task 5: Debounce ResizeObserver `fitAddon.fit()`

- **Status:** pending
- **Complexity:** low
- **Dependencies:** none
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
Add debouncing to the `ResizeObserver` callback in `use-terminal.ts` to prevent flooding WebSocket with resize messages during panel drag. Use a `setTimeout` with ~150ms delay (balancing responsiveness with flood prevention). Clear the timer on each new observation. Clean up the timer in the effect cleanup.

**Files to change:**
- `src/hooks/use-terminal.ts` — add debounce to ResizeObserver callback

### Acceptance Criteria
- `ResizeObserver` callback uses `setTimeout` with debounce (100-200ms)
- Previous timeout is cleared on each new resize observation (`clearTimeout`)
- Debounce timer is cleaned up in the effect cleanup function
- Terminal still resizes correctly when panel is resized
- Terminal still fits correctly on initial mount (first fit is immediate, not debounced)

### Test Coverage
- Unit test: verify debounce timer is set on resize observation
- Unit test: verify debounce timer is cleared on cleanup
- Manual: drag panel resizer and verify terminal resizes without flooding (no visible lag)

---

## Task 6: Parallelize `fs.stat()` calls in file tree API

- **Status:** pending
- **Complexity:** low
- **Dependencies:** none
- **Related ADRs:** ADR-0002
- **Related Core-Components:** none

### Description
In `readDirectory()` in `src/app/api/files/route.ts`, the loop currently awaits `fs.stat()` sequentially for each file entry. Refactor to collect all file entries first, then use `Promise.all()` to parallelize the stat calls.

**Files to change:**
- `src/app/api/files/route.ts` — refactor `readDirectory()` to batch `fs.stat()` calls

### Acceptance Criteria
- File entries' `fs.stat()` calls are executed with `Promise.all()` instead of sequentially
- Directory recursion can remain sequential (directories are processed one at a time — parallel recursion is acceptable but not required)
- API response format is unchanged (same JSON shape)
- Files are still sorted correctly (directories first, then alphabetical)
- Error handling for individual `fs.stat()` failures is preserved (`.catch(() => null)`)

### Test Coverage
- Unit test: `GET /api/files?slug=...` returns correct file tree structure
- Unit test: verify response includes file sizes
- Unit test: verify files with failed stat still appear with size 0

---

## Task 7: Add Cache-Control headers to API routes

- **Status:** pending
- **Complexity:** low
- **Dependencies:** none
- **Related ADRs:** ADR-0002
- **Related Core-Components:** none

### Description
Add short-lived `Cache-Control` headers to the three API routes to reduce redundant filesystem reads on repeated navigation. Use `private` directive since these are user-specific responses.

**Headers:**
- `/api/projects` — `Cache-Control: private, max-age=10, stale-while-revalidate=30`
- `/api/files` — `Cache-Control: private, max-age=5, stale-while-revalidate=15`
- `/api/files/content` — `Cache-Control: private, max-age=5, stale-while-revalidate=15`

**Files to change:**
- `src/app/api/projects/route.ts`
- `src/app/api/files/route.ts`
- `src/app/api/files/content/route.ts`

### Acceptance Criteria
- All three API routes include `Cache-Control` headers in successful responses
- Error responses do NOT include `Cache-Control` headers
- Header values match the specification above
- API responses are otherwise unchanged

### Test Coverage
- Unit test: verify each API route includes `Cache-Control` header in success response
- Unit test: verify error responses do not include caching headers

---

## Task 8: Final validation — bundle size verification and full test suite

- **Status:** pending
- **Complexity:** low
- **Dependencies:** Tasks 1-7
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0007

### Description
Run the full test suite (`npm test`) and bundle analyzer (`npm run analyze`) to verify:
1. No test regressions from any of the changes
2. Initial bundle size has decreased (FileViewer chunk is now separate)
3. All functionality works end-to-end

This is a validation task, not a code change task.

### Acceptance Criteria
- `npm test` passes with no failures
- `npm run build` succeeds
- `npm run lint` passes
- Bundle analyzer shows FileViewer-related libraries (highlight.js, framer-motion, marked, dompurify) in a separate lazy-loaded chunk, not in the initial bundle
- E2E tests pass (if present)

### Test Coverage
- Full test suite execution
- Bundle analyzer output review
- Manual smoke test of file viewing, file tree, terminal, and panel resizing
