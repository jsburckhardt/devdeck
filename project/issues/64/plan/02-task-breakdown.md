# Task Breakdown - Issue #64

## Task 1 - Adding DOM-to-Markdown serialization

Implement a local serializer for the supported rendered markdown subset.

Acceptance criteria:

- Converts headings, paragraphs, emphasis, links, blockquotes, lists, task lists, code blocks, inline code, tables, horizontal rules, and images back to markdown.
- Serializes Mermaid containers from `data-mermaid-source` as fenced `mermaid` blocks.
- Serializes highlighted code as plain fenced code without highlight spans.
- Does not emit rendered SVG or raw Highlight.js markup.

Test coverage:

- Unit tests for common markdown nodes.
- Unit tests for Mermaid and highlighted code safety.

## Task 2 - Adding Edit in Preview FileViewer state

Add a rich preview edit state that is distinct from raw edit and side-by-side live edit.

Acceptance criteria:

- **Edit in Preview** is visible only for non-binary `.md` files in file view.
- `.mdx`, binary, non-markdown, and changes view do not expose the action.
- Entering the mode seeds edit state from the loaded file content.
- Existing raw edit and live edit actions still work.

Test coverage:

- Button visibility/absence tests.
- Mode-entry tests confirming the preview surface is editable and visually rendered.

## Task 3 - Integrating save, discard, conflict, and file-switch behavior

Wire rich preview edits into existing FileViewer edit lifecycle.

Acceptance criteria:

- Input inside the rendered preview marks the file dirty.
- Save serializes the editable DOM into markdown and calls the existing file content API.
- Successful save exits rich preview edit mode, refreshes the file tree, and updates loaded content.
- 409 conflicts keep rich preview edit mode active and preserve user edits.
- Discard and dirty file-switch prompts behave consistently with existing edit modes.

Test coverage:

- Save success.
- Conflict preservation.
- Clean and dirty discard.
- Dirty file switch cancel/confirm.

## Task 4 - Polishing editable preview UX

Add minimal styles and accessibility attributes for the editable rendered preview.

Acceptance criteria:

- Editable preview keeps the markdown preview visual styling.
- Focus is visible and keyboard editing works in the preview surface.
- The surface has an accessible label and textbox role.

Test coverage:

- Tests can query the rich edit surface by role/label.
