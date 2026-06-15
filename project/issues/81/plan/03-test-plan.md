# Test Plan: Issue #81

## Test TP1: Root file-tree polling ticks silently

- **Type:** Unit/Component
- **Task:** T1
- **Priority:** High

### Setup
Use Vitest fake timers against `WorkspaceLayout` or the dedicated polling hook. Mock `useWorkspace()` with `refreshFileTree`, `setFileTreeLoading`, active project, and active worktree state.

### Steps
1. Render the active workspace with `fileTreeLoading=false`.
2. Advance fake timers by 5000 ms.
3. Resolve any returned refresh promise.
4. Repeat while an initial/manual refresh promise is already in flight.

### Expected Result
`refreshFileTree` is called for the active project on interval ticks, `setFileTreeLoading` is not called by polling, ExplorerContent does not show the global spinner for polling-only refreshes, and overlapping refreshes rely on existing in-flight deduplication.

## Test TP2: File-tree polling pauses hidden and catches up visible

- **Type:** Unit/Component
- **Task:** T1
- **Priority:** High

### Setup
Mock `document.visibilityState` and `document.addEventListener` / `removeEventListener`. Use fake timers.

### Steps
1. Render the workspace while visible and confirm the interval is active.
2. Switch visibility to hidden and dispatch `visibilitychange`.
3. Advance fake timers beyond multiple intervals.
4. Switch visibility back to visible and dispatch `visibilitychange`.
5. Unmount the workspace.

### Expected Result
No refresh calls occur while hidden. Exactly one immediate catch-up refresh occurs when visible. Timers and listeners are removed on unmount.

## Test TP3: File-tree polling respects project/worktree scope

- **Type:** Unit/Integration
- **Task:** T1, T3
- **Priority:** High

### Setup
Use existing `WorkspaceProvider.refreshFileTree` tests with mocked fetch promises and active worktree changes.

### Steps
1. Start a poll-driven root refresh for project root.
2. Change active worktree and trigger another tick.
3. Resolve the older request after the context changed.
4. Repeat with a project slug change.

### Expected Result
Fetch URLs include the active worktree when set, omit it for project root, deduplicate same scoped keys, and ignore stale project/worktree responses.

## Test TP4: Worktree list co-refresh uses no-store polling

- **Type:** Unit
- **Task:** T2
- **Priority:** High

### Setup
Use `renderHook` for `useWorktrees`, fake timers, and mocked `fetch`/`AbortController` behavior.

### Steps
1. Render `useWorktrees("demo")`.
2. Confirm the initial fetch uses `/api/worktrees?slug=demo`.
3. Advance fake timers by 5000 ms.
4. Trigger manual `refresh()`.
5. Start a slow request and advance another interval.

### Expected Result
Initial/manual/poll fetches use no-store behavior, interval ticks refresh the list, and same-slug polling avoids overlapping requests while one is in flight.

## Test TP5: Worktree polling visibility and cleanup

- **Type:** Unit/Component
- **Task:** T2
- **Priority:** High

### Setup
Mock document visibility and render `useWorktrees` or `WorktreeTree` with fake timers.

### Steps
1. Hide the document and advance timers.
2. Show the document and dispatch `visibilitychange`.
3. Rerender with a different slug.
4. Unmount while a request is pending.

### Expected Result
Hidden documents do not poll. Visible restoration triggers one catch-up refresh. Slug changes abort or ignore stale responses. Unmount removes timers/listeners and aborts the pending request.

## Test TP6: Missing active worktree resets after co-refresh

- **Type:** Component
- **Task:** T2, T3
- **Priority:** Medium

### Setup
Use `WorktreeTree` tests with mocked `useWorktrees()` results and mocked `useWorkspace()` active worktree state.

### Steps
1. Render with `activeWorktree=".trees/deleted"` and loading true.
2. Rerender after refresh with a worktree list that does not include `deleted`.
3. Observe `setActiveWorktree` and toast behavior.

### Expected Result
No reset happens while loading. After the refreshed list omits the active worktree, `setActiveWorktree(null)` runs and the existing non-fatal warning is shown.

## Test TP7: Harness verification

- **Type:** Verification
- **Task:** T4
- **Priority:** High

### Setup
Use the repo-local harness described by `.harness/contract.yml`.

### Steps
1. Run `./harness test` after targeted polling tests pass.
2. Run `./harness verify` before implementation completion.
3. If a direct command is required for diagnostics, record the bypass with `./harness friction add`.

### Expected Result
`./harness test` and `./harness verify` pass. Verification covers lint, format check, build, tests, and smoke through the harness contract.
