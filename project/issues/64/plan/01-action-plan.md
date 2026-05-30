# Action Plan - Issue #64: Edit Markdown Directly in Rendered Preview

## Summary

Implement a markdown-only **Edit in Preview** mode that lets users edit inside the rendered markdown surface as a rich/enriched editing experience. This mode is separate from the existing raw edit mode and the issue #60 side-by-side Live Edit mode.

## Scope

- `scope_type`: `issue`
- ADR required: No
- Core-component required: No
- New dependencies: No

## Selected Approach

Use a single-pane `contentEditable` markdown preview with the existing preview styling and a local DOM-to-Markdown serializer. The editable preview remains visually rendered while user edits occur. Before save, serialize the edited DOM back to markdown and reuse the existing FileViewer save, discard, conflict, file-switch, and file-tree refresh behavior.

## UX Requirements

1. Show an **Edit in Preview** action only for non-binary `.md` files in normal file view.
2. Do not show **Edit in Preview** for `.mdx`, binary files, non-markdown files, or changes/diff view.
3. Keep existing raw **Edit** and side-by-side **Live Edit** available.
4. Entering **Edit in Preview** renders the markdown in the preview style and makes that surface editable.
5. Saving from **Edit in Preview** saves markdown source, not rendered HTML, Mermaid SVG, or Highlight.js markup.
6. Discard, conflict, dirty file switching, and save success behavior must match the existing edit flows.

## Implementation Notes

- Add distinct rich preview edit state to `FileViewer`.
- Reuse `MarkdownView` styling where possible, but avoid re-rendering over active user edits on each input.
- Track the editable preview root with a ref and synchronize serialized markdown into `editContent`.
- Extract a local serializer in `src/lib/markdown-dom-serializer.ts` to keep FileViewer readable and testable.
- Preserve Mermaid source via existing `data-mermaid-source` metadata rather than serializing generated SVG.
- Treat Highlight.js spans as text only.

## Verification Strategy

Use existing repository verification commands. Add targeted FileViewer tests and serializer unit tests covering rich edit visibility, edit/save/discard/conflict/file-switch behavior, and serialization safety.
