# Action Plan: Issue #69

## Feature

- **ID:** 69
- **Title:** fix(layout): terminal does not expand after disabling file preview then explorer
- **Research Brief:** project/issues/69/research/00-research.md
- **scope_type:** issue

## ADRs Created

None. The research brief concluded this is an issue-scoped bug fix that aligns implementation with existing architecture.

## Core-Components Created

None. The fix aligns with:

- CORE-COMPONENT-0007 Shell Layout
- CORE-COMPONENT-0008 Multi-Project Tabs and Workspace State

## Implementation Tasks

1. Update `Separator 1` in `src/components/workspace-layout.tsx` so it is visible and enabled when Terminal is visible and any panel to its left is visible.
2. Update workspace layout unit tests in `src/components/workspace-layout.test.tsx` for Explorer + Terminal adjacency.
3. Add regression coverage for hiding File Preview first, then Explorer.
4. Run verification commands from `.github/soft-factory/verification.yml`.

## Verification Commands

```sh
npm run lint
npm run format:check
npm run build
npm run test
```
