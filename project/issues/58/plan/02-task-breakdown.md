# Task Breakdown: Issue #58

## Task T1: Add global persisted sidebar collapse state

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008
- **Related Decisions:** #126, #133

### Description

Add client-safe collapse state to `src/components/project-sidebar.tsx`. Persist
the global boolean-shaped state in `localStorage` under
`devdeck-sidebar-collapsed`, defaulting to expanded when absent or unreadable.
Do not store this state in `PerProjectWorkspaceState`.

### Acceptance Criteria

- Sidebar defaults to expanded.
- Collapse state persists globally under `devdeck-sidebar-collapsed`.
- localStorage access is guarded for client execution.
- Invalid or unreadable persisted values fall back to expanded.
- No per-project workspace state field is added.

### Test Coverage

- Unit test default expanded state.
- Unit test persisted collapsed state hydrates correctly.
- Unit test toggle writes `devdeck-sidebar-collapsed`.
- Unit test invalid storage value falls back to expanded.

## Task T2: Implement expanded and collapsed sidebar layout

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008
- **Related Decisions:** #127, #129

### Description

Update `ProjectSidebar` width and rendering. Expanded mode remains `w-44`
(~176 px) with Home and project text labels. Collapsed mode uses `w-12`
(48 px), hides Home/project text labels, keeps language-color badges visible,
and uses CSS-only width transition with no new dependencies.

### Acceptance Criteria

- Expanded sidebar uses `w-44`.
- Collapsed sidebar uses `w-12`.
- Width change uses CSS transition only.
- Collapsed mode hides Home text and project-name labels.
- Collapsed project tabs show language-color badges.
- No new dependencies are added.

### Test Coverage

- Unit test expanded nav contains `w-44`.
- Unit test collapsed nav contains `w-12`.
- Unit test expanded mode renders Home and project names.
- Unit test collapsed mode omits Home and project name text while keeping badge
  initials.

## Task T3: Add accessible collapse toggle

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T1, T2
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0007
- **Related Decisions:** #128, #134

### Description

Add a bottom sidebar toggle button using `SidebarSimple` from
`@phosphor-icons/react`. Include `aria-label`, `aria-expanded`, and native
`title`. Do not add a keyboard shortcut in v1.

### Acceptance Criteria

- Toggle button renders at the bottom of the sidebar.
- Toggle uses `SidebarSimple`.
- Toggle has correct `aria-label`, `aria-expanded`, and `title`.
- Clicking toggle expands/collapses the sidebar.
- No keyboard shortcut is implemented.

### Test Coverage

- Unit test toggle is discoverable by accessible name.
- Unit test `aria-expanded` changes with state.
- Unit test `title` changes or remains meaningful in both modes.
- Unit test click toggles sidebar state.

## Task T4: Preserve tab controls, Copilot status, and WorktreeTree behavior

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T2
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008
- **Related Decisions:** #130, #131, #132

### Description

Adjust collapsed-mode tab internals. Close buttons must always be visible when
collapsed while expanded mode may retain hover/focus reveal. Copilot status
indicators remain visible on project badges. The active project's `WorktreeTree`
remains mounted and is hidden via CSS when collapsed.

### Acceptance Criteria

- Collapsed close buttons are always visible.
- Expanded close buttons retain hover/focus reveal behavior.
- Copilot status badge remains visible in both modes.
- Active `WorktreeTree` remains mounted when collapsed.
- Collapsed `WorktreeTree` wrapper is CSS-hidden, not conditionally unmounted.

### Test Coverage

- Unit test collapsed close buttons include always-visible opacity class.
- Unit test expanded close buttons retain hover/focus reveal classes.
- Unit test Copilot status indicator remains rendered in collapsed mode.
- Unit test active `WorktreeTree` remains in DOM when collapsed and wrapper is
  hidden.

## Task T5: Preserve accessibility and tooltip behavior

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T2, T3, T4
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0008
- **Related Decisions:** #53, #128, #129, #130

### Description

Ensure icon-only mode remains accessible. Use existing native `title`
attributes for Home, project tabs, Copilot status, and toggle. Preserve
`aria-label`, `aria-current`, keyboard tab navigation, and Enter/Space
activation.

### Acceptance Criteria

- Native `title` attributes provide collapsed tooltips.
- No tooltip dependency is added.
- Existing tab keyboard navigation still works.
- Existing close button keyboard behavior still works.
- Active tab retains `aria-current="page"`.

### Test Coverage

- Unit test collapsed Home and project tabs retain `title`.
- Unit test all interactive controls retain `aria-label`.
- Unit test active tab retains `aria-current`.
- Unit test keyboard activation remains covered for tabs and close buttons.

## Task T6: Verify and format

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T1, T2, T3, T4, T5
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0007, CORE-COMPONENT-0008
- **Related Decisions:** #9, #18, #19

### Description

Run project verification commands after implementation.

### Acceptance Criteria

- `npm run lint` passes.
- `npm run format:check` passes.
- `npm run test` passes.

### Test Coverage

- Verification output confirms sidebar tests pass.
- Existing project test suite remains green.
