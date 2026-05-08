# Task Breakdown — Issue #14: Enhanced File Viewer

## Task 1: Add diff types and file-status lookup helper

- **Status:** pending
- **Complexity:** small
- **Dependencies:** none
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006

### Description
Add `DiffLine` and `DiffHunk` types to `src/lib/types.ts`. Add `mtime` field to `FileContent`. Create a helper function `findFileStatus(fileTree: FileNode[], filePath: string)` in `src/lib/file-utils.ts` that recursively searches the file tree to return the git status of a given file path. This avoids modifying the workspace context interface — the viewer will call this helper with the existing `fileTree` from context.

### Acceptance Criteria
- `DiffLine` type has: `type: 'added' | 'removed' | 'context'`, `content: string`, `oldLineNumber?: number`, `newLineNumber?: number`
- `DiffHunk` type has: `header: string`, `lines: DiffLine[]`, `oldStart: number`, `newStart: number`
- `FileContent` gains `mtime: number` (epoch ms)
- `findFileStatus` returns `'added' | 'modified' | 'deleted' | undefined` for a given path
- `findFileStatus` handles nested directory structures (recursive search through children)
- Helper is exported from `src/lib/file-utils.ts`

### Test Coverage
- Unit test `findFileStatus` with flat tree, nested tree, missing file, and root-level file
- Test returns `undefined` for files not in tree
- Co-located test file: `src/components/file-viewer.test.tsx`

---

## Task 2: Enhance MarkdownView with hljs code blocks and GFM styling

- **Status:** pending
- **Complexity:** medium
- **Dependencies:** Task 1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0006

### Description
Configure `marked`'s renderer to use `hljs.highlight()` for fenced code blocks with a language hint and `hljs.highlightAuto()` for blocks without. Add CSS for GFM tables (borders, padding, alternating row backgrounds) and task-list checkboxes in `src/app/globals.css`. The code block renderer should produce `<pre><code class="hljs language-{lang}">` markup so hljs theme styles apply. Update DOMPurify config to allow `class` attributes on `<code>` and `<pre>` elements.

### Acceptance Criteria
- Fenced code blocks in markdown preview render with syntax highlighting via hljs
- Code blocks without a language hint use `highlightAuto`
- GFM tables render with visible borders, cell padding, and alternating row colors
- Task-list checkboxes (`- [x]`, `- [ ]`) render as styled checkboxes
- All styles use CSS custom properties or Tailwind classes consistent with CORE-COMPONENT-0004
- DOMPurify config allows `class` attributes on `<code>` and `<pre>` elements

### Test Coverage
- Component test: render MarkdownView with a fenced code block, verify hljs classes appear in output
- Component test: render MarkdownView with a GFM table, verify `<table>` renders
- Component test: render MarkdownView with task list, verify checkbox inputs render

---

## Task 3: Add Raw/Preview toggle to markdown files

- **Status:** pending
- **Complexity:** small
- **Dependencies:** Task 2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0007

### Description
Add a toggle button in the file viewer header bar that switches between raw source (CodeView) and rendered preview (MarkdownView) for markdown files. Default to preview mode. Use Phosphor icons (`Code` / `Eye`). Position in the header bar's right section next to the language/size info.

### Acceptance Criteria
- Toggle button appears only for markdown files
- Default view is preview (MarkdownView)
- Clicking toggle switches to raw source (CodeView) and vice versa
- Button icon changes to reflect current/available mode
- Button has `aria-pressed` attribute indicating current state
- Toggle state resets when switching files

### Test Coverage
- Component test: verify toggle renders for `.md` files
- Component test: verify toggle does not render for non-markdown files
- Component test: verify clicking toggle switches between CodeView and MarkdownView
- Component test: verify `aria-pressed` reflects state

---

## Task 4: Create unified diff parser utility

- **Status:** pending
- **Complexity:** medium
- **Dependencies:** Task 1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006

### Description
Create `src/lib/diff-parser.ts` with a `parseDiff(rawDiff: string): DiffHunk[]` function. The parser handles standard unified diff output from `git diff`:
- `@@` hunk headers with line number extraction
- `+` lines → `added`
- `-` lines → `removed`
- ` ` (space) lines → `context`
- Skip the `diff --git`, `index`, `---`, `+++` header lines
- Track old and new line numbers per line
- Handle empty diff input (return `[]`)
- Handle `\ No newline at end of file` marker

### Acceptance Criteria
- `parseDiff` correctly parses a multi-hunk unified diff
- Line numbers are correctly tracked for old and new sides
- Empty string input returns empty array
- Malformed input does not throw (returns best-effort parse)
- `\ No newline at end of file` lines are skipped
- Function is pure with no side effects

