# Task Breakdown: Issue #69

## Task T1: Update shell-layout and workspace-state decisions

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** None
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description

Clarify the shell layout and workspace state contracts introduced by this bug fix. The shell must resize a single remaining visible workspace panel to full width after visibility, project, or active worktree changes, but it must not reset multi-panel user-resized layouts. Workspace state restoration must normalize invalid all-hidden cached visibility to Terminal visible before first render.

### Acceptance Criteria

- CORE-COMPONENT-0007 records the single-visible-panel resize rule and the multi-panel preservation rule.
- CORE-COMPONENT-0008 records the invalid all-hidden cached visibility normalization rule.
- DECISION-LOG.md records both decisions with date 2026-05-30.
- No ADR is created.

### Test Coverage

- Documentation-only task; covered by review against T2-T6 implementation and verification.

## Task T2: Normalize cached/restored workspace visibility

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0008

### Description

Update `WorkspaceProvider` so restored cached visibility is valid before first render. If `showExplorer`, `showFileViewer`, and `showTerminal` are all false, normalize to Terminal visible. Preserve every valid cached visibility combination unchanged.

### Acceptance Criteria

- All-hidden cached state becomes `{ showExplorer: false, showFileViewer: false, showTerminal: true }`.
- Valid Terminal-only, Explorer-only, File Preview-only, two-panel, and three-panel cached states are preserved.
- Last-panel guard behavior remains correct.

### Test Coverage

- Unit tests for all-hidden cached restoration.
- Unit tests proving valid cached visibility states are unchanged.
- Existing last-panel guard tests remain passing.

## Task T3: Normalize exactly one visible panel in WorkspaceLayout

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1, T2
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description

Add a `useLayoutEffect` after the existing collapse/expand effects in `WorkspaceLayout`. It computes visible panels and, only when exactly one panel is visible, calls that panel handle's `resize("100%")`. Include `project.slug` and `activeWorktree` dependencies so single-panel restored layouts and project/worktree switches cannot retain stale partial sizes.

Do not resize two- or three-panel states. Those layouts should preserve user-resized proportions and rely on `react-resizable-panels` collapse/expand redistribution.

### Acceptance Criteria

- File Preview then Explorer leaves only Terminal visible and Terminal is resized to `100%`.
- Explorer then File Preview leaves only Terminal visible and Terminal is resized to `100%`.
- Every ordered two-step transition from three visible panels that leaves only Explorer, only File Preview, or only Terminal resizes the remaining panel to `100%`.
- Hidden panels remain mounted and collapsed.
- Multi-panel visibility changes do not call resize normalization.
- Project slug or active worktree changes retrigger `100%` normalization when the current state has exactly one visible panel.
- Rapid toggles settle to the correct final single-panel resize.

### Test Coverage

- Unit tests assert `resize("100%")` for the remaining panel in every ordered two-step single-panel transition.
- Unit tests assert two- and three-panel states do not receive forced resize calls.
- Unit tests assert project slug and active worktree rerenders trigger single-panel normalization.
- Unit tests assert TerminalPanel, FileViewer, and Explorer remain mounted while hidden.

## Task T4: Preserve separator topology and last-panel guard

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T3
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0007

### Description

Keep Separator 1 visible/enabled when Terminal is visible and either File Preview or Explorer is visible:

```tsx
showTerminal && (showFileViewer || showExplorer)
```

Keep Separator 0 governed by:

```tsx
showExplorer && showFileViewer
```

### Acceptance Criteria

- Separator 1 is active for Explorer + Terminal adjacency.
- Separator 1 is active for File Preview + Terminal adjacency.
- Separator 1 is inactive for Terminal-only.
- Separator 0 is active only for Explorer + File Preview adjacency.
- Last-panel guard still prevents hiding the only visible panel.

### Test Coverage

- Unit separator matrix across meaningful visibility combinations.
- Unit last-panel guard tests for Explorer-only, File Preview-only, and Terminal-only.

## Task T5: Add browser geometry regression coverage

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T2, T3, T4
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0007

### Description

Add a Playwright regression spec for Issue #69 because jsdom cannot prove actual browser widths. Verify Terminal occupies the workspace content width after both reported toggle paths.

### Acceptance Criteria

- File Preview then Explorer leaves Terminal width equal to workspace width within browser tolerance.
- Explorer then File Preview produces the same final Terminal width.
- Test uses real browser layout measurements, not mocked panel handles.
- Terminal remains connected after visibility toggles.

### Test Coverage

- Playwright geometry test for both reported orders.
- Assertions compare terminal panel bounding box width to the workspace content bounding box width with tolerance.
- Assert the terminal stays connected after expansion.

## Task T6: Run full verification

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T1, T2, T3, T4, T5
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0006

### Description

Run configured checks plus targeted Playwright regression coverage.

### Acceptance Criteria

- `npm run lint` passes.
- `npm run format:check` passes.
- `npm run build` passes.
- `npm run test` passes.
- `npx playwright test e2e/workspace-layout.spec.ts` passes.

### Test Coverage

- Full Vitest suite.
- Targeted Issue #69 Playwright geometry spec.
