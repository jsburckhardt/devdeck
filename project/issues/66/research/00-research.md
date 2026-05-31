# Research Brief - Issue #66

## Metadata

- **Issue:** #66
- **Title:** fix(file-viewer): keep line-number gutter complete and aligned for wrapped code
- **Scope type:** issue
- **Status:** Ready for Plan

## Problem summary

The `CodeView` sub-component in `src/components/file-viewer.tsx` renders line
numbers in a gutter beside a separate `<pre>` element for highlighted code. When
the file viewer panel becomes narrow, long code lines can visually wrap inside
the flex layout. The gutter still renders exactly one `<div>` for each logical
source line, so wrapped visual rows do not receive corresponding gutter entries
and line numbers become misaligned.

The expected behavior is that code never visually wraps. Long lines should
scroll horizontally, with the line-number gutter and code content sharing the
same scrollable row so they stay aligned.

## Relevant files and behavior

- `src/components/file-viewer.tsx`
  - `CodeView` computes `lineCount` from the raw file content.
  - The current layout uses an outer `overflow-auto` wrapper, an inner `flex`
    row, a gutter column, and `<pre className="flex-1 px-4">`.
  - The inner row does not declare a content-sized minimum width.
  - The `<pre>` can shrink in the flex row and does not explicitly declare the
    no-wrap contract.
- `src/components/file-viewer.test.tsx`
  - Existing tests exercise `FileViewer` through mocked `fetch` responses.
  - `CodeView` is internal, so new coverage should continue testing through
    `<FileViewer />` rather than exporting implementation details.
- `src/app/globals.css`
  - Highlight.js and markdown preview styles are present, but no global style
    appears to intentionally control `CodeView` wrapping behavior.

## Root cause

The layout relies on the `<pre>` default `white-space: pre` behavior while also
placing the `<pre>` in a shrinkable flex item (`flex-1`). In narrow panels, the
flex row is constrained to the panel width instead of expanding to the code
content width. The fix should make the scrollable row content-sized and make the
no-wrap behavior explicit on the code block.

## ADR and core-component assessment

No ADR is required. This is a local CSS/layout correction and does not change an
architectural boundary, persistence model, integration contract, or technology
selection.

No core-component is required. The gutter behavior is local to `CodeView` and is
not a reusable cross-cutting concern.

Existing documents relevant to planning:

- `CORE-COMPONENT-0006-development-standards.md` for colocated tests and
  verification expectations.
- `CORE-COMPONENT-0007-shell-layout.md` for preserving shell/panel scrolling
  behavior.

No `DECISION-LOG.md` update is required for this issue-scoped fix.

## Implementation considerations

Recommended plan:

1. Keep the existing shared outer `overflow-auto` scroll container.
2. Add `min-w-max` to the inner `flex` row so the gutter and code row expand to
   content width and scroll together horizontally.
3. Replace the shrinkable `<pre className="flex-1 px-4">` behavior with an
   explicit no-wrap contract, e.g. `flex-shrink-0 whitespace-pre px-4`.
4. Add tests that assert the structural CSS contract instead of relying on
   jsdom pixel layout, since jsdom does not accurately compute flex wrapping.

## Test focus

Add coverage in `src/components/file-viewer.test.tsx` using the existing mocked
`fetch` pattern:

- Multi-line content renders one gutter entry per logical line.
- The scroll row has the class that preserves content width.
- The `<pre>` has an explicit no-wrap class.
- Empty or single-line content keeps the existing one-line gutter behavior.

## Open questions and blockers

None.
