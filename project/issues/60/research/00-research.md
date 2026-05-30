# Research Brief - Issue #60: Live Split-Pane Markdown Editing

## Meta

| Field | Value |
|---|---|
| Issue | GitHub Issue #60 |
| scope_type | `issue` |
| ADRs required | No |
| Core-components required | No |
| Date | 2026-05-30 |

## Problem Statement

DevDeck's file viewer currently separates markdown preview and markdown editing. Issue #60
requests a `.md`-only Live Edit mode that shows the raw markdown editor on the left and a
read-only rendered markdown preview on the right, with preview updates debounced at about 300 ms.
The feature must reuse the existing save flow, markdown rendering stack, and
`react-resizable-panels` dependency without introducing new npm packages.

## Scope Classification

`issue`

The requested work is a self-contained file-viewer enhancement. Existing ADRs and
core-components already cover the relevant architecture:

- ADR-0002 establishes Next.js, React, TypeScript, Vitest, and the UI stack.
- CORE-COMPONENT-0007 establishes `react-resizable-panels` for panel layout.
- CORE-COMPONENT-0008 decision records already cover file viewer save and refresh behavior.
- CORE-COMPONENT-0004 already covers third-party renderer theming, including Mermaid.

No new architectural decision or reusable cross-cutting component is required.

## Existing Implementation Findings

### File viewer

`src/components/file-viewer.tsx` contains all relevant behavior:

- `MarkdownView` renders markdown using `marked`, `DOMPurify`, `highlight.js`, and Mermaid
  post-processing.
- `EditView` is a controlled textarea with `aria-label="File editor"`.
- `editMode`, `editContent`, and `originalContent` already support dirty detection.
- `handleEdit` seeds editable state from `fileContent.content`.
- `handleDiscard` prompts when `isDirty`.
- `handleSave` writes to `PUT /api/files/content`, includes `mtime`, handles `409`, updates
  local file content, clears edit state, resets diff cache, shows toast notifications, and calls
  `refreshFileTree()` only after a successful save.
- State resets when `selectedFile` or `activeWorktree` changes.
- The header toolbar is the right place to add a Live Edit toggle.
- The animated content key currently includes `selectedFile`, `viewMode`, and `editMode`; Live
  Edit state should be included so transitions remain deterministic.

### Markdown extension detection

`src/lib/file-utils.ts` maps both `md` and `mdx` to `language: "markdown"`. Live Edit must not
rely on `fileContent.language === "markdown"` alone, because that would enable Live Edit for
`.mdx`. It should additionally check the selected path, e.g. `selectedFile.endsWith(".md")`.

### Layout

`react-resizable-panels` is already a production dependency. `WorkspaceLayout` uses
`Group`, `Panel`, and `Separator` for the outer workspace split. The Live Edit layout should be a
nested `Group orientation="horizontal"` inside the FileViewer content area, with left and right
panes defaulting to a 50/50 split.

### Tests

`src/components/file-viewer.test.tsx` already mocks `sonner`, `workspace-context`,
`DiffView`, `theme-provider`, `mermaid`, `framer-motion`, `next/dynamic`, and Excalidraw.
The test suite exercises existing file loading, markdown preview, edit/save/discard, diff, and
worktree request behavior. New tests should be co-located in this file.

## Constraints

| Constraint | Source |
|---|---|
| Live Edit button appears for `.md` files only | Issue acceptance criteria |
| `.mdx` and non-markdown files do not show Live Edit | Issue acceptance criteria |
| Preview stays read-only; no `contenteditable` | Issue acceptance criteria |
| No new npm dependencies | Issue acceptance criteria |
| Preview updates after a ~300 ms debounce | Issue acceptance criteria |
| Save flow reuses existing `handleSave` logic and conflict handling | Issue acceptance criteria |
| Unsaved changes prompt before exiting Live Edit or switching files | Issue acceptance criteria |
| Split ratio is user-adjustable via `react-resizable-panels` separator | Issue acceptance criteria |
| Existing file viewer behaviors must remain intact | Regression risk |

## Plan Handoff

Recommended implementation shape:

1. Add Live Edit state alongside existing edit state, or convert edit state to a small mode enum.
   A mode enum is cleaner, but a separate `liveEditMode` boolean is the smallest safe change.
2. Treat Live Edit as an edit mode for dirty detection and save/discard controls.
3. Keep `editContent` as the single source of truth.
4. Add debounced preview state derived from `editContent`, initialized immediately when entering
   Live Edit.
5. Add an inner `Group orientation="horizontal"` with two `Panel`s and a `Separator`.
6. Reuse `EditView` in the left pane and `MarkdownView` in the right pane.
7. Add a preview region wrapper with `role="region"` and `aria-label="Markdown preview"`.
8. Hide normal file/change tabs and raw-preview controls while editing.
9. Prompt before abandoning dirty Live Edit content when the selected file changes; canceling the
   prompt should preserve Live Edit and restore the previous selection.
10. Reset Live Edit state after confirmed file/worktree changes.

## Test Handoff

Add coverage for:

- Live Edit toggle visibility for `.md`.
- Live Edit toggle absence for `.mdx`.
- Live Edit toggle absence for non-markdown files.
- Entering Live Edit shows editor and preview simultaneously.
- Preview content does not update before the debounce elapses.
- Preview content updates after the debounce elapses.
- Dirty indicator appears after live editing.
- Save in Live Edit sends the edited content, shows success, refreshes the file tree, and exits
  edit state.
- `409` conflict in Live Edit preserves the edit state and user content.
- Discard in Live Edit prompts when dirty and respects cancel/confirm.
- Dirty Live Edit prompts when switching files; canceling keeps the editor open and preserves
  content.

The test file may need a lightweight `react-resizable-panels` mock if jsdom cannot support the
real components.

## Files Expected to Change

| File | Expected changes |
|---|---|
| `src/components/file-viewer.tsx` | Live Edit state, toolbar button, debounced preview, nested split pane, state reset wiring |
| `src/components/file-viewer.test.tsx` | Live Edit tests and any required panel mock |

No API routes, workspace context contracts, ADRs, or core-component documents are expected to
change.
