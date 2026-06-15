# Task Breakdown: Issue #81

## Task T1: Add visibility-aware root file-tree polling

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008 (Decisions #198-#203, #205-#206), CORE-COMPONENT-0005 (Error Handling), CORE-COMPONENT-0006 (Decisions #18-#19), CORE-COMPONENT-0009 (Decision #147)

### Description
Implement client-side polling for the active workspace root file tree at the workspace boundary (`WorkspaceLayout` or a dedicated hook used by it). The poller must call the existing `refreshFileTree(...)` path directly and preserve the current silent refresh, no-store, deduplication, stale-response, and root merge behavior.

### Acceptance Criteria
- A fixed v1 interval of 5000 ms is used for active root file-tree polling.
- Polling is client-only and guards `document`/timer access with browser checks for SSR and jsdom safety.
- Poll ticks call `refreshFileTree(project.slug)` or equivalent direct context refresh and never call `loadRootFileTree`, `setFileTreeLoading(true)`, or any wrapper that shows the initial global spinner.
- Polling refreshes only the active root file tree; loaded child directories remain lazy and are not periodically polled.
- Polling pauses while `document.visibilityState === "hidden"` and does not schedule interval refreshes while hidden.
- A visibility change back to visible triggers one immediate catch-up `refreshFileTree(...)` before the next interval.
- Project changes, active worktree changes, unmount, and rerender cleanup clear old timers/listeners so stale contexts cannot keep polling.
- Existing `refreshFileTree` request deduplication prevents duplicate network calls when a poll tick overlaps an in-flight initial load or manual refresh.
- Existing stale slug/worktree guards prevent late poll responses from overwriting the active tree.
- Running `./harness test` for the relevant workspace tests is expected to pass before moving to T2.

### Test Coverage
- Add or extend `src/components/workspace-layout.test.tsx` or a dedicated hook test with Vitest fake timers for 5000 ms interval ticks.
- Assert poll ticks call `refreshFileTree` and never call `setFileTreeLoading`.
- Mock `document.visibilityState` and dispatch `visibilitychange` to assert hidden pause and visible catch-up.
- Assert unmount/project/worktree changes remove timers and visibility listeners.
- Include regression coverage that overlapping initial/manual refreshes rely on existing `refreshFileTree` deduplication.

## Task T2: Co-refresh active project worktree lists

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008 (Decisions #201-#206), CORE-COMPONENT-0005 (Error Handling), CORE-COMPONENT-0006 (Decisions #18-#19), CORE-COMPONENT-0009 (Decision #147)

### Description
Extend `useWorktrees` and/or its `WorktreeTree` caller so the active project's worktree list refreshes near realtime with the same 5000 ms interval, document visibility pause/resume, and cleanup behavior as the root file-tree poller.

### Acceptance Criteria
- Worktree list polling uses `GET /api/worktrees?slug=<slug>` with `{ cache: "no-store" }` or equivalent no-store behavior.
- Initial load and manual `refresh()` behavior remain available and continue to surface loading/error state appropriately.
- Interval poll ticks avoid overlapping same-slug requests; slug changes abort or ignore stale requests.
- Polling is disabled when `slug` is undefined and resets worktree state consistently with the existing hook behavior.
- Polling pauses while the document is hidden and triggers an immediate catch-up refresh when visibility returns.
- Polling cleanup removes timers/listeners and aborts any stale request on unmount or slug change.
- Existing `WorktreeTree` behavior still resets a missing active worktree to project root with the non-fatal notice after a refreshed list no longer includes it.
- Running `./harness test` for `use-worktrees` and `worktree-tree` coverage is expected to pass before moving to T3.

### Test Coverage
- Extend `src/hooks/use-worktrees.test.ts` with fake-timer tests for interval refresh, no-store fetch options, hidden pause, visible catch-up, undefined slug behavior, cleanup, and stale/aborted slug responses.
- Add coverage that same-slug polling does not create overlapping requests while one is in flight.
- Extend `src/components/worktree-tree.test.tsx` as needed to assert refreshed lists still trigger missing active worktree reset behavior.

## Task T3: Verify non-disruptive synchronization regressions

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T1, T2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008 (Decisions #198-#206), CORE-COMPONENT-0005 (Error Handling), CORE-COMPONENT-0006 (Decisions #18-#19), CORE-COMPONENT-0009 (Decisions #146-#150)

### Description
Add final regression coverage tying the file-tree and worktree polling paths to the existing workspace contracts so near-realtime synchronization stays silent, scoped, and safe.

### Acceptance Criteria
- ExplorerContent remains mounted and does not render the global spinner when only polling-driven `fileTreeRefreshing` is true.
- Polling does not clear selected file, expanded folders, loaded child subtrees, or existing visible tree/list state on transient failures.
- Polling requests include active worktree context when set and project-root context when unset.
- Stale project or worktree poll responses are ignored.
- No new ADR, server push endpoint, filesystem watcher, SSE/EventSource, `chokidar`, or config-file interval option is introduced.
- Any direct command used instead of a harness verb for debugging is recorded with `./harness friction add`.

### Test Coverage
- Extend existing `workspace-context.test.tsx` and `workspace-layout.test.tsx` regressions where needed for active worktree request URLs, stale response handling, and no global spinner behavior.
- Ensure failure-path tests prove existing file tree and worktree list state are preserved during transient poll failures.
- Run `./harness test` after all polling tests pass.

## Task T4: Run harness verification

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T3
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006 (Decision #18), CORE-COMPONENT-0009 (Decisions #146-#150), CORE-COMPONENT-0008 (Decisions #198-#206)

### Description
Use the repository harness as the completion gate for the implementation stage.

### Acceptance Criteria
- `./harness test` passes after the polling lifecycle and worktree co-refresh tests are added.
- `./harness verify` passes before handing the issue to Verify.
- Harness output or evidence confirms lint, format check, build, tests, and smoke verification ran according to `.harness/contract.yml`.
- Any harness degradation or bypass is documented with `./harness friction add` and called out in implementation notes.

### Test Coverage
- Harness verification covers `npm run lint`, `npm run format:check`, `npm run build`, `npm run test`, and the configured smoke step through `./harness verify`.
- Final evidence must include passing coverage for the updated workspace, worktree, and near-realtime polling tests.
