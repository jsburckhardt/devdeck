# Task Breakdown: Issue #78 — Active Copilot Robot Badge in Sidebar

## Task 78-1: Implement conditional robot badge rendering

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0005
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description
Update `src/components/project-sidebar.tsx` so active Copilot CLI states replace the project initial inside the existing badge with a Phosphor `Robot` icon. Preserve the existing badge wrapper dimensions, `languageColor(project.language)` background, project tab accessible name, active tab semantics, and native project-name `title`. Treat only `"running"` and `"waiting"` as active; render the first-letter badge for `"idle"` and any unrecognized status value.

### Acceptance Criteria
- `Robot` is imported from `@phosphor-icons/react`; no new package or tooltip dependency is added.
- `"running"` and `"waiting"` Copilot states render a robot icon inside the same `h-6 w-6` language-color badge wrapper.
- `"idle"` and unrecognized Copilot statuses render the existing uppercase first-letter badge and no Copilot status element.
- The overlay/dot `CopilotStatusIndicator` is removed or not rendered when the robot badge is shown.
- `"running"` robot badge includes `animate-pulse`.
- `"waiting"` robot badge uses an amber ring style and does not include `animate-pulse`.
- Active robot states expose `sr-only` text with `role="status"` using the labels `Copilot CLI running` and `Copilot CLI waiting for input`.
- Project tabs retain `aria-label="Open project ${project.name}"`, `aria-current` for the active project, and `title={project.name}` for native hover discovery.
- No Copilot detection pipeline, WebSocket protocol, `CopilotCliState` type, or context storage behavior is changed.

### Test Coverage
- Add or update `src/components/project-sidebar.test.tsx` coverage proving active robot replacement, idle/unknown fallback, status text, styling differences, no overlay dot, and preserved tab attributes.
- Existing navigation, close-button, collapse, title, and worktree-selector tests must continue to pass.

## Task 78-2: Expand ProjectSidebar tests for sidebar modes and independent statuses

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** Task 78-1
- **Related ADRs:** ADR-0002, ADR-0005
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description
Update the React Testing Library tests around Copilot sidebar status indicators so they verify the new robot badge contract instead of the legacy overlay dot. Include active, idle, unknown, expanded, collapsed, and multi-project cases.

### Acceptance Criteria
- Tests assert `"running"` renders an accessible active robot badge with `animate-pulse`.
- Tests assert `"waiting"` renders an accessible active robot badge with an amber ring and no pulse.
- Tests assert idle projects render initials and no Copilot `role="status"` element.
- Tests assert an unknown status value falls back to the initial badge and no Copilot `role="status"` element.
- Tests assert native `title` attributes remain on project tabs and no tooltip dependency is introduced.
- Tests assert collapsed sidebar mode still shows active robot badges.
- Tests assert different projects can independently render running, waiting, and idle badge states.
- Tests assert the legacy overlay dot is absent when the active robot badge is rendered.

### Test Coverage
- `npm run test -- src/components/project-sidebar.test.tsx` or the closest harness-supported targeted test command should pass during implementation.
- The full `./harness verify` run in Task 78-3 must include these tests in the complete Vitest suite.

## Task 78-3: Verify implementation through the harness

- **Status:** Pending
- **Complexity:** Small
- **Dependencies:** Task 78-1, Task 78-2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0009

### Description
Run the repository verification workflow after code and test changes are complete, using the engineering harness as the primary operating surface.

### Acceptance Criteria
- `./harness verify` completes with a passing verdict.
- If `./harness verify` reports degraded or unavailable, record the bypass reason with `./harness friction add` and run the equivalent `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test` commands.
- Any failures are fixed before handoff.
- Verification does not require changing architecture decisions, core-component rules, or the Copilot detection protocol.

### Test Coverage
- Harness verification must exercise linting, format checking, build, the full Vitest suite, and smoke checks as defined in `.harness/contract.yml`.
- The implementation-specific assertions from Tasks 78-1 and 78-2 must be included in the full test suite.
