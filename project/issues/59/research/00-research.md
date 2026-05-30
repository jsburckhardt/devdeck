# Research Brief - Issue #59: Toggleable File Explorer Panel with Last-Panel Guard

## Scope Classification

**scope_type:** `core_component`

This issue extends existing global core-components:

- **CORE-COMPONENT-0007 - Shell Layout:** Explorer toggle behavior, persistent mounted panels, separator visibility, last-panel guard, and `PanelToggle` accessibility.
- **CORE-COMPONENT-0008 - Multi-Project Tabs and Workspace State:** `showExplorer`, `toggleExplorer()`, and per-project persistence.

No new ADR is required. Decision #84 already mandates that togglable panels that own persistent resources remain mounted using `react-resizable-panels` `collapsible`/`collapsedSize` and imperative `collapse()`/`expand()`.

## Problem Statement

The File Explorer panel is always visible. Issue #59 requires making it toggleable like File Preview and Terminal while preserving mounted state and preventing users from hiding all panels.

Required behavior:

1. Add an Explorer toggle button before File Preview and Terminal.
2. Add `showExplorer` and `toggleExplorer()` to `WorkspaceContext`, defaulting to `true`.
3. Persist `showExplorer` through `PerProjectWorkspaceState`.
4. Keep Explorer mounted when hidden using the existing panel-collapse pattern.
5. Show separators only between two adjacent expanded panels.
6. Prevent hiding the last visible panel with `aria-disabled="true"`, `tabIndex={-1}`, muted styling, and suppressed click behavior.
7. Add `aria-label` and `aria-pressed` to `PanelToggle`.
8. Update relevant core-component documentation and `DECISION-LOG.md`.
9. Add tests for Explorer collapse/expand, state persistence, last-panel guard, separator visibility, and accessibility.

## Current State Findings

### `src/components/workspace-layout.tsx`

- `PanelToggle` currently accepts `icon`, `label`, `active`, and `onClick`. It uses a `title` attribute but lacks `aria-label`, `aria-pressed`, and a disabled/guard state.
- The panel toggle bar renders only File Preview and Terminal toggles.
- The Explorer `<Panel>` uses `defaultSize={20}` and `minSize={12}` but lacks `collapsible`, `collapsedSize={0}`, and a `panelRef`.
- File Preview and Terminal already use `PanelImperativeHandle`, `useLayoutEffect`, and `collapse()`/`expand()` to stay mounted while hidden. Explorer should follow the same pattern.
- Current separator visibility is tied only to the panel after the separator (`!showFileViewer`, `!showTerminal`). With three toggleable panels, separators need pairwise visibility:
  - Separator between Explorer and File Preview: visible only when `showExplorer && showFileViewer`.
  - Separator between File Preview and Terminal: visible only when `showFileViewer && showTerminal`.

### `src/lib/workspace-context.tsx`

- `WorkspaceState` includes `showFileViewer` and `showTerminal`, but not `showExplorer`.
- `WorkspaceContextValue` exposes `toggleFileViewer` and `toggleTerminal`, but not `toggleExplorer`.
- State initialization restores `showFileViewer` and `showTerminal` from cached per-project state with `?? true`. `showExplorer` should use the same defaulting pattern.
- `stateRef`, the save-on-unmount effect, and the memoized context value must include `showExplorer`.
- `selectFile` auto-opens File Preview. No matching Explorer auto-open behavior is required by this issue and should not be added.

### `src/lib/types.ts`

- `PerProjectWorkspaceState` lacks `showExplorer`.
- Add `showExplorer?: boolean` as optional for backwards compatibility with already-cached state, restoring with `?? true`.

### Tests

- `src/components/workspace-layout.test.tsx` already has a `react-resizable-panels` mock with imperative `collapse`/`expand` support and tests for File Preview/Terminal mounted-collapse behavior.
- Its mock context needs `showExplorer` and `toggleExplorer` defaults.
- `src/lib/workspace-context.test.tsx` should surface and assert `showExplorer`, including default, restore, toggle, and save-on-unmount behavior.

## Documentation Updates Required

### CORE-COMPONENT-0007 - Shell Layout

Add rules requiring:

- Explorer to be toggleable from the panel toggle bar before File Preview and Terminal.
- Explorer to remain mounted when hidden via `collapsible`, `collapsedSize={0}`, and imperative panel collapse/expand.
- Separators to appear only between two adjacent expanded panels.
- A last-panel guard that prevents hiding the only visible panel and marks that toggle with `aria-disabled="true"`, `tabIndex={-1}`, muted styling, and a suppressed click handler.
- `PanelToggle` to expose `aria-label` and `aria-pressed`.

### CORE-COMPONENT-0008 - Multi-Project Tabs and Workspace State

Add rules requiring:

- `WorkspaceContext` to expose `showExplorer: boolean` and `toggleExplorer(): void`.
- `PerProjectWorkspaceState` to include optional `showExplorer?: boolean`.
- Missing cached `showExplorer` values to restore as `true`.
- Save-on-unmount and in-memory per-project workspace cache to include `showExplorer`.

### `project/architecture/ADR/DECISION-LOG.md`

Planner should append decision records for:

1. Explorer toggle placement before File Preview and Terminal.
2. `showExplorer` / `toggleExplorer` plus per-project persistence.
3. Pairwise separator visibility for adjacent expanded panels.
4. Last-panel guard behavior.
5. `PanelToggle` accessibility requirements.

## Implementation Handoff

Recommended implementation order:

1. `src/lib/types.ts`: add `showExplorer?: boolean` to `PerProjectWorkspaceState`.
2. `src/lib/workspace-context.tsx`: add `showExplorer`, `toggleExplorer`, state-ref tracking, save/restore, and memoized context value wiring.
3. `src/components/workspace-layout.tsx`: add Explorer toggle, Explorer panel ref/effect/collapsible props, last-panel guard, pairwise separator visibility, and `PanelToggle` accessibility props.
4. `src/components/workspace-layout.test.tsx`: add layout tests for Explorer collapse/expand, toggle order, guard, separators, and accessibility.
5. `src/lib/workspace-context.test.tsx`: add context tests for default, restore, toggle, and save-on-unmount persistence.
6. Update CORE-COMPONENT-0007, CORE-COMPONENT-0008, and DECISION-LOG.md as part of Plan.

## Risks and Constraints

- Do not conditionally unmount Explorer; Decision #84 requires mounted collapse behavior.
- Do not introduce new dependencies.
- Do not add Explorer auto-expansion on file select; it is not requested.
- Do not use the native `disabled` button attribute for the last-panel guard. Use `aria-disabled` plus `tabIndex={-1}` and guarded click handling.
- Backwards compatibility depends on optional persisted `showExplorer` and a `?? true` restore default.

## Test Coverage Requirements

- Explorer panel remains mounted while hidden.
- Explorer panel calls `collapse()` when `showExplorer` becomes `false` and `expand()` when it becomes `true`.
- Explorer toggle appears before File Preview and Terminal.
- Separator 1 is visible only when Explorer and File Preview are both expanded.
- Separator 2 is visible only when File Preview and Terminal are both expanded.
- Last visible panel toggle is marked disabled and cannot invoke its toggle handler.
- `PanelToggle` renders correct `aria-label` and `aria-pressed`.
- `showExplorer` defaults to `true`.
- `toggleExplorer()` flips state.
- Cached `showExplorer` restores when present.
- Missing cached `showExplorer` restores as `true`.
- Saved per-project workspace state includes `showExplorer`.
