# Action Plan: Toggleable File Explorer Panel with Last-Panel Guard

## Feature

- **ID:** 59
- **Research Brief:** `project/issues/59/research/00-research.md`
- **scope_type:** `core_component`

## ADRs Created

None. Decision #84 already requires toggleable persistent-resource panels to remain mounted using `react-resizable-panels` collapsible panels with imperative collapse/expand behavior.

## Core-Components Updated

- `CORE-COMPONENT-0007-shell-layout.md`
  - Require Explorer toggle placement before File Preview and Terminal.
  - Require Explorer to remain mounted when hidden via collapsible zero-size panel behavior.
  - Require pairwise separator visibility only between adjacent expanded panels.
  - Require last-panel guard semantics.
  - Require `PanelToggle` `aria-label` and `aria-pressed`.
- `CORE-COMPONENT-0008-multi-project-tabs.md`
  - Require `showExplorer` and `toggleExplorer()` on `WorkspaceContext`.
  - Require optional `showExplorer?: boolean` in `PerProjectWorkspaceState`.
  - Require missing cached `showExplorer` to default to `true`.
  - Require save-on-unmount and in-memory cache persistence to include `showExplorer`.

## Implementation Tasks

1. Update workspace state types and context to support `showExplorer`.
2. Update shell layout to add Explorer toggle, mounted-collapse behavior, separator visibility, last-panel guard, and `PanelToggle` accessibility.
3. Extend workspace layout tests for Explorer toggle behavior, separators, guard behavior, and accessibility.
4. Extend workspace context tests for `showExplorer` defaulting, restore, toggle, and persistence.
5. Run verification commands: `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test`.
