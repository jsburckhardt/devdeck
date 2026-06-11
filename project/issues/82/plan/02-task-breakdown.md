# Task Breakdown: Add Visible Close Project Action to Wide Workspace Controls

## Task 82-1: Add the WorkspaceLayout close action

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description
Update `src/components/workspace-layout.tsx` so the wide workspace panel control bar includes an always-visible current-project Close Project action. Import `useRouter`, `X`, `useOpenProjects`, and `closeNavigationTarget`. Compute the navigation target from `openProjects`, `project.slug`, and `project.slug`; call `closeProject(project.slug)`; then call `router.push(navigationTarget)` when the helper returns a target.

The control should trail the existing Explorer, File Preview, and Terminal `PanelToggle` buttons, remain visually distinct from those toggles, and avoid changing panel visibility behavior.

### Acceptance Criteria
- `WorkspaceLayout` renders a visible Close Project button for the current project in the panel control bar.
- The button uses the existing Phosphor `X` icon and a label/title that include the current project name.
- The button is a regular action button and does not set `aria-pressed`.
- The close handler reuses `closeNavigationTarget(openProjects, project.slug, project.slug)` and `closeProject(project.slug)`.
- Closing with a returned navigation target calls `router.push(target)` after closing the project.
- Explorer, File Preview, and Terminal toggles preserve their existing order, guard behavior, and `aria-pressed` semantics.

### Test Coverage
- Covered by Task 82-2 component tests in `src/components/workspace-layout.test.tsx`.
- Tests must assert button rendering/accessibility semantics and both multi-project and single-project close navigation.
- Existing layout tests for panel toggle order, last-panel guard, mounted-collapse behavior, and separators must continue to pass under `./harness test`.

## Task 82-2: Extend WorkspaceLayout close-action tests

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** Task 82-1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0007, CORE-COMPONENT-0008, CORE-COMPONENT-0009

### Description
Extend `src/components/workspace-layout.test.tsx` to mock `next/navigation` and `@/lib/open-projects-context` alongside the existing workspace context mock. Add component tests for the new workspace Close Project action while keeping the existing `WorkspaceLayout` tests focused and deterministic.

### Acceptance Criteria
- Tests assert the Close Project button is discoverable by role/name and includes `project.name` in both `aria-label` and `title`.
- Tests assert the Close Project button has no `aria-pressed` attribute and is not treated as a `PanelToggle`.
- Tests assert the panel toggle labels remain exactly `Hide Explorer`, `Hide File Preview`, and `Hide Terminal` before considering the close action.
- Tests assert closing the current project with multiple open projects calls `closeProject(project.slug)` and navigates to the same adjacent project chosen by `closeNavigationTarget()`.
- Tests assert closing the only open project calls `closeProject(project.slug)` and navigates to `/`.
- Iterative test execution should use `./harness test` where practical; use direct Vitest commands only for raw diagnostics and record harness friction if bypassing an equivalent supported verb.

### Test Coverage
- Add at least three Vitest/React Testing Library cases in `src/components/workspace-layout.test.tsx`:
  - render/accessibility semantics for the Close Project action;
  - multiple-open-project close navigation;
  - single-open-project close navigation to `/`.
- Existing `ProjectSidebar` close-navigation tests remain a reference, not a required source change.

## Task 82-3: Verify implementation through the harness

- **Status:** Pending
- **Complexity:** Small
- **Dependencies:** Task 82-1, Task 82-2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0009

### Description
After source and test changes are complete, run the repository-supported verification path. Use the harness as the command surface of record.

### Acceptance Criteria
- `./harness test` passes after the `WorkspaceLayout` tests are updated.
- `./harness verify` is run before implementation handoff and returns a passing verdict.
- Any direct command used instead of an equivalent harness verb is justified and recorded with `./harness friction add`.
- No Plan-stage-only artifacts are modified during implementation except to document an approved deviation.

### Test Coverage
- `./harness verify` covers lint, format check, build, test, and smoke steps from `.harness/contract.yml`.
- If `./harness verify` fails, the implementer must fix the failing source/test issue or return to Plan if a core-component contract must change.
