# Task Breakdown: Toggleable File Explorer Panel with Last-Panel Guard

## Task T1: Add Explorer visibility state to workspace context

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** None
- **Related Core-Components:** CORE-COMPONENT-0008; Decisions #131, #132, #133, #134

### Description

Add `showExplorer` and `toggleExplorer()` to workspace state and context. Add optional `showExplorer?: boolean` to `PerProjectWorkspaceState` for backwards-compatible cached state. Restore cached values with `?? true`, include `showExplorer` in `stateRef`, save-on-unmount persistence, and the memoized context value.

### Acceptance Criteria

- `WorkspaceState` includes `showExplorer: boolean`.
- `WorkspaceContextValue` exposes `toggleExplorer(): void`.
- `PerProjectWorkspaceState` includes optional `showExplorer?: boolean`.
- New workspaces default `showExplorer` to `true`.
- Cached states with `showExplorer: false` restore as hidden.
- Cached states missing `showExplorer` restore as `true`.
- Save-on-unmount persists the current `showExplorer` value.
- No Explorer auto-open behavior is added on file selection.

### Test Coverage

- Unit tests assert default `showExplorer === true`.
- Unit tests assert `toggleExplorer()` flips state.
- Unit tests assert cached `showExplorer` restores when present.
- Unit tests assert missing cached `showExplorer` restores as `true`.
- Unit tests assert saved per-project workspace state includes `showExplorer`.

## Task T2: Implement Explorer panel toggle and mounted-collapse layout behavior

- **Status:** Planned
- **Complexity:** High
- **Dependencies:** T1
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008; Decisions #126, #127, #128, #129, #130, #131

### Description

Update `WorkspaceLayout` to render an Explorer toggle before File Preview and Terminal. Add an Explorer `PanelImperativeHandle` ref and `useLayoutEffect` to call `collapse()`/`expand()` based on `showExplorer`, while keeping Explorer content mounted. Add `collapsible` and `collapsedSize={0}` to the Explorer panel. Compute visible panel count and guard toggles when they represent the last expanded panel. Update separator visibility so separators render only between adjacent expanded panels.

### Acceptance Criteria

- Explorer toggle appears before File Preview and Terminal toggles.
- Explorer panel remains mounted when hidden.
- Explorer panel collapses when `showExplorer` is `false`.
- Explorer panel expands when `showExplorer` is `true`.
- Separator between Explorer and File Preview is visible only when both are expanded.
- Separator between File Preview and Terminal is visible only when both are expanded.
- Last visible panel cannot be hidden.
- Last visible panel toggle uses `aria-disabled="true"`, `tabIndex={-1}`, muted styling, and suppressed click handling.
- `PanelToggle` includes `aria-label` and `aria-pressed`.
- Native `disabled` button attribute is not used for the last-panel guard.

### Test Coverage

- Component tests assert Explorer remains mounted while hidden.
- Component tests assert Explorer panel receives collapse/expand calls.
- Component tests assert toggle ordering.
- Component tests assert separator pairwise visibility.
- Component tests assert guarded last-panel toggles do not call handlers.
- Component tests assert guarded toggle accessibility attributes.
- Component tests assert `PanelToggle` `aria-label` and `aria-pressed`.

## Task T3: Extend workspace layout test harness

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T2
- **Related Core-Components:** CORE-COMPONENT-0007; Decisions #126, #127, #128, #129, #130

### Description

Update `src/components/workspace-layout.test.tsx` mocks and assertions for the new Explorer visibility state. The `react-resizable-panels` mock should expose inspectable collapse/expand behavior and separators should be queryable for visibility assertions.

### Acceptance Criteria

- Mock workspace context includes `showExplorer` and `toggleExplorer`.
- Panel mock supports recording Explorer collapse and expand calls.
- Separator mock supports assertions for hidden/visible pairwise states.
- Tests cover Explorer, File Preview, and Terminal toggle states without unmounting persistent panel content.

### Test Coverage

- Component test suite includes positive and negative cases for each required layout behavior.
- Tests fail if Explorer is conditionally unmounted instead of collapsed.
- Tests fail if separator visibility is tied only to the following panel.

## Task T4: Extend workspace context tests

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1
- **Related Core-Components:** CORE-COMPONENT-0008; Decisions #131, #132, #133, #134

### Description

Update `src/lib/workspace-context.test.tsx` consumer test helpers and cached state fixtures to surface `showExplorer`. Add tests for defaulting, restore, toggling, and save-on-unmount persistence.

### Acceptance Criteria

- Test consumer renders `showExplorer`.
- Cached fixture coverage includes explicit `showExplorer: false`.
- Backwards-compatible cached fixture coverage omits `showExplorer`.
- Save-on-unmount assertions include `showExplorer`.

### Test Coverage

- Context test suite asserts all acceptance criteria.
- Context tests continue covering existing File Preview and Terminal visibility behavior.

## Task T5: Run full verification

- **Status:** Planned
- **Complexity:** Low
- **Dependencies:** T1, T2, T3, T4
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description

Run the project verification commands after implementation and tests are complete.

### Acceptance Criteria

- `npm run lint` passes.
- `npm run format:check` passes.
- `npm run build` passes.
- `npm run test` passes.
- No application source behavior diverges from CORE-COMPONENT-0007 or CORE-COMPONENT-0008.

### Test Coverage

- Full Vitest suite passes.
- Verification includes all layout and context tests added for Issue #59.
