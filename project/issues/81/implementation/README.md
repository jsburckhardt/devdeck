# Implementation Notes: Issue #81

## Summary

Implemented near-realtime file explorer synchronization with fixed 5000 ms client-side
polling for:

- the active workspace root file tree via `refreshFileTree(project.slug)`;
- the active project's worktree list via `GET /api/worktrees?slug=<slug>` with
  `cache: "no-store"`.

No server-push, SSE/EventSource, filesystem watcher, chokidar dependency, or
configurable polling interval was introduced. The implementation stays within
`CORE-COMPONENT-0008` Decisions #198-#206.

## Files Changed

- `src/components/workspace-layout.tsx`
- `src/components/workspace-layout.test.tsx`
- `src/hooks/use-worktrees.ts`
- `src/hooks/use-worktrees.test.ts`
- `src/lib/workspace-context.test.tsx`
- `src/lib/near-realtime-sync-contract.test.ts`
- `.harness/friction.jsonl`
- `project/issues/81/implementation/README.md`

## Task Results

### T1: Visibility-aware root file-tree polling

- Added a browser-guarded polling lifecycle in `WorkspaceLayout`.
- Uses a fixed `5000` ms interval.
- Calls `refreshFileTree(project.slug)` directly and does not call
  `loadRootFileTree` or mutate `fileTreeLoading`.
- Pauses while hidden, catches up immediately on visible, and cleans up timers
  and listeners on unmount/project/worktree changes.
- Added fake-timer coverage for ticks, hidden pause, visible catch-up, cleanup,
  and overlap with initial refresh.

### T2: Worktree list co-refresh

- Extended `useWorktrees` with the same fixed interval and visibility lifecycle.
- All worktree fetches use `cache: "no-store"`.
- Poll ticks skip overlapping same-slug requests.
- Slug changes and unmount abort stale requests; stale/aborted responses are
  ignored.
- Poll failures preserve the existing worktree list.
- Existing initial/manual refresh loading and error behavior remains available.

### T3: Regression coverage

- Added coverage for non-disruptive root refresh failures preserving selected
  file, expanded folders, and loaded child subtrees.
- Preserved existing WorktreeTree missing-active-worktree reset coverage.
- Added a contract regression test proving the implementation uses fixed client
  polling and does not add server-push/watch/config interval surfaces.

### T4: Harness verification

- `./harness test --json` passed after T1, T2, and T3.
- `./harness verify --json` passed after T1, T2, and T3 once lingering smoke
  servers on port 9999 were stopped.
- Final `./harness test --json` passed at `2026-06-15T09:18:58Z`.
- Final `./harness verify --json` passed at `2026-06-15T09:19:51Z`.

## Test Results

- Targeted diagnostics:
  - `npm run test -- src/components/workspace-layout.test.tsx` passed.
  - `npm run test -- src/hooks/use-worktrees.test.ts` passed.
  - `npm run test -- src/hooks/use-worktrees.test.ts src/lib/workspace-context.test.tsx src/lib/near-realtime-sync-contract.test.ts`
    passed.
- Harness:
  - `./harness test --json` passed.
  - `./harness verify --json` passed with lint, format check, build, tests, and
    smoke all passing.
  - Final evidence file:
    `.harness/evidence/verify-20260615T091902Z-15360.json`.

## Friction / Deviations

- No architectural deviations were required.
- Direct diagnostic commands were used only after harness output was too large or
  suppressed details needed to fix failures; each bypass was recorded with
  `./harness friction add`.
- `./harness verify` intermittently reported smoke as degraded because a
  previous `next-server` process remained on port 9999. The specific listening
  PID was inspected and stopped with `kill <PID>`, then verification passed.