### Test Coverage
- Unit test: single-hunk diff with adds, removes, and context lines
- Unit test: multi-hunk diff produces correct number of hunks
- Unit test: empty string → `[]`
- Unit test: diff with only additions (new file)
- Unit test: diff with only deletions
- Unit test: hunk header parsing extracts correct old/new start line numbers
- Unit test: `\ No newline at end of file` is handled
- Co-located test file: `src/lib/diff-parser.test.ts`

---

## Task 5: Create GET /api/files/diff endpoint

- **Status:** pending
- **Complexity:** medium
- **Dependencies:** Task 4
- **Related ADRs:** ADR-0002, ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006

### Description
Create `src/app/api/files/diff/route.ts` with a GET handler. Parameters: `slug` (project slug) and `path` (relative file path). The endpoint:
1. Resolves the project root via `resolveProjectPath(slug)`
2. Validates the path (same traversal protection as GET /api/files/content)
3. Runs `git diff <path>` via `execFile` in the project root
4. Returns `{ diff: string, hunks: DiffHunk[] }` (raw diff string + parsed hunks)
5. Returns `{ diff: "", hunks: [] }` for unmodified files (empty git diff output)
6. Returns 400 for missing params, 403 for path traversal, 500 for git errors

### Acceptance Criteria
- Endpoint returns diff data for a modified file
- Endpoint returns empty diff for unmodified files
- Path traversal attempts return 403
- Missing `slug` or `path` returns 400
- Git errors return 500 with error details
- Endpoint is auto-protected by auth middleware (ADR-0004)

### Test Coverage
- API test (`// @vitest-environment node`): missing params → 400
- API test: path traversal → 403
- API test: successful diff response structure validation (mock `execFile` and `resolveProjectPath`)
- API test: unmodified file → empty diff
- Co-located test file: `src/app/api/files/diff/route.test.ts`

---

## Task 6: Create DiffView component

- **Status:** pending
- **Complexity:** medium
- **Dependencies:** Task 4
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0006

### Description
Create `src/components/diff-view.tsx`. The component:
- Accepts `hunks: DiffHunk[]` as props
- Renders a unified diff view with:
  - Hunk headers styled as section dividers
  - Added lines with green background (CSS custom property `--diff-added-bg`)
  - Removed lines with red background (CSS custom property `--diff-removed-bg`)
  - Context lines with default background
  - Old and new line number gutters
  - Monospace font, same sizing as CodeView (13px)
- Shows "No changes" message when hunks are empty
- Add diff color CSS custom properties to `globals.css` for both dark and light themes

### Acceptance Criteria
- Added lines render with green-tinted background
- Removed lines render with red-tinted background
- Context lines render with no special background
- Line numbers display in both old and new gutters
- Hunk headers are visually distinct (e.g., blue/muted background)
- "No changes" state renders when hunks array is empty
- Colors use CSS custom properties (CORE-COMPONENT-0004 compliant)
- Monospace font and sizing matches CodeView

### Test Coverage
- Component test: render with sample hunks, verify added/removed/context line classes
- Component test: empty hunks → "No changes" message
- Component test: line numbers render correctly in both gutters
- Co-located test file: `src/components/diff-view.test.tsx`

---

## Task 7: Add Changes/File tabs to file viewer header

- **Status:** pending
- **Complexity:** small
- **Dependencies:** Task 1, Task 5, Task 6
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0007

### Description
Add a tab bar to the file viewer header that shows "File" and "Changes" tabs when the selected file has `status: "modified"` (or `"added"`). Use the `findFileStatus` helper from Task 1 to check status. The "File" tab shows CodeView/MarkdownView; "Changes" tab fetches diff from the API and shows DiffView. Tabs should only appear for files with git changes — for clean files, the viewer behaves as before.

### Acceptance Criteria
- Tabs appear only when selected file has `status: "modified"` or `"added"`
- "File" tab is selected by default
- Switching to "Changes" tab fetches diff from `/api/files/diff` and renders DiffView
- Tab state resets when switching files
- Tabs are styled consistently with the existing header bar (h-9, border-b, bg-card/50)
- Clean files show no tabs (unchanged behavior)

### Test Coverage
- Component test: tabs render for modified file status
- Component test: tabs do not render for clean file
- Component test: switching tabs changes displayed content

---

## Task 8: Create PUT /api/files/content endpoint

- **Status:** pending
- **Complexity:** medium
- **Dependencies:** Task 1
- **Related ADRs:** ADR-0002, ADR-0003, ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006

