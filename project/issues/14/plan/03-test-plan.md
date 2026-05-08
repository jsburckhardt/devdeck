# Test Plan — Issue #14: Enhanced File Viewer

## Test Strategy

All tests use vitest. Component tests run in jsdom (default). API route tests use `// @vitest-environment node` pragma. Tests are co-located with source files per CORE-COMPONENT-0006.

---

## Test T-1: findFileStatus unit tests

- **Type:** unit
- **Task:** Task 1
- **Priority:** high

### Setup
Create `src/lib/file-utils.test.ts`. Import `findFileStatus` and construct mock `FileNode[]` trees.

### Steps
1. Build a flat file tree with files having various statuses
2. Build a nested file tree with files inside directories
3. Call `findFileStatus` with known paths
4. Call `findFileStatus` with unknown paths

### Expected Result
- Returns correct status (`'added'`, `'modified'`, `'deleted'`) for matching paths
- Returns `undefined` for paths not in the tree
- Traverses nested directories correctly

---

## Test T-2: Diff parser — single-hunk diff

- **Type:** unit
- **Task:** Task 4
- **Priority:** high

### Setup
Create `src/lib/diff-utils.test.ts`. Import `parseDiff`. Prepare a sample unified diff string with one hunk containing added, removed, and context lines.

### Steps
1. Call `parseDiff(singleHunkDiff)`
2. Verify returned array has exactly 1 hunk
3. Verify hunk header is extracted
4. Verify each line has correct type and line numbers

### Expected Result
- Returns `DiffHunk[]` with 1 entry
- Lines classified correctly as `'added'`, `'removed'`, or `'context'`
- Old and new line numbers increment correctly

---

## Test T-3: Diff parser — multi-hunk diff

- **Type:** unit
- **Task:** Task 4
- **Priority:** high

### Setup
Prepare a unified diff string with two `@@` hunk headers.

### Steps
1. Call `parseDiff(multiHunkDiff)`
2. Verify returned array has exactly 2 hunks
3. Verify each hunk has correct `oldStart` and `newStart`

### Expected Result
- Returns 2 `DiffHunk` entries with correct header data and line classification

---

## Test T-4: Diff parser — empty input

- **Type:** unit
- **Task:** Task 4
- **Priority:** high

### Setup
N/A

### Steps
1. Call `parseDiff("")`
2. Call `parseDiff("   ")`

### Expected Result
- Returns empty array `[]` for both inputs

---

## Test T-5: Diff parser — all-added file (new file)

- **Type:** unit
- **Task:** Task 4
- **Priority:** medium

### Setup
Prepare a diff where all lines start with `+` (simulating a new file diff).

### Steps
1. Call `parseDiff(newFileDiff)`
2. Verify all lines have `type: 'added'`

### Expected Result
- Every line in the hunk is classified as `'added'`

---

## Test T-6: Diff parser — all-removed file

- **Type:** unit
- **Task:** Task 4
- **Priority:** medium

### Setup
Prepare a diff where all lines start with `-`.

### Steps
1. Call `parseDiff(deletedFileDiff)`
2. Verify all lines have `type: 'removed'`

### Expected Result
- Every line in the hunk is classified as `'removed'`

---

## Test T-7: Diff parser — hunk header parsing

- **Type:** unit
- **Task:** Task 4
- **Priority:** high

### Setup
Prepare diff with hunk header `@@ -10,5 +12,7 @@ function example()`.

### Steps
1. Parse the diff
2. Check `oldStart` and `newStart` on the resulting hunk

### Expected Result
- `oldStart` is 10, `newStart` is 12
- Header string preserved

---

## Test T-8: Diff parser — no newline at end of file

- **Type:** unit
- **Task:** Task 4
- **Priority:** medium

### Setup
Prepare diff containing `\ No newline at end of file` marker line.

### Steps
1. Parse the diff
2. Verify the marker line is not included in output lines

### Expected Result
- `\ No newline at end of file` is skipped; no DiffLine entry for it

---

## Test T-9: GET /api/files/diff — missing params

- **Type:** API (node)
- **Task:** Task 5
- **Priority:** high

### Setup
Create `src/app/api/files/diff/route.test.ts` with `// @vitest-environment node`. Import the GET handler. Create a `NextRequest` with missing `slug` or `path` params.

### Steps
1. Call GET with no query params
2. Call GET with only `slug`
3. Call GET with only `path`

### Expected Result
- All return 400 with error message

---

## Test T-10: GET /api/files/diff — path traversal

- **Type:** API (node)
- **Task:** Task 5
- **Priority:** high

### Setup
Mock `resolveProjectPath` to return a known root. Create request with `path=../../etc/passwd`.

