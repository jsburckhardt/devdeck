# Task Breakdown: Issue #60 - Live Split-Pane Markdown Editing

## Task T1: Add `.md`-only Live Edit entry point

- **Status:** Planned
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0008

### Description

Update `src/components/file-viewer.tsx` to add FileViewer-local Live Edit state and a toolbar
button visible only for selected files whose path ends with `.md`.

### Acceptance Criteria

- A "Live Edit" button appears in the FileViewer header for `.md` files.
- The button does not appear for `.mdx` files.
- The button does not appear for non-markdown files.
- Clicking the button enters Live Edit seeded from `fileContent.content`.
- Dirty Live Edit prompts before the selected file changes are accepted.
- Canceling the prompt restores the previous selection and preserves Live Edit content.
- Confirming the prompt accepts the new selection and resets Live Edit state.
- No new npm dependencies are added.

### Test Coverage

- Test Live Edit button visibility for `.md`.
- Test Live Edit button absence for `.mdx`.
- Test Live Edit button absence for non-markdown files.
- Existing edit/save tests continue to pass.
- Test dirty Live Edit file switching cancel/confirm behavior.

## Task T2: Render nested split-pane editor and read-only preview

- **Status:** Planned
- **Dependencies:** T1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0007

### Description

Render Live Edit content as a nested horizontal split pane inside FileViewer's content area. The
left pane contains the raw markdown editor. The right pane contains the rendered markdown preview.

### Acceptance Criteria

- Live Edit displays the raw markdown editor on the left.
- Live Edit displays rendered markdown preview on the right.
- The split defaults to approximately 50/50.
- The split is user-resizable.
- The preview is read-only and does not use `contenteditable`.
- The preview has an accessible region label, e.g. `aria-label="Markdown preview"`.
- Normal file/change tabs and raw/preview controls are hidden while editing.

### Test Coverage

- Test editor and preview render simultaneously in Live Edit.
- Test preview region exists with accessible label.
- Test preview content is not contenteditable.
- Add a `react-resizable-panels` test mock if jsdom requires it.

## Task T3: Add debounced live markdown preview updates

- **Status:** Planned
- **Dependencies:** T2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0006

### Description

Add debounced preview state derived from `editContent`. Initialize the preview immediately when
entering Live Edit, then update it about 300 ms after editor changes.

### Acceptance Criteria

- Preview is initialized from the file content immediately when Live Edit opens.
- Preview does not update immediately on every keystroke.
- Preview updates after approximately 300 ms.
- Debounce timers are cleaned up on Live Edit exit, file change, and component unmount.
- Mermaid/theme-aware markdown behavior continues to use the existing `MarkdownView`.

### Test Coverage

- Use Vitest fake timers to test debounce behavior.
- Test preview does not update before the debounce interval.
- Test preview updates after the debounce interval.
- Existing Mermaid markdown tests continue to pass.

## Task T4: Reuse save, discard, dirty, and conflict behavior in Live Edit

- **Status:** Planned
- **Dependencies:** T1, T2, T3
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0008

### Description

Treat Live Edit as an edit mode participant so existing dirty detection, save, discard, mtime
conflict handling, toast behavior, diff cache reset, and file-tree refresh behavior are reused.

### Acceptance Criteria

- Dirty indicator appears when Live Edit content differs from the original content.
- Save sends edited content to `PUT /api/files/content`.
- Save includes existing `mtime`.
- Save includes `activeWorktree` when active.
- Successful save exits Live Edit and returns to normal view.
- Successful save calls `refreshFileTree()` exactly once.
- Save failure preserves user edits.
- `409` conflict preserves Live Edit state and user edits.
- Discarding dirty Live Edit content prompts before losing changes.
- Switching files from dirty Live Edit prompts before losing changes.
- Confirming discard exits Live Edit.
- Cancelling discard keeps Live Edit open.

### Test Coverage

- Test dirty indicator in Live Edit.
- Test successful Live Edit save body and exit behavior.
- Test `refreshFileTree()` after successful Live Edit save.
- Test `409` conflict preserving editor content and Live Edit state.
- Test discard cancel/confirm behavior in Live Edit.
- Test switching files from dirty Live Edit: cancel preserves previous file/content; confirm accepts
  the new file and clears Live Edit.
- Existing save failure tests continue to pass.

## Task T5: Final regression and cleanup

- **Status:** Planned
- **Dependencies:** T1, T2, T3, T4
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0008

### Acceptance Criteria

- Existing file preview behavior remains unchanged outside Live Edit.
- Existing edit mode remains available for non-binary files.
- Existing raw/preview toggle remains available outside edit modes.
- Diff view behavior remains unchanged.
- No new npm dependencies are added to `package.json`.
- Lint, format check, build, and tests pass.

### Test Coverage

- Run FileViewer component tests.
- Run project verification commands.
