# Test Plan: Issue #58

## TP1: Default and persisted collapse state

- **Type:** Unit
- **Task:** T1
- **Priority:** High

### Setup

Render `ProjectSidebar` with mocked open projects and clear `localStorage`.

### Steps

1. Render sidebar with no stored value.
2. Assert expanded state.
3. Click collapse toggle.
4. Assert `localStorage["devdeck-sidebar-collapsed"]` is updated.
5. Re-render with stored collapsed value.

### Expected Result

Sidebar defaults to expanded, persists collapsed state globally, and restores
persisted state.

## TP2: Expanded and collapsed widths

- **Type:** Unit
- **Task:** T2
- **Priority:** High

### Setup

Render `ProjectSidebar` in expanded and collapsed states.

### Steps

1. Assert expanded nav includes `w-44`.
2. Collapse sidebar.
3. Assert collapsed nav includes `w-12`.
4. Assert transition class is present.

### Expected Result

Expanded width remains ~176 px, collapsed width is 48 px, and the transition is
CSS-only.

## TP3: Icon-only collapsed rendering

- **Type:** Unit
- **Task:** T2
- **Priority:** High

### Setup

Render sidebar with Home and three open projects.

### Steps

1. Confirm expanded mode renders Home and project names.
2. Collapse sidebar.
3. Confirm Home/project text labels are not rendered.
4. Confirm project badge initials remain rendered.

### Expected Result

Collapsed mode is icon-only while expanded mode preserves current labels.

## TP4: Toggle accessibility

- **Type:** Unit
- **Task:** T3
- **Priority:** High

### Setup

Render `ProjectSidebar`.

### Steps

1. Locate collapse toggle by role/name.
2. Assert `aria-label`, `aria-expanded`, and `title`.
3. Click toggle.
4. Assert `aria-expanded` updates.

### Expected Result

Toggle is accessible and correctly reports expanded/collapsed state.

## TP5: Close buttons in both modes

- **Type:** Unit
- **Task:** T4
- **Priority:** High

### Setup

Render sidebar in expanded and collapsed states.

### Steps

1. In expanded mode, assert close buttons retain hover/focus reveal classes.
2. Collapse sidebar.
3. Assert close buttons are always visible.
4. Click a close button.

### Expected Result

Collapsed close buttons are always visible and close behavior is unchanged.

## TP6: WorktreeTree remains mounted when collapsed

- **Type:** Unit
- **Task:** T4
- **Priority:** High

### Setup

Mock `WorktreeTree` with a test id and render sidebar with an active project.

### Steps

1. Assert active project `WorktreeTree` is rendered.
2. Collapse sidebar.
3. Assert the same `WorktreeTree` remains in the DOM.
4. Assert wrapper is CSS-hidden.

### Expected Result

Collapse hides `WorktreeTree` visually without unmounting it.

## TP7: Copilot status badge remains visible

- **Type:** Unit
- **Task:** T4
- **Priority:** Medium

### Setup

Mock `getCopilotStatus` to return `running` or `waiting`.

### Steps

1. Render expanded sidebar and assert status badge.
2. Collapse sidebar.
3. Assert status badge remains rendered on the project badge.

### Expected Result

Copilot status remains visible in both sidebar modes.

## TP8: Native titles and keyboard accessibility

- **Type:** Unit
- **Task:** T5
- **Priority:** Medium

### Setup

Render collapsed sidebar.

### Steps

1. Assert Home, project tabs, Copilot status, and toggle use native `title`.
2. Assert interactive elements have `aria-label`.
3. Use Tab/Enter/Space to activate tab and close controls.

### Expected Result

Collapsed icon-only mode remains accessible without a tooltip dependency.

## TP9: Project verification

- **Type:** Verification
- **Task:** T6
- **Priority:** High

### Setup

Run commands from repository root.

### Steps

1. Run `npm run lint`.
2. Run `npm run format:check`.
3. Run `npm run test`.

### Expected Result

All commands pass.
