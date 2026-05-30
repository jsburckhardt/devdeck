# Implementation Notes: Issue #64 - Edit Markdown Directly in Rendered Preview

## Task 1: Adding DOM-to-Markdown serialization

- **Status:** Complete
- **Files Changed:** `src/lib/markdown-dom-serializer.ts`, `src/lib/markdown-dom-serializer.test.ts`
- **Tests Passed:** 6
- **Tests Failed:** 0

### Changes Summary
- Added a local DOM-to-Markdown serializer for headings, paragraphs, inline formatting, links, images, lists, task lists, blockquotes, tables, horizontal rules, fenced code, Mermaid blocks, and highlighted code.
- Mermaid blocks serialize from `data-mermaid-source`; highlighted code serializes text content only.

### Test Results
- `npm test -- src/lib/markdown-dom-serializer.test.ts`: passed, 6/6 tests.

### Notes
- No new npm dependencies were added.

## Task 2: Adding Edit in Preview FileViewer state

- **Status:** Complete
- **Files Changed:** `src/components/file-viewer.tsx`, `src/components/file-viewer.test.tsx`
- **Tests Passed:** 67
- **Tests Failed:** 0

### Changes Summary
- Added a distinct rich preview edit mode for non-binary `.md` files in normal file view.
- Preserved existing raw Edit and split-pane Live Edit actions.
- Added an accessible single-pane `contentEditable` markdown preview surface.

### Test Results
- `npm test -- src/components/file-viewer.test.tsx`: passed, 67/67 tests.

### Notes
- `.mdx`, binary files, non-markdown files, and changes view do not expose Edit in Preview.

## Task 3: Integrating save, discard, conflict, and file-switch behavior

- **Status:** Complete
- **Files Changed:** `src/components/file-viewer.tsx`, `src/components/file-viewer.test.tsx`
- **Tests Passed:** 67
- **Tests Failed:** 0

### Changes Summary
- Rich preview input updates existing edit dirty state.
- Save serializes the editable DOM to markdown immediately before PUT.
- Save success exits rich edit, updates content, clears diff cache, and refreshes the file tree.
- 409 conflicts preserve rich edit state and user-edited DOM content.
- Discard and dirty file-switch prompts reuse the established edit lifecycle.

### Test Results
- `npm test -- src/components/file-viewer.test.tsx`: passed, 67/67 tests.

### Notes
- API save payloads contain markdown source, not HTML, Mermaid SVG, or Highlight.js spans.

## Task 4: Polishing editable preview UX

- **Status:** Complete
- **Files Changed:** `src/app/globals.css`, `src/components/file-viewer.tsx`, `src/components/file-viewer.test.tsx`
- **Tests Passed:** 73
- **Tests Failed:** 0

### Changes Summary
- Added minimal focus styling for the editable markdown preview using theme tokens.
- Added `role="textbox"`, `aria-label="Editable markdown preview"`, and `aria-multiline="true"`.

### Test Results
- `npm test -- src/lib/markdown-dom-serializer.test.ts src/components/file-viewer.test.tsx`: passed, 73/73 tests.
- `npm run lint`: passed with one pre-existing warning in `src/server/terminal-server.test.ts`.
- `npm run format:check`: passed.
- `npm run build`: passed with existing Next/Turbopack warnings.
- `npm test`: passed.

### Notes
- No ADR or core-component changes were required.
