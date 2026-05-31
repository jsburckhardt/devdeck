# Action Plan: Issue #66

## Feature

- **Issue:** #66
- **Title:** fix(file-viewer): keep line-number gutter complete and aligned for wrapped code
- **Research brief:** `project/issues/66/research/00-research.md`
- **Scope type:** issue

## ADRs Created

None. This is an issue-scoped CSS/layout correction.

Relevant existing ADRs:

- ADR-0002: Next.js + xterm.js + node-pty Tech Stack

## Core-Components Created

None. The line-number gutter behavior is local to `CodeView`.

Relevant existing core-components:

- CORE-COMPONENT-0006: Development Standards
- CORE-COMPONENT-0007: Shell Layout
- CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State

## Implementation Tasks

1. Update `CodeView` layout in `src/components/file-viewer.tsx`.
   - Preserve the shared outer `overflow-auto` scroll container.
   - Add `min-w-max` to the inner flex row so gutter and code expand to content width.
   - Replace the shrinkable `<pre className="flex-1 px-4">` contract with explicit
     non-shrinking, no-wrap classes.

2. Add DOM/class contract coverage in `src/components/file-viewer.test.tsx`.
   - Use the existing mocked `<FileViewer />` fetch pattern.
   - Assert gutter entries map to logical source lines.
   - Assert the scroll row and `<pre>` expose the layout classes that prevent wrapping.
   - Assert empty or single-line content keeps one gutter row.

3. Run targeted and standard verification.
   - Run the FileViewer test suite.
   - Run lint, format check, build, and tests.
