# Test Plan: Issue #81

## Test TP1: Watcher helper batches and redacts filesystem events

- **Type:** Unit
- **Task:** T1
- **Priority:** High

### Setup
Use Vitest with mocked `chokidar` watcher objects, fake timers, and temporary path fixtures for project-root, worktree-root, nested directories, and `.git` metadata paths.

### Steps
1. Subscribe multiple clients to the same normalized project/worktree scope.
2. Emit create/delete/rename/change bursts through the mocked watcher.
3. Advance timers across 250 ms debounce and 1000 ms force-flush boundaries.
4. Emit more than 256 changed path hints.
5. Unsubscribe all clients.

### Expected Result
One shared watcher is used per scope, all emitted paths are relative POSIX paths, raw `.git` paths and absolute paths are redacted, git metadata produces status/root invalidation, batches debounce and cap correctly, `truncated: true` appears when capped, and the watcher closes after the last subscriber.

## Test TP2: SSE endpoint streams ready, changed, degraded, and rejects unsafe requests

- **Type:** API Integration
- **Task:** T2
- **Priority:** High

### Setup
Mock the watcher helper and project/worktree root resolution. Exercise `src/app/api/files/events/route.ts` with `NextRequest` instances for valid and invalid scopes, including same-origin and cross-origin headers.

### Steps
1. Open a valid stream for a project root and read the initial chunk.
2. Push a mocked watcher batch and read the streamed event.
3. Force a watcher degraded condition and read the degraded event.
4. Send missing slug, invalid worktree, project-not-found, unauthenticated, and mismatched-origin requests.
5. Abort a valid request.

### Expected Result
Valid streams use `text/event-stream`, emit `file-tree:ready`, `file-tree:changed`, heartbeat/degraded data as specified, and clean up on abort. Invalid/auth/origin requests return structured errors without watcher allocation. No event payload includes absolute paths, registry paths, tokens, or raw `.git` internals.

## Test TP3: Workspace invalidation refreshes root and loaded directories safely

- **Type:** Unit/Integration
- **Task:** T3
- **Priority:** High

### Setup
Use `WorkspaceProvider` tests with mocked `/api/files` responses for root, loaded directories, collapsed directories, worktree scope, and deleted selected-file scenarios.

### Steps
1. Seed workspace state with root nodes, expanded loaded directories, collapsed directories with `hasChildren`, and a selected file.
2. Apply scoped `file-tree:changed` invalidations for root changes, loaded child changes, directory rename/delete, empty transition, and git status update.
3. Resolve canonical `/api/files` refreshes in and out of order.
4. Repeat with stale project and stale worktree event scopes.

### Expected Result
Root and affected loaded directories refresh through canonical `/api/files` calls, expansion state is preserved, collapsed `hasChildren` metadata updates, empty directories render correctly, deleted selected files clear safely, and stale project/worktree events do not mutate visible state.

## Test TP4: EventSource hook handles lifecycle, retry, no-retry, and degraded fallback

- **Type:** Unit
- **Task:** T4, T6
- **Priority:** High

### Setup
Mock `window.EventSource`, document visibility, heartbeat timers, and WorkspaceContext sync callbacks. Use React Testing Library `renderHook` under Strict Mode.

### Steps
1. Render the hook for a project root and active worktree.
2. Emit ready, changed, degraded, parse-error, network-error, and heartbeat-timeout scenarios.
3. Advance retry/backoff fake timers.
4. Simulate auth/invalid-origin/invalid-parameter failures.
5. Remount under Strict Mode and change project/worktree scope.

### Expected Result
The hook constructs the correct URL, owns exactly one active EventSource per scope, dispatches changed events only after scope validation, retries recoverable failures with bounded backoff, starts degraded fallback only for recoverable cases, avoids retry/fallback for auth/invalid cases, detects heartbeat timeout, and cleans up stale streams/timers/listeners.

## Test TP5: Explorer sync status and retry UI is accessible and non-disruptive

- **Type:** Component
- **Task:** T5
- **Priority:** High

### Setup
Render `WorkspaceLayout` or the extracted Explorer header with mocked WorkspaceContext values for connecting, ready, syncing, degraded, error, unauthorized, and recovered states.

### Steps
1. Render each sync state with an existing file tree.
2. Query status elements and retry controls by accessible roles/names.
3. Activate Retry Sync in a degraded/retryable state.
4. Render concurrent root load errors and per-directory errors.

### Expected Result
Sync status uses visible text plus `role="status"` and `aria-live="polite"`, retry is keyboard-accessible only when valid, non-retryable states show actionable no-retry copy, existing tree/root/per-directory states remain visible, and no global spinner or remount appears for background sync.

## Test TP6: Degraded polling preserves the current 5000 ms fallback behavior

- **Type:** Unit/Component
- **Task:** T6
- **Priority:** High

### Setup
Use fake timers with mocked `refreshFileTree`, `useWorktrees`, document visibility, and EventSource degraded/unsupported states.

### Steps
1. Render with a ready SSE state and advance timers beyond 5000 ms.
2. Switch to degraded state and advance timers by 5000 ms.
3. Hide the document, advance multiple intervals, then show it again.
4. Start overlapping fallback refreshes and change project/worktree scope.
5. Force fallback polling failures.

### Expected Result
No primary polling occurs while SSE is ready. Degraded fallback ticks every 5000 ms, calls `refreshFileTree` directly, never mutates `fileTreeLoading`, pauses while hidden, catches up when visible, deduplicates overlapping refreshes, ignores stale scope responses, and preserves existing visible file-tree/worktree state on failure.

## Test TP7: External filesystem changes synchronize without reload

- **Type:** Integration / Playwright-style
- **Task:** T8
- **Priority:** High

### Setup
Run DevDeck against a temporary project fixture with the file explorer open. Prefer a test harness that can perform filesystem operations outside the React save flow while observing the UI. If full Playwright watcher coverage is not stable in CI, cover watcher-to-endpoint-to-context integration in Vitest and document the limitation.

### Steps
1. Create a new file externally and wait for the server-push timing window.
2. Modify a file externally and observe git status badge refresh.
3. Rename or delete a file externally.
4. Create/delete entries inside an already-loaded directory.
5. Force degraded mode and repeat a create/delete within the 5000 ms fallback window.

### Expected Result
External changes appear in the explorer without page reload, loaded directories update in place, collapsed directories update `hasChildren` metadata, git status changes refresh without `.git` path leakage, deleted selected files clear safely, and degraded fallback updates within one polling interval.

## Test TP8: `LLM.txt` documents the sync surfaces

- **Type:** Documentation Review
- **Task:** T7
- **Priority:** Medium

### Setup
Review `LLM.txt` after implementation paths are finalized.

### Steps
1. Confirm entries exist for `/api/files/events`, the watcher helper, `use-file-tree-sync`, WorkspaceContext sync APIs, and related tests.
2. Confirm the file states that 5000 ms polling is degraded fallback, not primary synchronization.
3. Confirm no absolute local paths, tokens, or implementation secrets are documented.

### Expected Result
Future agents can discover all new sync surfaces and fallback behavior from `LLM.txt` without reading the full implementation.

## Test TP9: Harness verification passes

- **Type:** Verification
- **Task:** T8
- **Priority:** High

### Setup
Use the repo-local harness described by `.harness/contract.yml`.

### Steps
1. Run targeted `./harness test` workflows during implementation.
2. Run `./harness verify` before handoff.
3. If a direct command is required for diagnostics, record the bypass with `./harness friction add`.

### Expected Result
`./harness verify` passes and covers lint, format check, build, unit/integration tests, and smoke verification according to the harness contract.
