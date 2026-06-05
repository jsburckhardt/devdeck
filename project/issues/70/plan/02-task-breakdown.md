# Task Breakdown: Issue #70 - fix(layout): prevent fullscreen clipping of bottom controls

## Task 70.1: Constrain root and project shell height/overflow chain

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description

Update the outer layout chain so the app shell inherits a single viewport-constrained height instead of mixing `min-h-full` and project-level `h-screen`.

Expected implementation areas:

- `src/app/layout.tsx`
- `src/app/project/layout.tsx`

The root/body should provide a full-height, overflow-hidden flex chain. The project layout should inherit that height with `h-full`, keep `min-h-0` on flex children, and prevent page-level overflow from propagating beyond the project shell.

### Acceptance Criteria

- [ ] `html` and `body` form an explicit full-height chain.
- [ ] `body` prevents outer document scrolling while preserving internal panel scrolling.
- [ ] Project layout no longer uses standalone `h-screen`.
- [ ] Project layout uses inherited `h-full` and `overflow-hidden`/`min-h-0` where needed.
- [ ] Project sidebar remains a fixed-width sibling outside the resizable panel group.
- [ ] Persistent-resource panels remain mounted; no conditional unmounting is introduced.

### Test Coverage

- Add or extend viewport geometry coverage if stable in the existing Playwright setup to assert no page-level vertical overflow on a project page.
- Assert the sidebar footer toggle remains within the viewport at a 1280x720-style viewport if e2e coverage is added.
- Covered by Test 70.4 and full verification Test 70.5.

## Task 70.2: Refactor ProjectSidebar into fixed header, scrollable middle, and fixed footer

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** Task 70.1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description

Refactor `src/components/project-sidebar.tsx` so the bottom Wide/Narrow collapse toggle is structurally protected from clipping.

Expected structure:

- Fixed non-shrinking header for Home button and divider.
- Scrollable middle region for project tabs and active `WorktreeTree`.
- Fixed non-shrinking footer for the `SidebarSimple` collapse toggle.

Preserve existing sidebar widths, collapse persistence key, accessibility attributes, title attributes, close-button behavior, Copilot status indicators, and WorktreeTree mounted/CSS-hidden behavior.

### Acceptance Criteria

- [ ] Expanded sidebar still uses `w-44`; collapsed sidebar still uses `w-12`.
- [ ] Collapse state still persists globally under `devdeck-sidebar-collapsed`.
- [ ] Toggle still uses `SidebarSimple`, `aria-label`, `aria-expanded`, and native `title`.
- [ ] Toggle is rendered in a fixed footer and no longer depends on `mt-auto` inside the overflowing content column.
- [ ] Project/worktree overflow is confined to a `min-h-0 flex-1 overflow-y-auto` middle region.
- [ ] Active `WorktreeTree` remains mounted and CSS-hidden when the sidebar collapses.
- [ ] Copilot status indicators remain visible on project badges when meaningful and retain non-color semantics.

### Test Coverage

- Extend `src/components/project-sidebar.test.tsx` to assert the scrollable middle region classes.
- Assert the footer region is fixed/non-shrinking and contains the collapse toggle.
- Assert the toggle class no longer relies on `mt-auto`.
- Covered by Tests 70.1, 70.2, and 70.3.

## Task 70.3: Extend ProjectSidebar component regression tests

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** Task 70.2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description

Add focused Vitest/@testing-library coverage for the sidebar clipping regression and preserved accessibility contracts.

Use stable DOM/class assertions because jsdom cannot measure fullscreen clipping.

### Acceptance Criteria

- [ ] Tests assert the collapse toggle remains present and accessible in expanded and collapsed modes.
- [ ] Tests assert a scrollable project/worktree region exists separately from the footer.
- [ ] Tests assert many open projects do not remove the Wide/Narrow toggle from the DOM.
- [ ] Existing collapse persistence, title, `aria-expanded`, close-button, Copilot badge, and WorktreeTree tests remain passing.

### Test Coverage

- Add tests to `src/components/project-sidebar.test.tsx`.
- Include a many-project fixture, e.g. 30-40 mocked projects.
- Validate DOM structure and class contracts for scroll containment and fixed footer behavior.
- Covered by Tests 70.1, 70.2, and 70.3.

## Task 70.4: Add viewport geometry regression coverage if stable

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** Task 70.1, Task 70.2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description

Use the existing Playwright setup to add stable viewport assertions for the fullscreen clipping issue without relying on OS fullscreen APIs. If the current e2e setup lacks stable project fixtures or browser availability in verification, document the gap in implementation notes and rely on structural component coverage plus full repository verification.

### Acceptance Criteria

- [ ] Test opens a project page with a deterministic viewport such as 1280x720, if stable fixtures are available.
- [ ] Test asserts document/body do not have page-level vertical overflow beyond a small rounding tolerance, if e2e coverage is added.
- [ ] Test asserts the sidebar collapse toggle bounding box is inside the visible viewport, if e2e coverage is added.
- [ ] Test avoids flaky browser/OS fullscreen automation.

### Test Coverage

- Prefer Playwright coverage in an existing e2e spec only if it can run reliably in the repo's current setup.
- Otherwise, record why e2e geometry was not added and rely on component structural tests plus required verification.
- Covered by Test 70.4.

## Task 70.5: Run repository verification

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** Task 70.1, Task 70.2, Task 70.3, Task 70.4
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description

Run required checks after implementation and test changes.

Required commands:

- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm run test`

If Playwright coverage is added, also run the affected Playwright spec.

### Acceptance Criteria

- [ ] Lint passes.
- [ ] Format check passes.
- [ ] Production build passes.
- [ ] Vitest suite passes.
- [ ] Added/updated Playwright regression passes when executed.
- [ ] No application source changes violate CORE-COMPONENT-0007 or CORE-COMPONENT-0008.

### Test Coverage

- Verification command output must demonstrate the component and layout regression tests were executed.
- Playwright regression output must be recorded if e2e coverage is added.
