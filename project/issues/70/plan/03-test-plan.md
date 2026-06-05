# Test Plan: Issue #70 - fix(layout): prevent fullscreen clipping of bottom controls

## Test 70.1: Sidebar collapse toggle preserves accessibility in both modes

- **Type:** Component / Vitest
- **Task:** Task 70.2, Task 70.3
- **Priority:** High

### Setup

Render `ProjectSidebar` with the existing mocked `useOpenProjects`, `usePathname`, and `WorktreeTree` setup.

### Steps

1. Render the sidebar in default expanded mode.
2. Locate the `Collapse sidebar` button.
3. Assert `aria-label`, `aria-expanded="true"`, and `title="Collapse sidebar"`.
4. Click the toggle.
5. Locate the `Expand sidebar` button.
6. Assert `aria-label`, `aria-expanded="false"`, and `title="Expand sidebar"`.

### Expected Result

The Wide/Narrow control remains keyboard-accessible and semantically correct in expanded and collapsed modes.

## Test 70.2: Sidebar uses a scrollable middle region and fixed footer

- **Type:** Component / Vitest
- **Task:** Task 70.2, Task 70.3
- **Priority:** High

### Setup

Render `ProjectSidebar` and locate structure with accessible roles plus test IDs or existing queryable structure for:

- Sidebar scroll region.
- Sidebar footer.

### Steps

1. Render the sidebar with multiple open projects.
2. Locate the scrollable project/worktree region.
3. Assert it includes `min-h-0`, `flex-1`, and `overflow-y-auto`.
4. Locate the footer region.
5. Assert it includes a non-shrinking class such as `shrink-0`.
6. Assert the collapse toggle is contained inside the footer.
7. Assert the toggle class does not contain `mt-auto`.

### Expected Result

Only the project/worktree middle region scrolls; the footer toggle is structurally protected from clipping.

## Test 70.3: Many open projects do not remove the Wide/Narrow control

- **Type:** Component / Vitest
- **Task:** Task 70.2, Task 70.3
- **Priority:** High

### Setup

Mock 30-40 open projects and set one project as active.

### Steps

1. Render `ProjectSidebar`.
2. Assert all project tab buttons render.
3. Assert the collapse toggle is present in the DOM.
4. Assert the active `WorktreeTree` wrapper is present.
5. Collapse the sidebar.
6. Assert the same active `WorktreeTree` remains mounted and its wrapper is CSS-hidden.

### Expected Result

Large project lists scroll internally without clipping or unmounting the footer toggle or active worktree selector.

## Test 70.4: Project viewport has no outer vertical overflow

- **Type:** Playwright / E2E, if stable in current setup
- **Task:** Task 70.1, Task 70.4
- **Priority:** Medium

### Setup

Use existing Playwright project fixture patterns if available. Set viewport to a deterministic fullscreen-like size such as `1280x720`.

### Steps

1. Navigate to a project page with the test fixture's token setup.
2. Wait for the project shell to render.
3. Evaluate document/body scroll metrics in the browser.
4. Locate the sidebar collapse toggle.
5. Compare toggle and workspace bounding boxes against `window.innerHeight`.

### Expected Result

The page has no outer vertical overflow and the sidebar toggle is fully inside the viewport. If stable e2e fixtures are not available, implementation notes should state why this coverage was not added.

## Test 70.5: Required repository verification passes

- **Type:** Verification
- **Task:** Task 70.5
- **Priority:** High

### Setup

Install dependencies if needed and run commands from repository root.

### Steps

1. Run `npm run lint`.
2. Run `npm run format:check`.
3. Run `npm run build`.
4. Run `npm run test`.
5. If Playwright coverage was added, run the affected Playwright spec.

### Expected Result

All required checks pass, and any added viewport regression test passes.
