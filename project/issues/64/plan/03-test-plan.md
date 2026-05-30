# Test Plan - Issue #64

## Automated Tests

Run the existing project checks after implementation:

- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm test`

## Targeted Unit Tests

### Serializer tests

- Headings and paragraphs serialize to markdown.
- Bold, italic, links, inline code, and images serialize to markdown.
- Ordered, unordered, and task lists serialize to markdown.
- Blockquotes, tables, horizontal rules, and fenced code serialize to markdown.
- Mermaid preview containers serialize from `data-mermaid-source`.
- Highlighted code blocks serialize text content only and never persist `<span>` markup.

### FileViewer tests

- **Edit in Preview** appears for `.md` files.
- **Edit in Preview** does not appear for `.mdx`, binary files, non-markdown files, or changes view.
- Entering rich preview edit mode shows an editable rendered markdown surface.
- Editing the surface marks the file dirty.
- Saving sends markdown to `/api/files/content`, exits the mode, and refreshes the file tree.
- Conflict responses keep the rich edit mode active with user edits preserved.
- Clean discard exits without confirmation.
- Dirty discard prompts; cancel keeps editing and confirm exits.
- Dirty file switching prompts; cancel keeps the current file and confirm switches.

## Manual UX Checks

- Open a markdown file and verify preview, raw edit, live edit, and edit-in-preview are distinct actions.
- In edit-in-preview mode, edit rendered text, headings, lists, code, and a Mermaid block.
- Save and reopen the file to confirm the persisted source remains markdown.