### Description
Add a PUT handler to `src/app/api/files/content/route.ts`. The handler:
1. Accepts JSON body: `{ slug, path, content }`
2. Validates params (400 for missing)
3. Path traversal protection (403) — same logic as GET
4. Rejects binary file writes (403)
5. Rejects content > 1MB (413)
6. Reads current file mtime; compares to `If-Unmodified-Since` header if present
7. If mtime is newer → 409 Conflict with `{ error: "File modified externally", mtime }`
8. Writes atomically: write to temp file in same directory, then `fs.rename` (per ADR-0003 pattern)
9. Returns `{ success: true, mtime: <new_mtime_epoch_ms>, size: <bytes> }`
10. Auto-protected by auth middleware (ADR-0004)

### Acceptance Criteria
- Successful write returns 200 with mtime and size
- Missing slug/path/content → 400
- Path traversal → 403
- Binary file path → 403
- Content > 1MB → 413
- Stale mtime (If-Unmodified-Since older than file mtime) → 409 with current mtime in response
- Write is atomic (temp file + rename)
- File content is correctly written and readable after save
- No If-Unmodified-Since header → skip conflict check (first save)

### Test Coverage
- API test (`// @vitest-environment node`): successful write, verify file content on disk
- API test: missing params → 400
- API test: path traversal → 403
- API test: content exceeding 1MB → 413
- API test: mtime conflict → 409
- API test: write without If-Unmodified-Since succeeds
- API test: GET still works after adding PUT (regression)
- Co-located test file: `src/app/api/files/content/route.test.ts`

---

## Task 9: Add edit mode to file viewer

- **Status:** pending
- **Complexity:** large
- **Dependencies:** Task 3, Task 7, Task 8
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0007

### Description
Add an edit mode to the file viewer for non-binary files:
- "Edit" button in header bar (Pencil icon from Phosphor)
- Clicking "Edit" replaces CodeView with a `<textarea>` pre-filled with file content
- Header shows "Save" and "Discard" buttons in edit mode (replacing Edit button)
- Track dirty state: compare textarea value to original content
- Visual indicator (dot on header) when content is modified
- Save: PUT to `/api/files/content` with `If-Unmodified-Since` set to mtime from last GET
- On save success: exit edit mode, reload file content, show success toast (Sonner)
- On save failure: show error toast via Sonner, keep textarea content (don't discard edits)
- On 409 conflict: show specific conflict message
- Discard: confirm if dirty, then reset to original content and exit edit mode
- Edit button hidden for binary files
- Edit mode disabled during save (loading state on Save button)

### Acceptance Criteria
- Edit button appears for non-binary files
- Edit button does not appear for binary files
- Textarea replaces code view in edit mode with monospace font
- Save sends PUT request with correct slug, path, content, and If-Unmodified-Since header
- Successful save exits edit mode, refreshes content, shows success toast
- Failed save shows Sonner error toast and preserves edited content
- 409 conflict shows specific conflict error message
- Discard with dirty content shows browser confirm dialog
- Discard with clean content exits immediately
- Dirty indicator (dot) visible when content differs from original
- Loading state disables Save/Discard buttons during save
- Edit/Save/Discard buttons have `aria-label` attributes

### Test Coverage
- Component test: edit button renders for text files, not for binary
- Component test: clicking edit shows textarea with file content
- Component test: save button triggers PUT request with correct headers
- Component test: discard resets content and exits edit mode
- Component test: dirty indicator appears when content modified
- Co-located test file: `src/components/file-viewer.test.tsx`

---

## Task 10: Update LLM.txt

- **Status:** pending
- **Complexity:** small
- **Dependencies:** Tasks 1–9
- **Related ADRs:** none
- **Related Core-Components:** CORE-COMPONENT-0006

### Description
Update `LLM.txt` to document all new and modified files:
- `src/lib/diff-parser.ts` — Unified diff parser utility
- `src/components/diff-view.tsx` — Diff view component for rendering unified diffs
- `src/app/api/files/diff/route.ts` — GET /api/files/diff endpoint
- Updated entry for `src/app/api/files/content/route.ts` noting PUT handler for file editing
- Updated entry for `src/components/file-viewer.tsx` noting markdown hljs, raw/preview toggle, changes/file tabs, edit mode

### Acceptance Criteria
- All new files listed in LLM.txt with accurate one-line descriptions
- Modified file entries updated to reflect new capabilities
- Entries ordered consistently with existing format
- File is valid and well-formed

### Test Coverage
- Manual verification: LLM.txt is well-formed and complete
