# Test Plan: Issue #60 - Live Split-Pane Markdown Editing

## TP1: `.md` files show Live Edit

- **Type:** Component
- **Task:** T1
- **Priority:** High

Render `FileViewer` with `selectedFile: "README.md"` and markdown file content. The Live Edit
button is present and accessible.

## TP2: `.mdx` files do not show Live Edit

- **Type:** Component
- **Task:** T1
- **Priority:** High

Render `FileViewer` with `selectedFile: "README.mdx"` and `language: "markdown"`. The Live Edit
button is not present.

## TP3: Non-markdown files do not show Live Edit

- **Type:** Component
- **Task:** T1
- **Priority:** High

Render `FileViewer` with `selectedFile: "src/index.ts"` and TypeScript content. The Live Edit
button is not present.

## TP4: Entering Live Edit shows editor and preview together

- **Type:** Component
- **Task:** T2
- **Priority:** High

Click Live Edit for a `.md` file. The raw editor and rendered markdown preview are both visible.

## TP5: Preview is read-only

- **Type:** Component
- **Task:** T2
- **Priority:** High

Enter Live Edit and inspect the markdown preview region. The preview does not expose
`contenteditable="true"`.

## TP6: Preview does not update before debounce

- **Type:** Component
- **Task:** T3
- **Priority:** High

Use Vitest fake timers. Enter Live Edit, edit content, advance timers by less than 300 ms, and
confirm the preview still shows the previous rendered markdown.

## TP7: Preview updates after debounce

- **Type:** Component
- **Task:** T3
- **Priority:** High

Use Vitest fake timers. Enter Live Edit, edit content, advance timers by about 300 ms, and confirm
the preview updates to the edited rendered markdown.

## TP8: Dirty indicator appears in Live Edit

- **Type:** Component
- **Task:** T4
- **Priority:** High

Enter Live Edit and type into the editor. The dirty indicator appears.

## TP9: Live Edit save reuses existing save flow

- **Type:** Component
- **Task:** T4
- **Priority:** High

Mock initial content GET and successful content PUT. Edit content in Live Edit and save. The PUT
body includes edited content, `mtime`, `slug`, `path`, and `worktree` when active. A success toast
is shown, `refreshFileTree()` is called once, and Live Edit exits.

## TP10: Live Edit conflict preserves edits

- **Type:** Component
- **Task:** T4
- **Priority:** High

Mock initial content GET and a `409` content PUT response. Save from Live Edit. The conflict toast
appears, Live Edit remains open, and the edited text remains in the editor.

## TP11: Discard cancel keeps Live Edit open

- **Type:** Component
- **Task:** T4
- **Priority:** Medium

Mock `window.confirm` to return `false`. Enter Live Edit, modify content, and click Discard. The
confirmation prompt appears and Live Edit remains open.

## TP12: Discard confirm exits Live Edit

- **Type:** Component
- **Task:** T4
- **Priority:** Medium

Mock `window.confirm` to return `true`. Enter Live Edit, modify content, and click Discard. Live
Edit exits and normal file view returns.

## TP13: Existing FileViewer behavior remains intact

- **Type:** Regression
- **Task:** T5
- **Priority:** High

Run existing FileViewer tests and project verification commands. Existing markdown preview, raw
toggle, edit mode, save failure, conflict, diff, Mermaid, and worktree request tests continue to
pass.

## TP14: Dirty Live Edit prompts before switching files

- **Type:** Component
- **Task:** T1, T4
- **Priority:** High

Enter Live Edit for `README.md`, modify the editor, then simulate selecting `docs/next.md`.
Canceling the prompt keeps Live Edit open with the previous content and restores `README.md`.
Confirming the prompt accepts `docs/next.md` and clears Live Edit state.
