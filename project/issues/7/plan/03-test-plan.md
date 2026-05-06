# Test Plan — Issue #7: Performance Improvements

## Test T1: Bundle analyzer configuration

- **Type:** manual / build verification
- **Task:** Task 1
- **Priority:** high

### Setup
- Install `@next/bundle-analyzer` dev dependency
- Apply `next.config.ts` changes

### Steps
1. Run `npm run build` — verify it succeeds without `ANALYZE` set
2. Run `ANALYZE=true npm run build` — verify it produces analyzer output
3. Check that `.next/analyze/` or browser report is generated

### Expected Result
- Build succeeds in both modes
- Analyzer output is generated only when `ANALYZE=true`
- No changes to runtime behavior

---

## Test T2: FileViewer lazy loading

- **Type:** unit + manual
- **Task:** Task 2
- **Priority:** high

### Setup
- Apply `next/dynamic` import in `workspace-layout.tsx`
- Ensure `file-viewer.tsx` has a default export

### Steps
1. Run `npm run build` — verify no TypeScript or build errors
2. Run `npm run analyze` — inspect chunk output
3. Open the app, navigate to a project workspace
4. Verify a loading spinner appears briefly before the file viewer loads
5. Select a file — verify content renders correctly (code highlighting, markdown, binary indicator)
6. Run existing vitest tests — verify no regressions

### Expected Result
- highlight.js, framer-motion, marked, dompurify appear in a separate lazy chunk, not the initial bundle
- File viewing works identically to before
- Loading spinner displays during chunk load
- All existing tests pass

---

## Test T3: CodeView memoization

- **Type:** unit
- **Task:** Task 3
- **Priority:** medium

### Setup
- Apply `useMemo` changes to `CodeView` in `file-viewer.tsx`

### Steps
1. Write a unit test that renders `CodeView` with specific content and language
2. Verify the rendered output contains highlighted HTML
3. Re-render with the same props — verify `highlightCode` is not called again (spy on `hljs.highlight`)
4. Re-render with different content — verify `highlightCode` IS called again
5. Run existing tests — verify no regressions

### Expected Result
- `highlightCode` runs only when `content` or `language` changes
- `lineCount` is recalculated only when `content` changes
- Rendered HTML output is identical to previous behavior

---

## Test T4: FileTreeItem React.memo and icon consolidation

- **Type:** unit
- **Task:** Task 4
- **Priority:** medium

### Setup
- Apply `React.memo` wrapper to `FileTreeItem`
- Replace local icon maps with `getFileIcon` from `@/lib/file-icons`

### Steps
1. Render `FileTree` with a set of test file nodes (various extensions: `.ts`, `.md`, `.json`, `.css`)
2. Verify each file shows the correct icon
3. Verify folders show folder icons
4. Click a folder — verify expand/collapse animation works
5. Click a file — verify selection highlighting works
6. Verify `file-tree.tsx` no longer contains `extensionIconMap` or `nameIconMap`
7. Run existing tests — verify no regressions

### Expected Result
- Icons match for all file extensions (same mapping as before)
- Folder expand/collapse works with animation
- File selection works
- No duplicate icon map code in `file-tree.tsx`

---

## Test T5: ResizeObserver debouncing

- **Type:** unit
- **Task:** Task 5
- **Priority:** medium

### Setup
- Apply debounce changes to `use-terminal.ts`

### Steps
1. Unit test: mock `ResizeObserver`, trigger multiple resize events in rapid succession
2. Verify `fitAddon.fit()` is called only once after the debounce period (not once per event)
3. Unit test: verify the debounce timer is cleared during cleanup
4. Manual test: open terminal panel, drag the panel resizer — verify terminal resizes correctly without visible lag
5. Manual test: verify initial terminal mount fits correctly (no delay on first load)

### Expected Result
- Multiple rapid resize events result in a single `fitAddon.fit()` call
- Terminal still resizes correctly during panel drag (just debounced)
- Initial fit on mount is not affected by debounce
- Cleanup disposes of pending timers

---

## Test T6: Parallel fs.stat() in file tree API

- **Type:** unit
- **Task:** Task 6
- **Priority:** medium

### Setup
- Apply `Promise.all()` refactoring to `readDirectory()` in `src/app/api/files/route.ts`

### Steps
1. Unit test: call `GET /api/files?slug=<test-project>` and verify the response structure
2. Verify directories appear before files in the response
3. Verify file entries have `size` property
4. Verify a file whose `fs.stat()` fails still appears with `size: 0`
5. Run existing API tests — verify no regressions

### Expected Result
- API response shape is unchanged
- File sizes are correctly populated
- Sort order is preserved (directories first, then alphabetical)
- Error handling is preserved

---

## Test T7: Cache-Control headers on API routes

- **Type:** unit
- **Task:** Task 7
- **Priority:** low

### Setup
- Apply Cache-Control header changes to all three API routes

### Steps
1. Unit test: `GET /api/projects` — verify response includes `Cache-Control: private, max-age=10, stale-while-revalidate=30`
2. Unit test: `GET /api/files?slug=...` — verify response includes `Cache-Control: private, max-age=5, stale-while-revalidate=15`
3. Unit test: `GET /api/files/content?slug=...&path=...` — verify response includes `Cache-Control: private, max-age=5, stale-while-revalidate=15`
4. Unit test: trigger an error response from each route — verify NO `Cache-Control` header is present
5. Run existing tests — verify no regressions

### Expected Result
- Success responses include appropriate `Cache-Control` headers
- Error responses do not include caching headers
- All existing tests pass

---

## Test T8: End-to-end validation

- **Type:** integration / manual
- **Task:** Task 8
- **Priority:** high

### Setup
- All Tasks 1-7 are complete

### Steps
1. Run `npm run lint` — verify no lint errors
2. Run `npm test` — verify all unit tests pass
3. Run `npm run build` — verify production build succeeds
4. Run `npm run analyze` — capture post-optimization bundle sizes
5. Compare initial bundle size with baseline from Task 1
6. Start the app (`npm run dev:all`) and manually test:
   a. Navigate to project list — loads correctly
   b. Open a project workspace — file tree renders
   c. Click files — file viewer lazy-loads and displays content
   d. Expand/collapse folders — animations work, icons are correct
   e. Open terminal panel — terminal connects
   f. Resize panels by dragging — terminal resizes without flooding
   g. Navigate back to project list — loads quickly (cached)
7. Run E2E tests if present (`npx playwright test`)

### Expected Result
- All tests pass with zero failures
- Bundle analyzer confirms FileViewer libraries are in a separate chunk
- Initial page load bundle is measurably smaller than baseline
- All UI interactions work without regressions
- No console errors in the browser
