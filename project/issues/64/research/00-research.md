# Research Brief - Issue #64: Edit Markdown Directly in Rendered Preview

## Meta

| Field | Value |
|---|---|
| Issue | GitHub Issue #64 |
| scope_type | `issue` |
| ADRs required | Conditionally: only if the planner selects a new dependency for rich editing or HTML-to-Markdown serialization |
| Core-components required | No |
| Date | 2026-05-30 |

## Problem Statement

DevDeck already renders `.md` files as styled HTML through `MarkdownView` and, since issue #60, offers a split-pane "Live Edit" mode with raw markdown on the left and rendered preview on the right. Issue #64 asks for a different experience: a single-pane, rich edit-in-preview mode where the rendered preview surface itself becomes editable. The user clarified that this should be "enrich" editing: edit the markdown as it looks in preview view, not side by side.

The existing raw editor and split-pane live editor should remain available. This issue adds a markdown-only "Edit in Preview" path that preserves the visual preview styling while editing.

## Scope Classification

`issue`

The feature is localized to the FileViewer markdown editing surface and tests. Existing architecture already covers the stack, theming, markdown rendering, file saves, conflict handling, and refresh behavior. A new core-component is not required.

If the planner chooses a rich editor dependency or a third-party HTML-to-Markdown serializer, an ADR amending the current tech-stack decision is required before implementation. If the planner chooses a no-new-dependency implementation, no ADR is required.

## Existing Implementation Findings

### Issue #60 Split-Pane Live Edit

`src/components/file-viewer.tsx` already includes:

- `liveEditMode` and `livePreviewContent` state.
- `handleLiveEdit`, which enters edit mode, sets live edit, and seeds `editContent` and preview content from `fileContent.content`.
- `LiveEditView`, a horizontal `react-resizable-panels` split with raw `EditView` on the left and read-only `MarkdownView` on the right.
- A debounce effect that updates live preview content after `editContent` changes.
- `canLiveEdit`, guarded to `.md` files and non-binary content; `.mdx` remains excluded.
- Existing save, discard, file-switch guard, conflict, toast, and file-tree refresh behavior.

The #60 UX is explicitly side-by-side. Issue #64 must add a separate single-pane, edit-in-preview mode rather than replacing the preview pane in the existing split flow.

### Current FileViewer Modes

The content area currently prioritizes:

| Priority | Branch | Condition |
|---|---|---|
| 1 | `LiveEditView` | `liveEditMode === true` |
| 2 | raw `EditView` | `editMode === true && !liveEditMode` |
| 3 | diff loading / `DiffView` | `viewMode === "changes"` |
| 4 | `BinaryFileView` | `fileContent.isBinary` |
| 5 | `ExcalidrawView`, `MarkdownView`, or `CodeView` | normal preview/raw view |

Issue #64 should add a rich edit-in-preview branch that takes precedence over raw edit mode while active.

### Markdown Rendering

`MarkdownView` parses markdown with `marked`, sanitizes with `DOMPurify`, highlights code with `highlight.js`, and post-processes Mermaid fenced blocks into rendered SVG. The original Mermaid source is preserved in a `data-mermaid-source` attribute before SVG rendering.

Critical implication: rendered preview HTML is a transformed representation of the markdown source. True WYSIWYG editing needs a way to convert edited DOM back to markdown. Code highlighting spans, Mermaid SVG output, tables, task lists, and inline formatting all require deliberate handling.

### Save, Discard, Conflict, and Worktree Behavior

`handleSave` sends `editContent` to `PUT /api/files/content` with `mtime`, preserves edit state on 409 conflicts, resets edit state on success, clears diff cache, calls `refreshFileTree()`, and displays success/error toasts. New rich editing must reuse this contract rather than introducing a parallel save path.

Any rich edit mode must keep the markdown string that will be saved synchronized into `editContent` before save. Worktree-aware save behavior should not need API changes.

### Styling and Theming

`src/app/globals.css` defines `.markdown-preview` typography, code, table, task list, and Mermaid styling. The user requirement is visual fidelity while editing, so the editable surface should retain `.markdown-preview` styling and app theme behavior.

## Candidate Implementation Approaches

### Option A - Transparent Textarea Overlay

