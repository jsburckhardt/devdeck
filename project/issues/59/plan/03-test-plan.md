# Test Plan: Toggleable File Explorer Panel with Last-Panel Guard

## TP1: Workspace context defaults Explorer visible

- **Type:** Unit
- **Tasks:** T1, T4
- **Expected Result:** Rendering `WorkspaceProvider` without cached state exposes `showExplorer === true`.

## TP2: Workspace context toggles Explorer visibility

- **Type:** Unit
- **Tasks:** T1, T4
- **Expected Result:** Calling `toggleExplorer()` flips `showExplorer` from `true` to `false`, then back to `true`.

## TP3: Cached Explorer visibility restores when present

- **Type:** Unit
- **Tasks:** T1, T4
- **Expected Result:** Cached `PerProjectWorkspaceState` containing `showExplorer: false` restores `showExplorer` as `false`.

## TP4: Missing cached Explorer visibility defaults to true

- **Type:** Unit
- **Tasks:** T1, T4
- **Expected Result:** Cached state without `showExplorer` restores `showExplorer` as `true`.

## TP5: Save-on-unmount persists Explorer visibility

- **Type:** Unit
- **Tasks:** T1, T4
- **Expected Result:** After hiding Explorer and unmounting `WorkspaceProvider`, cached workspace state includes `showExplorer: false`.

## TP6: Explorer toggle renders before File Preview and Terminal

- **Type:** Component
- **Tasks:** T2, T3
- **Expected Result:** Toggle button accessible names appear in DOM order: Explorer, File Preview, Terminal.

## TP7: Explorer remains mounted while hidden

- **Type:** Component
- **Tasks:** T2, T3
- **Expected Result:** Explorer content remains present after rerendering with `showExplorer: false`; hiding happens through panel collapse, not conditional unmount.

## TP8: Explorer panel collapse and expand are invoked

- **Type:** Component
- **Tasks:** T2, T3
- **Expected Result:** Explorer panel `collapse()` is called when hidden and `expand()` is called when shown.

## TP9: Separators are visible only between adjacent expanded panels

- **Type:** Component
- **Tasks:** T2, T3
- **Expected Result:** Separator 1 is visible only when `showExplorer && showFileViewer`; separator 2 is visible only when `showFileViewer && showTerminal`.

## TP10: Last visible panel guard blocks hiding final panel

- **Type:** Component
- **Tasks:** T2, T3
- **Expected Result:** The only visible panel's toggle has `aria-disabled="true"`, `tabIndex={-1}`, no native `disabled` attribute, and does not invoke its handler when clicked.

## TP11: PanelToggle exposes accessibility state

- **Type:** Component
- **Tasks:** T2, T3
- **Expected Result:** Each toggle has an `aria-label` describing the action and `aria-pressed` matching panel visibility.

## TP12: Full project verification passes

- **Type:** Verification
- **Task:** T5
- **Expected Result:** `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test` pass.
