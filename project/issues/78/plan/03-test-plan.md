# Test Plan: Issue #78 — Active Copilot Bot Badge in Sidebar

## Test 78-T01: Running Copilot renders an active Copilot bot badge

- **Type:** Unit / Component
- **Task:** Task 78-1, Task 78-2
- **Priority:** High

### Setup
Mock `getCopilotStatus("proj-a")` to return `"running"` and render `ProjectSidebar` with the default open project fixtures.

### Steps
1. Locate the Alpha project tab by role and accessible name.
2. Locate the Copilot status element by `role="status"` and `/running/i`.
3. Inspect the project badge wrapper classes.

### Expected Result
- The Alpha tab keeps `aria-label="Open project Alpha"` and `title="Alpha"`.
- The first-letter `A` is replaced by a Copilot-style bot badge for the active state.
- The badge wrapper still includes `h-6`, `w-6`, and the TypeScript language color class.
- The active badge/status includes `animate-pulse`.
- No legacy overlay dot is rendered alongside the bot badge.

## Test 78-T02: Waiting Copilot renders an amber non-pulsing Copilot bot badge

- **Type:** Unit / Component
- **Task:** Task 78-1, Task 78-2
- **Priority:** High

### Setup
Mock `getCopilotStatus("proj-b")` to return `"waiting"` and render `ProjectSidebar`.

### Steps
1. Locate the Beta project tab.
2. Locate the Copilot status element by `role="status"` and `/waiting/i`.
3. Inspect the active badge classes.

### Expected Result
- The Beta badge shows the Copilot bot replacement instead of the `B` initial.
- The status text announces `Copilot CLI waiting for input`.
- The active badge has an amber ring style.
- The active badge does not include `animate-pulse`.
- The project tab keeps `title="Beta"` for native hover discovery.

## Test 78-T03: Idle and unknown statuses fall back to letter badges

- **Type:** Unit / Component
- **Task:** Task 78-1, Task 78-2
- **Priority:** High

### Setup
Render one case where all statuses are `"idle"` and one case where a project status is cast to an unrecognized value.

### Steps
1. Render `ProjectSidebar`.
2. Inspect project tab text for first-letter initials.
3. Query for Copilot `role="status"` elements.

### Expected Result
- Idle projects render their uppercase first letters.
- Unrecognized statuses render the uppercase first letter.
- No Copilot `role="status"` element is present for idle or unknown statuses.
- No overlay dot is present.

## Test 78-T04: Active robot status preserves accessibility contracts

- **Type:** Unit / Accessibility
- **Task:** Task 78-1, Task 78-2
- **Priority:** High

### Setup
Mock one project as `"running"` and another as `"waiting"`; render `ProjectSidebar`.

### Steps
1. Query project tabs by `button` role and `/Open project/` names.
2. Query active Copilot states by `role="status"`.
3. Inspect `aria-current` on the active project tab.

### Expected Result
- Project tab accessible names remain `Open project ${project.name}`.
- The active route tab retains `aria-current="page"`.
- Active Copilot states are announced by `sr-only role="status"` text.
- Running and waiting status labels are distinct and do not rely on color alone.

## Test 78-T05: Collapsed sidebar keeps active Copilot bot badge visible

- **Type:** Unit / Component
- **Task:** Task 78-1, Task 78-2
- **Priority:** Medium

### Setup
Mock the active project status as `"running"` and render `ProjectSidebar`.

### Steps
1. Click the `Collapse sidebar` button.
2. Locate the active Copilot status element.
3. Inspect project tab native titles.

### Expected Result
- The sidebar switches to `w-12`.
- The active Copilot bot badge/status remains present in collapsed mode.
- Project-name text labels are hidden, but project tab `title` attributes remain.
- Existing collapsed close-button and worktree CSS-hide behavior is unaffected.

## Test 78-T06: Multiple projects render independent Copilot statuses

- **Type:** Unit / Component
- **Task:** Task 78-1, Task 78-2
- **Priority:** Medium

### Setup
Mock `proj-a` as `"running"`, `proj-b` as `"waiting"`, and `proj-c` as `"idle"`; render `ProjectSidebar`.

### Steps
1. Query all Copilot status elements.
2. Inspect each project tab's visible/fallback badge content.
3. Confirm idle project behavior.

### Expected Result
- Exactly two active Copilot status elements are rendered.
- Alpha has a running Copilot bot badge.
- Beta has a waiting Copilot bot badge.
- Charlie keeps the `C` first-letter badge and has no Copilot status element.

## Test 78-T07: Full repository verification passes

- **Type:** Verification
- **Task:** Task 78-3
- **Priority:** High

### Setup
Complete implementation and component test updates.

### Steps
1. Run `./harness verify`.
2. If the harness is degraded or unavailable, record friction with `./harness friction add` and run the equivalent project commands from `.harness/contract.yml`.

### Expected Result

- `./harness verify` returns a passing verdict.
- Lint, format check, build, full Vitest suite, and smoke checks pass.

## Test 78-T08: Active Copilot status survives another browser connection

- **Type:** Unit / Server + Component
- **Task:** Task 78-1, Task 78-2
- **Priority:** High

### Setup

Connect multiple terminal WebSocket clients for the same project slug, then emit active Copilot PTY output from one server-side terminal stream.

### Steps

1. Confirm the server broadcasts the active `"running"` status frame to already-connected same-project clients.
2. Connect another same-project client after the active status was detected.
3. Render `TerminalPanel` with a disconnected terminal hook state.

### Expected Result

- Existing same-project browser clients receive the active status frame.
- Newly connected same-project browser clients receive the cached active status frame without waiting for fresh PTY output.
- A disconnected browser terminal does not overwrite the sidebar's cached active project badge with `"idle"`.
