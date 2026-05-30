# Implementation Notes: Issue #60 - Live Split-Pane Markdown Editing

## Task T1: Add `.md`-only Live Edit entry point

- **Status:** Complete
- **Files Changed:** `src/components/file-viewer.tsx`, `src/components/file-viewer.test.tsx`
- **Tests Passed:** 56
- **Tests Failed:** 0

### Changes Summary
- Added FileViewer-local Live Edit state.
- Added a visible accessible `Live Edit` toolbar button for `.md` files only.
- Excluded `.mdx`, non-markdown paths, edit mode, and changes view from the Live Edit entry point.
- Reset Live Edit state on selected file and active worktree changes.

### Test Results
- `npm test -- src/components/file-viewer.test.tsx` passed.

### Notes
- No new npm dependencies were added.

## Task T2: Render nested split-pane editor and read-only preview

- **Status:** Complete
- **Files Changed:** `src/components/file-viewer.tsx`, `src/components/file-viewer.test.tsx`
- **Tests Passed:** 56
- **Tests Failed:** 0

### Changes Summary
- Added a nested `react-resizable-panels` horizontal `Group` for Live Edit.
- Reused the existing `EditView` textarea on the left and `MarkdownView` on the right.
- Added an accessible `aria-label="Markdown preview"` read-only preview region.

### Test Results
- `npm test -- src/components/file-viewer.test.tsx` passed.

### Notes
- Tests mock `react-resizable-panels` for jsdom rendering.

## Task T3: Add debounced live markdown preview updates

- **Status:** Complete
- **Files Changed:** `src/components/file-viewer.tsx`, `src/components/file-viewer.test.tsx`
- **Tests Passed:** 56
- **Tests Failed:** 0

### Changes Summary
- Added `livePreviewContent` state derived from `editContent`.
- Initialized the preview immediately when entering Live Edit.
- Debounced subsequent preview updates by 300 ms and cleaned timers through effect cleanup.

### Test Results
- `npm test -- src/components/file-viewer.test.tsx` passed, including fake-timer debounce tests.

### Notes
- Preview continues to use existing MarkdownView rendering, including Mermaid and theme behavior.

## Task T4: Reuse save, discard, dirty, and conflict behavior in Live Edit

- **Status:** Complete
- **Files Changed:** `src/components/file-viewer.tsx`, `src/components/file-viewer.test.tsx`
- **Tests Passed:** 56
- **Tests Failed:** 0

### Changes Summary
- Live Edit participates in the existing edit/save/discard state path.
- Dirty indicator, PUT body content/mtime/worktree, toast behavior, conflict handling, and file-tree refresh were reused.
- Successful save exits Live Edit; 409 conflicts preserve Live Edit and user edits.
- Dirty discard cancel keeps Live Edit open; confirm exits.

### Test Results
- `npm test -- src/components/file-viewer.test.tsx` passed.

### Notes
- `refreshFileTree()` is called only on successful save.

## Task T5: Final regression and cleanup

- **Status:** Complete with noted build environment issue
- **Files Changed:** `src/components/file-viewer.tsx`, `src/components/file-viewer.test.tsx`
- **Tests Passed:** 56
- **Tests Failed:** 0

### Changes Summary
- Existing preview, raw toggle, regular edit, diff, Mermaid, Excalidraw, and worktree behaviors were preserved by the FileViewer regression suite.
- Changed files were formatted with Prettier.

### Test Results
- `npm test -- src/components/file-viewer.test.tsx`: passed, 56/56 tests.
- `npm run lint`: passed with existing warnings only.
- `npm run format:check`: passed after formatting.
- `npm run build`: failed before compiling due to Next/Turbopack workspace-root inference in this worktree: Next could not resolve `next/package.json` from `src/app` and requested `turbopack.root` configuration.

### Notes
- No ADR or core-component deviation was required.

## Verification Follow-up: Unsaved Live Edit file-switch prompt

- **Status:** Complete
- **Files Changed:** `src/components/file-viewer.tsx`, `src/components/file-viewer.test.tsx`
- **Tests Passed:** 58
- **Tests Failed:** 0

### Changes Summary
- Added selection acceptance tracking in `FileViewer` so dirty Live Edit file switches call `window.confirm("Discard unsaved changes?")` before resetting edit state.
- Canceling the prompt restores the last accepted selected file via `selectFile(previousSelectedFile)` and preserves Live Edit editor content/state.
- Confirming the prompt accepts the new selection and resets FileViewer edit/Live Edit state as before.
- Added regression tests for cancel and confirm file-switch paths.

### Test Results
- `npm test -- src/components/file-viewer.test.tsx`: passed, 58/58 tests.

### Notes
- No new dependencies were added.
- No ADR or core-component changes were made.

## Verification Follow-up: Worktree-aware Live Edit selection prompt

- **Status:** Complete
- **Files Changed:** `src/components/file-viewer.tsx`, `src/components/file-viewer.test.tsx`
- **Tests Passed:** 59
- **Tests Failed:** 0

### Changes Summary
- Removed the dead blocked-selection tracking ref from `FileViewer`.
- Treat selected-file and active-worktree changes as selection changes that prompt before discarding dirty Live Edit content.
- Canceling the prompt restores whichever selected file and/or active worktree changed while preserving Live Edit content/state.
- Confirming the prompt accepts the new file/worktree and resets edit state as before.
- Added a focused active-worktree cancel regression test.

### Test Results
- `npm test -- src/components/file-viewer.test.tsx`: passed, 59/59 tests.

### Notes
- No new dependencies were added.
- No ADR or core-component changes were made.

## Verification Follow-up: Lint cleanup for Live Edit selection guard

- **Status:** Complete
- **Files Changed:** `src/components/file-viewer.tsx`
- **Tests Passed:** 59
- **Tests Failed:** 0

### Changes Summary
- Removed the obsolete Live Edit selection guard ref synchronization while keeping dirty selection prompt behavior in the selection-reset effect.
- Added a scoped `react-hooks/set-state-in-effect` disable/enable around the established selection-reset state block.

### Test Results
- `npm run lint -- src/components/file-viewer.tsx src/components/file-viewer.test.tsx`: passed.
- `npm test -- src/components/file-viewer.test.tsx`: passed, 59/59 tests.

### Notes
- No behavior changes intended. Dirty Live Edit file/worktree switching prompts remain intact.

## Verification Follow-up: Remove obsolete Live Edit selection guard ref

- **Status:** Complete
- **Files Changed:** `src/components/file-viewer.tsx`, `project/issues/60/implementation/README.md`
- **Tests Passed:** 59
- **Tests Failed:** 0

### Changes Summary
- Removed the unused `liveEditSelectionGuardRef` and synchronization effect from `FileViewer`.
- Preserved dirty Live Edit file/worktree switching confirmation in the existing selection-reset effect.
- Updated implementation notes to describe the ref removal.

### Test Results
- `npm run lint -- src/components/file-viewer.tsx src/components/file-viewer.test.tsx`: passed.
- `npm test -- src/components/file-viewer.test.tsx`: passed, 59/59 tests.

### Notes
- No ADR or core-component changes were made.