### Steps
1. Call GET with traversal path

### Expected Result
- Returns 403

---

## Test T-11: GET /api/files/diff — successful diff

- **Type:** API (node)
- **Task:** Task 5
- **Priority:** high

### Setup
Mock `resolveProjectPath` and `execFile` to return sample diff output.

### Steps
1. Call GET with valid slug and path
2. Verify response structure

### Expected Result
- Returns 200 with `{ diff: string, hunks: DiffHunk[] }`
- Hunks match parsed output of the mock diff

---

## Test T-12: GET /api/files/diff — unmodified file

- **Type:** API (node)
- **Task:** Task 5
- **Priority:** medium

### Setup
Mock `execFile` to return empty stdout (no changes).

### Steps
1. Call GET with valid slug and path

### Expected Result
- Returns 200 with `{ diff: "", hunks: [] }`

---

## Test T-13: PUT /api/files/content — missing params

- **Type:** API (node)
- **Task:** Task 8
- **Priority:** high

### Setup
Create `src/app/api/files/content/route.test.ts` with `// @vitest-environment node`. Import PUT handler.

### Steps
1. Call PUT with empty body
2. Call PUT with missing `content`
3. Call PUT with missing `slug`

### Expected Result
- All return 400

---

## Test T-14: PUT /api/files/content — path traversal

- **Type:** API (node)
- **Task:** Task 8
- **Priority:** high

### Setup
Mock `resolveProjectPath`. Send PUT with `path: "../../etc/evil"`.

### Steps
1. Call PUT with traversal path

### Expected Result
- Returns 403

---

## Test T-15: PUT /api/files/content — successful write

- **Type:** API (node)
- **Task:** Task 8
- **Priority:** high

### Setup
Mock `resolveProjectPath`. Create a temp directory with a test file. Send PUT with valid content.

### Steps
1. Call PUT with slug, path, and content
2. Read file from disk to verify

### Expected Result
- Returns 200 with `{ success: true, mtime, size }`
- File on disk contains the new content

---

## Test T-16: PUT /api/files/content — content too large

- **Type:** API (node)
- **Task:** Task 8
- **Priority:** medium

### Setup
Generate content string > 1MB.

### Steps
1. Call PUT with oversized content

### Expected Result
- Returns 413

---

## Test T-17: PUT /api/files/content — mtime conflict

- **Type:** API (node)
- **Task:** Task 8
- **Priority:** high

### Setup
Create test file with known mtime. Send PUT with `If-Unmodified-Since` header set to a time before the file's actual mtime.

### Steps
1. Call PUT with stale mtime

### Expected Result
- Returns 409 with `{ error: "File modified externally", mtime }`

---

## Test T-18: PUT /api/files/content — GET regression

- **Type:** API (node)
- **Task:** Task 8
- **Priority:** medium

### Setup
After adding PUT handler, import GET handler from same module.

### Steps
1. Call GET with valid slug and path

### Expected Result
- Returns 200 with valid FileContent (confirms GET still works)

---

## Test T-19: DiffView — renders added/removed/context lines

- **Type:** component
- **Task:** Task 6
- **Priority:** high

### Setup
Create `src/components/diff-view.test.tsx`. Render `<DiffView hunks={sampleHunks} />` with a mix of line types.

### Steps
1. Render component with sample hunks
2. Query for elements with diff-specific CSS classes or data attributes

### Expected Result
- Added lines have the added styling class
- Removed lines have the removed styling class
- Context lines have neutral styling

---

## Test T-20: DiffView — empty hunks

- **Type:** component
- **Task:** Task 6
- **Priority:** medium

### Setup
Render `<DiffView hunks={[]} />`.

### Steps
1. Render component with empty array
2. Look for "No changes" text

### Expected Result
- "No changes" message is visible

---

## Test T-21: DiffView — line numbers

- **Type:** component
- **Task:** Task 6
- **Priority:** medium

### Setup
Render DiffView with known hunks where line numbers are predictable.

### Steps
1. Render component
2. Query line number elements

### Expected Result
- Old and new line numbers display correctly for each line

---

## Test T-22: MarkdownView — hljs code blocks

- **Type:** component
- **Task:** Task 2
- **Priority:** high

### Setup
Render `MarkdownView` with markdown containing a fenced code block with language hint.

### Steps
1. Render with ` ```typescript\nconst x = 1;\n``` `
2. Check rendered HTML for hljs class names

### Expected Result
- Output contains `hljs` class on the `<code>` element
- Syntax tokens are highlighted

---

## Test T-23: MarkdownView — GFM table

- **Type:** component
- **Task:** Task 2
- **Priority:** medium