Render the normal preview and overlay a transparent controlled `<textarea>` containing markdown. This avoids serialization and new dependencies, but it is not true rich editing: caret position, selection, and copy/paste expose raw markdown and do not align reliably with rendered content. This does not satisfy the user's "edit as it looks in preview" requirement well enough.

### Option B - `contenteditable` Preview + Local Markdown Serializer

Render the preview as the editable surface using `contentEditable`, normalize special blocks where needed, and serialize the edited DOM back to markdown before save.

Pros:

- Best match for the user's "rich/enrich editing inside preview" request without a new dependency.
- Reuses existing preview styling and save/discard/conflict flow.
- Keeps the change scoped to FileViewer and a local serializer utility.

Cons:

- DOM-to-Markdown serialization must be covered carefully.
- `contenteditable` behavior differs across browsers.
- jsdom test support is limited, so tests should use `fireEvent.input` and controlled DOM mutation where necessary.
- Pasted HTML must not bypass the existing sanitized re-render path.

This is the recommended no-new-dependency implementation path.

### Option C - Rich Markdown Editor Library

Adopt a ProseMirror-style editor such as Milkdown or Tiptap. This provides the strongest WYSIWYG editing behavior, but it adds a significant dependency and bundle-size risk. Given existing tech-stack precedent against heavyweight editor dependencies, this requires an ADR before implementation and is not recommended for this issue unless the team explicitly approves the dependency tradeoff.

## Architectural Relevance

| Approach | ADR Required? |
|---|---|
| Transparent textarea overlay | No |
| `contenteditable` + local serializer | No |
| `contenteditable` + third-party serializer | Yes |
| Rich editor library | Yes |

No new core-component is needed. The implementation must preserve the FileViewer save/refresh contract and theming expectations.

## Recommended Planner Inputs

1. Select Option B: a no-new-dependency, `contenteditable` edit-in-preview mode with a local serializer.
2. Add a toolbar action such as "Edit in Preview" or "Rich Edit" shown only when `canLiveEdit && !editMode && viewMode === "file"`.
3. Add explicit rich edit state distinct from `liveEditMode`.
4. Entering rich edit should seed `editContent` and `originalContent` from `fileContent.content`, set `editMode`, and make the rendered markdown surface editable.
5. Save should serialize the current editable preview DOM to markdown, place it in `editContent`, and then reuse the existing save flow.
6. Discard, dirty guards, file-switch prompts, conflict handling, and successful save reset should treat rich edit mode as an edit mode.
7. Mermaid and highlighted code blocks need a safe editing representation or serializer handling so saves do not persist rendered SVG or highlight markup.
8. `.mdx`, binary files, non-markdown files, and the changes/diff view should not show the rich edit action.

## Test Handoff

Add tests in `src/components/file-viewer.test.tsx` for:

- "Edit in Preview" visibility for `.md` files.
- Absence for `.mdx`, non-markdown, binary, and already-editing states.
- Entering rich edit keeps the markdown visually rendered and editable.
- Editing inside the preview marks the file dirty.
- Saving rich edits sends markdown to `PUT /api/files/content`, shows success, refreshes the file tree once, and exits edit state.
- 409 conflict preserves rich edit state and user edits.
- Discard from clean rich edit exits without confirmation.
- Discard from dirty rich edit prompts; cancel keeps editing; confirm exits.
- Dirty file-switch prompt preserves or discards rich edit content according to user choice.
- Mermaid/code block handling does not save rendered SVG or highlight spans as markdown content.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| HTML-to-Markdown fidelity loss | High | Scope serializer to supported GFM subset and add focused unit coverage |
| `contenteditable` browser inconsistencies | Medium | Keep behavior minimal, avoid complex keyboard transforms, and test common interactions |
| Pasted external HTML | Medium | Serialize to markdown and rely on sanitized markdown render path after save/preview |
| Mermaid SVG round-trip | Medium | Preserve fenced source from `data-mermaid-source` rather than serializing SVG |
| jsdom limitations | Low | Use DOM mutation plus `fireEvent.input` in unit tests |

## Affected Files

| File | Expected changes |
|---|---|
| `src/components/file-viewer.tsx` | Rich edit state, toolbar action, editable preview branch, save/discard integration |
| `src/lib/md-serializer.ts` | Local DOM-to-Markdown serializer if extracted |
| `src/components/file-viewer.test.tsx` | Rich edit-in-preview tests |
| `src/app/globals.css` | Optional focus/caret styles for editable markdown preview |
