# Implementation Notes: Issue #69

## Task T1: Update Separator 1 adjacency condition

- **Status:** Completed
- **Files Changed:** src/components/workspace-layout.tsx
- **Tests Passed:** 22
- **Tests Failed:** 0

### Changes Summary

- Updated Separator 1 visibility and disabled logic to stay active when Terminal is visible and either File Preview or Explorer is visible.
- Preserved the existing Separator 0 rule of Explorer plus File Preview only.
- Kept all panels mounted with collapse and expand behavior, matching CORE-COMPONENT-0007 and CORE-COMPONENT-0008.

### Test Results

- `npx vitest run src/components/workspace-layout.test.tsx` passed with 22 tests.

### Notes

- No ADR or core-component changes were required.

## Task T2: Update separator adjacency tests

- **Status:** Completed
- **Files Changed:** src/components/workspace-layout.test.tsx
- **Tests Passed:** 22
- **Tests Failed:** 0

### Changes Summary

- Updated the separator adjacency matrix to assert both CSS visibility and `data-disabled` state.
- Added explicit coverage for Explorer plus Terminal adjacency where Separator 1 is visible and enabled.
- Kept coverage for all three panels, File Preview plus Terminal, Explorer plus File Preview, and Terminal-only states.

### Test Results

- `npx vitest run src/components/workspace-layout.test.tsx` passed with 22 tests.

### Notes

- The tests assert pairwise adjacency state rather than relying on raw DOM order alone.

## Task T3: Add regression test for File Preview hidden then Explorer hidden sequence

- **Status:** Completed
- **Files Changed:** src/components/workspace-layout.test.tsx
- **Tests Passed:** 22
- **Tests Failed:** 0

### Changes Summary

- Added an Issue #69 regression test that starts with all panels visible, hides File Preview, then hides Explorer.
- The intermediate Explorer plus Terminal state asserts Separator 1 remains visible and enabled.
- The terminal-only final state asserts both separators are hidden and disabled while Terminal remains mounted.
- The test also verifies panel collapse and expand calls available through the existing react-resizable-panels mock.

### Test Results

- `npx vitest run src/components/workspace-layout.test.tsx` passed with 22 tests.

### Notes

- File Preview and Explorer remain mounted through the sequence.

## Task T4: Run verification commands

- **Status:** Completed
- **Files Changed:** None
- **Tests Passed:** 4 configured verification steps plus smoke
- **Tests Failed:** 0

### Changes Summary

- Installed clean worktree-local dependencies with `npm ci` after adding the missing Python standard library package required by `node-gyp` in the verification environment.
- Ran all configured verification commands from `.github/soft-factory/verification.yml`.
- Confirmed the production build resolves packages from this worktree and compiles successfully.
- Ran the configured smoke test by starting the built Next.js app on port 9999, confirming `/` responds over HTTP, and shutting the server down.

### Test Results

- `npm run lint` passed with 0 errors and 1 pre-existing warning in `src/server/terminal-server.test.ts` for `_p` unused.
- `npm run format:check` passed.
- `npm run build` passed. Turbopack emitted a pre-existing NFT tracing warning for `next.config.ts` via `src/app/api/projects/route.ts`.
- `npm run test` passed with 33 files and 498 tests.
- Smoke test passed with an HTTP 200 response from `http://localhost:9999/`.

### Notes

- No ADR or core-component changes were required.
- Verification used the configured Soft Factory commands; no source changes were made during Verify.


## Second Implement Pass: T2-T5 layout normalization

- **Status:** Completed with targeted unit and browser verification passing.
- **Files Changed:** `src/components/workspace-layout.tsx`, `src/lib/workspace-context.tsx`, `src/components/workspace-layout.test.tsx`, `src/lib/workspace-context.test.tsx`, `e2e/workspace-layout.spec.ts`, `project/issues/69/implementation/README.md`.
- **Architecture Context:** Plan-stage architecture updates are present in `CORE-COMPONENT-0007`, `CORE-COMPONENT-0008`, and `DECISION-LOG.md` decisions #144/#145.

### Changes Summary

- Added exactly-one-visible-panel normalization in `WorkspaceLayout` after the existing collapse/expand layout effects. The remaining Explorer, File Preview, or Terminal panel is resized with `resize("100%")`; two- and three-panel states are left untouched.
- Included `project.slug` and `activeWorktree` in the normalization dependencies so single-panel restored layouts are normalized on project and worktree changes.
- Normalized invalid all-hidden cached workspace visibility before initial state creation in `WorkspaceProvider`, restoring it as Terminal-only while preserving valid cached states and the legacy missing-`showExplorer` default of `true`.
- Expanded unit coverage for single-panel resize behavior, order-independent terminal-only transitions, multi-panel preservation, rapid visibility changes, project/worktree retriggers, separator topology, and cached visibility restoration.
- Added Playwright browser geometry coverage for both reported toggle orders using a deterministic `layout-target` fixture project and Connected-status/real-width assertions.

### Test Results

- `npx vitest run src/components/workspace-layout.test.tsx src/lib/workspace-context.test.tsx` passed: 2 files, 73 tests.
- `npx playwright test e2e/workspace-layout.spec.ts` passed: 2 tests.

### Verification Targets for Verify

- Re-run focused unit tests if needed.
- Continue with full planned verification: lint, format check, build, full Vitest suite, and targeted Playwright geometry spec.