### Setup
Render `MarkdownView` with GFM table markdown.

### Steps
1. Render with `| A | B |\n|---|---|\n| 1 | 2 |`
2. Query for `<table>` element

### Expected Result
- `<table>` element exists in rendered output

---

## Test T-24: MarkdownView — task list

- **Type:** component
- **Task:** Task 2
- **Priority:** medium

### Setup
Render `MarkdownView` with task list markdown.

### Steps
1. Render with `- [x] Done\n- [ ] Todo`
2. Query for `<input type="checkbox">` elements

### Expected Result
- Two checkbox inputs found; first is checked, second is not

---

## Test T-25: Raw/Preview toggle — renders for markdown

- **Type:** component
- **Task:** Task 3
- **Priority:** high

### Setup
Render `FileViewer` (or the relevant sub-component) with a markdown file loaded. Mock workspace context and fetch.

### Steps
1. Verify toggle button is present
2. Click toggle
3. Verify view switches

### Expected Result
- Toggle button visible for markdown files
- Clicking switches between rendered and raw views

---

## Test T-26: Raw/Preview toggle — hidden for non-markdown

- **Type:** component
- **Task:** Task 3
- **Priority:** medium

### Setup
Render FileViewer with a TypeScript file loaded.

### Steps
1. Check for toggle button

### Expected Result
- Toggle button is not rendered

---

## Test T-27: Changes/File tabs — visible for modified file

- **Type:** component
- **Task:** Task 7
- **Priority:** high

### Setup
Render FileViewer with a file tree where the selected file has `status: "modified"`. Mock workspace context.

### Steps
1. Verify "File" and "Changes" tabs are present
2. Click "Changes" tab
3. Verify DiffView is rendered (mock fetch for diff API)

### Expected Result
- Tabs visible; switching tabs changes content

---

## Test T-28: Changes/File tabs — hidden for clean file

- **Type:** component
- **Task:** Task 7
- **Priority:** medium

### Setup
Render FileViewer with a file tree where the selected file has no status.

### Steps
1. Check for tab elements

### Expected Result
- No tab bar rendered

---

## Test T-29: Edit mode — edit button for text files

- **Type:** component
- **Task:** Task 9
- **Priority:** high

### Setup
Render FileViewer with a text file loaded. Mock workspace context and fetch.

### Steps
1. Verify "Edit" button is present with aria-label
2. Verify "Edit" button is absent for binary file

### Expected Result
- Edit button renders for text files, not for binary

---

## Test T-30: Edit mode — entering edit mode

- **Type:** component
- **Task:** Task 9
- **Priority:** high

### Setup
Render FileViewer with a text file. Click "Edit".

### Steps
1. Click "Edit" button
2. Verify textarea appears with file content
3. Verify Save and Discard buttons appear

### Expected Result
- Textarea visible with original content
- Save and Discard buttons in header

---

## Test T-31: Edit mode — dirty indicator

- **Type:** component
- **Task:** Task 9
- **Priority:** medium

### Setup
Enter edit mode and modify textarea content.

### Steps
1. Enter edit mode
2. Change textarea value
3. Check for dirty indicator

### Expected Result
- Dirty indicator (dot) visible when content differs from original

---

## Test T-32: Edit mode — save triggers PUT

- **Type:** component
- **Task:** Task 9
- **Priority:** high

### Setup
Mock `fetch` to intercept PUT request. Enter edit mode, modify content.

### Steps
1. Enter edit mode, modify content
2. Click "Save"
3. Verify fetch was called with PUT method, correct body and headers

### Expected Result
- `fetch` called with `PUT /api/files/content` with slug, path, content in body and If-Unmodified-Since header

---

## Test T-33: Edit mode — discard with changes

- **Type:** component
- **Task:** Task 9
- **Priority:** medium

### Setup
Mock `window.confirm`. Enter edit mode, modify content.

### Steps
1. Enter edit mode, modify content
2. Click "Discard"
3. Verify confirm dialog was shown

### Expected Result
- `window.confirm` called; if confirmed, exits edit mode and restores original content

---

## Test T-34: Edit mode — save failure preserves content

- **Type:** component
- **Task:** Task 9
- **Priority:** high

### Setup
Mock `fetch` to return 500 error. Enter edit mode, modify content.

### Steps
1. Enter edit mode, modify content
2. Click "Save"
3. Wait for fetch rejection

### Expected Result
- Textarea still visible with modified content (not discarded)
- Error toast shown (verify toast call or visible text)

---

## Verification Commands

```bash
npm run lint         # ESLint
npm run format:check # Prettier
npm run build        # Next.js build
npm run test         # Vitest (all tests)
```
