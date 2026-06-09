## Task 78-1: Implement conditional robot badge rendering

- **Status:** Complete
- **Files Changed:** `src/components/project-sidebar.tsx`
- **Tests Passed:** 36
- **Tests Failed:** 0

### Changes Summary
- Imported Phosphor `Robot` and render it only for active Copilot states: `"running"` and `"waiting"`.
- Kept idle and unrecognized statuses on the uppercase first-letter badge with no Copilot `role="status"` element.
- Preserved the existing `h-6 w-6` language-color badge wrapper, project tab `aria-label`, `aria-current`, and `title={project.name}` behavior.
- Removed the legacy overlay dot path by replacing it with an `sr-only` `role="status"` label for active states.
- Applied `animate-pulse` for running and `ring-2 ring-[oklch(0.75_0.18_55)]` without pulse for waiting.

### Test Results
- `npm run test -- src/components/project-sidebar.test.tsx` — PASS (36 tests)
- `./harness verify` — PASS

### Notes
- No Copilot detection, WebSocket protocol, context storage, or `CopilotCliState` type changes were made.

## Task 78-2: Expand ProjectSidebar tests for sidebar modes and independent statuses

- **Status:** Complete
- **Files Changed:** `src/components/project-sidebar.test.tsx`
- **Tests Passed:** 36
- **Tests Failed:** 0

### Changes Summary
- Added coverage for issue tests 78-T01 through 78-T06.
- Asserted running robot replacement, waiting amber ring/no pulse, idle and unknown fallback, `sr-only` status text, collapsed visibility, no legacy status title/dot, native titles, and independent project statuses.

### Test Results
- `npm run test -- src/components/project-sidebar.test.tsx` — PASS (36 tests)
- `./harness verify` — PASS

### Notes
- Recorded harness friction for the targeted Vitest run because the harness `test` verb only runs the full suite and does not accept file arguments.

## Task 78-3: Verify implementation through the harness

- **Status:** Complete
- **Files Changed:** `.harness/friction.jsonl`, `.harness/evidence/verify-20260609T080159Z-37415.json`, `project/issues/78/implementation/README.md`
- **Tests Passed:** 5
- **Tests Failed:** 0

### Changes Summary
- Ran full repository verification through `./harness verify`.
- All configured steps passed: lint, format check, build, full Vitest suite, and smoke check.

### Test Results
- `./harness verify` — PASS
  - lint — PASS
  - format_check — PASS
  - build — PASS
  - test — PASS
  - smoke — PASS

### Notes
- Harness evidence: `.harness/evidence/verify-20260609T080159Z-37415.json`.
- An intermediate final verification attempt degraded because port 9999 was occupied by a stale smoke server; friction was recorded, the specific stale PID was stopped, and `./harness verify` was rerun successfully.

## Follow-up: Badge wrapper native project title

- **Status:** Complete
- **Files Changed:** `src/components/project-sidebar.tsx`, `src/components/project-sidebar.test.tsx`, `.harness/friction.jsonl`
- **Tests Passed:** 41
- **Tests Failed:** 0

### Changes Summary
- Added `title={project.name}` to the visible project badge wrapper (`data-testid=project-badge-${project.slug}`) so both idle letter badges and active Robot badges expose the project name on native hover.
- Preserved the existing project tab `title={project.name}` and the `sr-only role="status"` Copilot status label/title (`Copilot CLI running` / `Copilot CLI waiting for input`).
- Expanded active Robot badge tests to assert the badge wrapper title for running, waiting, collapsed, and multi-project active states.

### Test Results
- `npm run test -- src/components/project-sidebar.test.tsx` — PASS (36 tests)
- `./harness verify` — PASS (5 steps: lint, format_check, build, test, smoke)

### Notes
- Harness evidence: `.harness/evidence/verify-20260609T080510Z-38880.json`.
- Recorded harness friction for the targeted Vitest run because the harness `test` verb does not accept file arguments.
- No Copilot detection, protocol, context storage, or architecture documentation changes were made in this follow-up.
