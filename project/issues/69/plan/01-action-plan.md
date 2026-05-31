# Action Plan: Issue #69

## Feature

- **ID:** 69
- **Title:** fix(layout): terminal does not expand after disabling file preview then explorer
- **Research Brief:** project/issues/69/research/00-research.md
- **scope_type:** issue

## ADRs Created

None.

## Core-Components Updated

- CORE-COMPONENT-0007 Shell Layout
  - Clarify that a single remaining visible workspace panel must resize to full width after visibility, project, or active worktree changes.
  - Preserve multi-panel user-resized proportions; normalization must not reset two- or three-panel layouts unnecessarily.
- CORE-COMPONENT-0008 Multi-Project Tabs and Workspace State
  - Clarify that invalid cached all-hidden workspace visibility is restored as Terminal visible before first render.
- DECISION-LOG.md
  - Add decisions for single-panel layout normalization and invalid all-hidden workspace restoration.

## Implementation Tasks

1. Normalize restored/cached workspace visibility so all-hidden state becomes Terminal-only while valid cached states remain unchanged.
2. Normalize `WorkspaceLayout` only when exactly one panel is visible by resizing that panel to `100%` after collapse/expand effects.
3. Preserve pairwise separator visibility, including Explorer + Terminal adjacency while File Preview is collapsed.
4. Expand unit tests for all order-independent two-step transitions that leave one visible panel, cached-state safety, mounted-hidden panels, separator behavior, last-panel guard, rapid toggles, and project/worktree single-panel normalization.
5. Add browser geometry regression coverage proving Terminal occupies full workspace width after both reported toggle paths.
6. Run configured verification plus targeted Playwright coverage.

## Verification Commands

```sh
npm run lint
npm run format:check
npm run build
npm run test
npx playwright test e2e/workspace-layout.spec.ts
```
