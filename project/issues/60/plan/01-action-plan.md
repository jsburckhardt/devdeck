# Action Plan: Live Split-Pane Markdown Editing

## Feature

- **Issue:** #60
- **Research Brief:** `project/issues/60/research/00-research.md`
- **scope_type:** `issue`

## ADRs Created

None.

Research classifies this as issue scope. Existing architecture already covers the required stack
and behavior:

- ADR-0002: Next.js, React, TypeScript, Vitest, Tailwind, and `react-resizable-panels`.
- CORE-COMPONENT-0004: app-theme-aware third-party renderers including Mermaid.
- CORE-COMPONENT-0006: TypeScript, testing, and development standards.
- CORE-COMPONENT-0007: `react-resizable-panels` layout conventions.
- CORE-COMPONENT-0008: FileViewer save, refresh, and worktree-aware file API behavior.

## Core-Components Created

None.

## Chosen Approach

Implement Live Edit as a FileViewer-local enhancement, not as a global editor system. Keep
`editContent` as the single source of truth, reuse `MarkdownView` for rendered preview, reuse
`EditView` for raw markdown input, and reuse existing save/discard/conflict behavior.

Live Edit eligibility must be based on the selected path ending in `.md`, not only
`fileContent.language === "markdown"`, because `.mdx` also maps to markdown in
`src/lib/file-utils.ts`.

No npm dependencies should be added. The nested split should use the existing
`react-resizable-panels` dependency.

## Implementation Tasks

1. Add `.md`-only Live Edit mode state and toolbar toggle in `src/components/file-viewer.tsx`.
2. Render nested split-pane Live Edit UI using the existing editor and markdown preview components.
3. Add debounced markdown preview state that updates about 300 ms after editor changes.
4. Reuse existing save/discard/conflict flow for Live Edit and ensure clean exit behavior,
   including a dirty-content prompt before switching files.
5. Add component tests in `src/components/file-viewer.test.tsx` for visibility, debounce, dirty
   state, save/conflict flow, discard, and `.mdx` exclusion.
