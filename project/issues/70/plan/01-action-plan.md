# Action Plan: fix(layout): prevent fullscreen clipping of bottom controls

## Feature

- **ID:** 70
- **Research Brief:** project/issues/70/research/00-research.md

## ADRs Created

- None. Research concluded this issue restores existing layout contracts and requires no new ADR.

## Core-Components Created

- None. Research concluded this issue restores CORE-COMPONENT-0007 and CORE-COMPONENT-0008 behavior and requires no new core-component.

## Implementation Tasks

1. Constrain the root/project viewport height and overflow chain in `src/app/layout.tsx` and `src/app/project/layout.tsx`.
2. Refactor `src/components/project-sidebar.tsx` into fixed header, scrollable middle project/worktree area, and fixed footer toggle.
3. Extend `src/components/project-sidebar.test.tsx` to assert protected footer structure, toggle accessibility, and many-project behavior.
4. Add stable viewport geometry regression coverage using the existing Playwright setup when practical.
5. Run required repository verification commands.

Relevant architecture:

- `ADR-0002`: Next.js App Router, Tailwind CSS, Vitest/testing stack.
- `CORE-COMPONENT-0006`: co-located tests and verification expectations.
- `CORE-COMPONENT-0007`: viewport-filling shell, no outer scroll, fixed-width sidebar sibling, persisted accessible collapse toggle.
- `CORE-COMPONENT-0008`: accessible sidebar controls/status indicators, global sidebar collapse state, mounted/CSS-hidden WorktreeTree.
