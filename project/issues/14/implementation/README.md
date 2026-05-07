# Implementation Notes — Issue #14

## Enhanced File Viewer: Markdown Preview, Inline Diff, Edit & Save

### Summary

All 10 tasks from the task breakdown have been implemented. The file viewer now supports:
- Enhanced markdown preview with hljs syntax highlighting in fenced code blocks and GFM table styling
- Raw/Preview toggle for markdown files
- Inline diff viewing with Changes/File tabs for modified files
- Edit mode with textarea, Save/Discard buttons, dirty state tracking, and optimistic concurrency via mtime

### Tasks Completed

#### Task 1: Extend Types
- **Files:** `src/lib/types.ts`
- Added `DiffLine`, `DiffHunk` types and `mtime?: number` to `FileContent`

#### Task 2: Enhanced Markdown Preview
- **Files:** `src/components/file-viewer.tsx`
- Custom `marked` renderer using `hljs.highlight()` for fenced code blocks
- GFM table styling with prose Tailwind classes
- Raw/Preview toggle button with `aria-pressed` attribute

#### Task 3: Diff Parser Utility
- **Files:** `src/lib/diff-parser.ts`
- Pure function `parseDiff(diffText: string): DiffHunk[]`
- Handles multi-hunk diffs, new files, deleted files, "no newline at end" markers

#### Task 4: Diff API Endpoint
- **Files:** `src/app/api/files/diff/route.ts`
- `GET /api/files/diff?slug=...&path=...`
- Path traversal protection, git diff execution, error handling

#### Task 5: DiffView Component
- **Files:** `src/components/diff-view.tsx`
- Named export `DiffView` component with semantic `<ins>`/`<del>` elements
- Dual line numbers, colored backgrounds, monospace font
- Empty diff shows "No changes" message

#### Task 6: Changes/File Tabs
- **Files:** `src/components/file-viewer.tsx`
- Tab bar visible when file has git status "modified" or "added"
- `findFileStatus()` utility to look up status from file tree
- Diff fetching with loading state

#### Task 7: PUT File Content Endpoint
- **Files:** `src/app/api/files/content/route.ts`
- PUT handler with validation, path traversal protection, binary file rejection
- Size limit (1MB), optimistic concurrency (mtime), atomic write (temp + rename)
- GET handler updated to include `mtime` in response

#### Task 8: Edit Mode
- **Files:** `src/components/file-viewer.tsx`
- Edit button (PencilSimple icon), textarea with `aria-label="File editor"`
- Save/Discard buttons with proper aria-labels
- Dirty indicator dot, confirmation on discard when dirty
- Toast notifications via Sonner for success/error/conflict

#### Task 9: Tests
- **Files:**
  - `src/lib/diff-parser.test.ts` — 9 unit tests
  - `src/app/api/files/diff/route.test.ts` — 5 API tests
  - `src/app/api/files/content/route.test.ts` — 9 API tests
  - `src/components/file-viewer.test.tsx` — 17 component tests
- Total: 40 new tests, all passing

#### Task 10: Update Documentation
- **Files:** `LLM.txt`
- Added entries for new components and API endpoints

### Verification Results

```
npm run lint        ✅ Pass (0 errors)
npm run format:check ✅ Pass
npm run build       ✅ Pass
npm run test        ✅ Pass (139 tests, 17 files)
```

### Architecture Notes

- Used `useState` instead of `useRef` for `originalContent` to avoid `react-hooks/refs` lint error when accessing ref during render
- Added `eslint-disable` comments for `react-hooks/set-state-in-effect` in effect bodies that reset state on dependency changes (standard React pattern)
- AnimatePresence with keyed motion.div requires `waitFor` in tests due to async transition animations in jsdom
- DiffView uses named export (not default) for tree-shaking compatibility
