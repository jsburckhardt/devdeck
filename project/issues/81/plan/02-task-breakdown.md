# Task Breakdown: Issue #81

## Task T1: Add server-side file sync watcher helper

- **Status:** Planned
- **Complexity:** Large
- **Dependencies:** None
- **Related ADRs:** ADR-0002, ADR-0004, ADR-0007
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008, CORE-COMPONENT-0009

### Description
Add the server-only watcher foundation required by `/api/files/events`. Introduce `chokidar` as a direct dependency and implement a helper (for example `src/server/file-tree-sync.ts` or equivalent Node-only module) that resolves project/worktree roots, shares watchers by normalized scope, ref-counts subscribers, debounces raw filesystem events, caps payloads, redacts paths, and reports degraded conditions.

### Acceptance Criteria
- `chokidar` is added as a direct server-side dependency in package metadata.
- Watchers are keyed by normalized `slug + worktree + resolved root` and shared across subscribers.
- Watcher subscriber lifecycle is ref-counted and closes the underlying watcher when the final subscriber disconnects.
- Roots are resolved server-side with existing project/worktree helpers; no absolute filesystem paths are exposed to caller payloads.
- Emitted path hints are POSIX-style paths relative to the effective project/worktree root.
- `.git` browse contents are not emitted, while safe git metadata changes still produce status/root invalidation signals.
- Raw events are debounced for 250 ms, force-flushed by 1000 ms, and capped at 256 relative path hints.
- Watcher/subscriber/resource caps produce a degraded result instead of unbounded watcher creation.
- `./harness test` can run the targeted watcher-helper tests before endpoint work begins.

### Test Coverage
- Add unit tests with a mocked watcher implementation for scope keying, subscriber ref-count cleanup, and abort handling.
- Add unit tests for path normalization, absolute path redaction, `.git` metadata invalidation, and POSIX relative output.
- Add fake-timer tests for 250 ms debounce, 1000 ms force flush, 256-path cap, and `truncated: true` behavior.
- Add resource-cap tests that assert degraded results and no leaked watcher instances.

## Task T2: Add `/api/files/events` SSE endpoint

- **Status:** Planned
- **Complexity:** Large
- **Dependencies:** T1
- **Related ADRs:** ADR-0002, ADR-0004, ADR-0007
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008, CORE-COMPONENT-0009

### Description
Implement `GET /api/files/events?slug=<slug>[&worktree=<relative-worktree>]` as the primary server-push invalidation transport. The route must be EventSource-compatible, same-origin/auth protected, scoped to project/worktree roots, and responsible for streaming `file-tree:ready`, `file-tree:changed`, heartbeat, and `file-tree:degraded` events while cleaning up subscribers on abort.

### Acceptance Criteria
- The route runs in the Next.js Node.js runtime and returns `text/event-stream` with no-store/keep-alive compatible headers.
- Valid connections receive a `file-tree:ready` event with the resolved scope and fallback `pollIntervalMs: 5000`.
- Watcher batches stream `file-tree:changed` events using the schema from CORE-COMPONENT-0008.
- Recoverable watcher setup/resource failures stream `file-tree:degraded` with a code, message, retry hint, and fallback polling interval.
- Missing slug, invalid slug, invalid worktree, project-not-found, and worktree-not-found cases return structured errors and do not allocate watchers.
- Cross-origin requests with a mismatched `Origin` header are rejected before watcher allocation.
- Auth behavior remains compatible with `src/middleware.ts` and the `devdeck_token` cookie; unauthenticated API access returns a structured auth failure.
- Client disconnect/abort removes the subscriber and releases watcher references.
- Events never include absolute filesystem paths, registry paths, auth tokens, or raw `.git` paths.

### Test Coverage
- Add route tests for successful ready/changed/degraded streaming with mocked watcher helper output.
- Add route tests for missing/invalid parameters, invalid worktree, project-not-found, auth failure, and invalid origin.
- Add route tests proving watcher allocation does not happen for rejected requests.
- Add abort/cleanup tests proving subscriber removal and watcher release.
- Add assertions that event payloads contain relative paths only and no `.git` internals.

## Task T3: Extend WorkspaceContext with scoped invalidation and sync state

- **Status:** Planned
- **Complexity:** Large
- **Dependencies:** T2
- **Related ADRs:** ADR-0002, ADR-0007
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008, CORE-COMPONENT-0009

### Description
Add shared file-tree sync types and extend `WorkspaceContext` with `fileTreeSyncStatus`, `fileTreeSyncError`, `retryFileTreeSync`, and `invalidateFileTreeScope`. The invalidation API must keep `/api/files` as canonical, refresh root and affected loaded directories, preserve UI state, update collapsed directory metadata, handle empty transitions, and ignore stale project/worktree events.

### Acceptance Criteria
- Shared TypeScript types represent `FileTreeSyncScope`, `FileTreeSyncStatus`, and ready/changed/degraded event payloads.
- `WorkspaceContext` exposes sync status, sync error, manual retry, and scoped invalidation APIs.
- Scoped invalidation ignores events for stale project slugs, stale worktrees, inactive worktrees, and obsolete generations.
- Root invalidation calls `refreshFileTree(...)` without mutating `fileTreeLoading`.
- Loaded-directory invalidation reloads affected loaded directories via canonical `loadDirectoryChildren(...)`.
- Directory create/delete/rename cases update `children`, `childrenLoaded`, `hasChildren`, and empty-directory rendering correctly.
- Collapsed directories receive updated `hasChildren` metadata through refreshed parent/root listings without forcing expansion.
- If a selected file is proven deleted by a canonical refresh for its loaded scope, `selectedFile` is cleared without crashing `FileViewer`.
- Existing root/worktree state save/restore behavior remains intact.

### Test Coverage
- Extend `workspace-context.test.tsx` for root invalidation, loaded-directory invalidation, collapsed `hasChildren`, and empty/non-empty transitions.
- Add stale-scope tests for project slug, active worktree, request generation, and obsolete directory refreshes.
- Add selected-file deletion tests that assert safe selection clearing.
- Add tests that invalidation uses existing no-store `/api/files` requests and preserves expansion state.

## Task T4: Implement client `useFileTreeSync` EventSource hook

- **Status:** Planned
- **Complexity:** Large
- **Dependencies:** T2, T3
- **Related ADRs:** ADR-0002, ADR-0004, ADR-0007
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008, CORE-COMPONENT-0009

### Description
Create a client-only hook (for example `src/hooks/use-file-tree-sync.ts`) that owns EventSource lifecycle, scoped URL construction, event parsing, heartbeat timeout detection, bounded retry/backoff, degraded fallback handoff, no-retry classification for auth/validation failures, and Strict Mode cleanup.

### Acceptance Criteria
- The hook constructs `/api/files/events?slug=<slug>[&worktree=<relative-worktree>]` with encoded query parameters.
- The hook is SSR/jsdom safe and no-ops when `window`, `document`, or EventSource is unavailable.
- The hook opens exactly one active EventSource per mounted active scope, including React Strict Mode remounts.
- `file-tree:ready` sets status to ready and stops degraded fallback polling.
- `file-tree:changed` validates scope and calls `invalidateFileTreeScope(...)`.
- `file-tree:degraded` sets degraded status and starts fallback polling when recoverable.
- Recoverable connection errors retry with bounded exponential backoff before entering degraded fallback.
- Auth, invalid-origin, invalid slug, invalid worktree, and invalid-parameter failures are non-retryable and do not start fallback polling.
- Heartbeat timeout closes stale streams and follows the recoverable retry/degraded path.
- Manual retry closes stale EventSource instances and restarts the active scope without remounting the explorer.

### Test Coverage
- Add hook tests with a mocked EventSource for URL construction, ready/changed/degraded event handling, parse errors, and stale-scope rejection.
- Add fake-timer tests for retry/backoff, heartbeat timeout, and degraded fallback handoff.
- Add Strict Mode tests proving duplicate mounts clean up stale connections.
- Add no-retry tests for auth, invalid-origin, invalid slug/worktree, and invalid-parameter classifications.

## Task T5: Wire Explorer sync status and retry UI

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T3, T4
- **Related ADRs:** ADR-0002, ADR-0007
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0007, CORE-COMPONENT-0008, CORE-COMPONENT-0009

### Description
Surface file-tree sync state in the Explorer header without disrupting existing root loading, root error, per-directory error, or empty states. The UI must announce connecting/ready/syncing/degraded/error states accessibly and expose retry only when retry is valid.

### Acceptance Criteria
- Explorer header renders a visible sync status element for connecting, syncing, degraded, error, unauthorized, and ready/recovered states.
- Status text uses `role="status"` and `aria-live="polite"` for non-fatal sync state changes.
- Non-retryable auth/invalid-parameter failures show actionable text and no automatic retry loop.
- Degraded/retryable states render a keyboard-accessible Retry Sync control wired to `retryFileTreeSync()`.
- Sync UI does not replace root `fileTreeLoading`, root load error+retry, per-directory retry, or empty directory states.
- Background sync does not cause Explorer remounts, scroll jumps, selected-file loss, or global spinner flashes.

### Test Coverage
- Extend `workspace-layout.test.tsx` or Explorer component tests for every sync status state and retry button behavior.
- Add accessibility assertions for `role="status"`, `aria-live`, labels/titles, keyboard activation, and non-color-only status communication.
- Add regression tests proving root load and per-directory errors still render independently of sync status.

## Task T6: Preserve 5000 ms polling as degraded fallback

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T4, T5
- **Related ADRs:** ADR-0002, ADR-0007
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008, CORE-COMPONENT-0009

### Description
Refactor the current polling implementation so it is retained as degraded fallback rather than primary synchronization. Root file-tree fallback polling and worktree list fallback polling must remain visibility-aware, no-store, deduplicated, stale-guarded, and silent.

### Acceptance Criteria
- No primary 5000 ms root file-tree interval runs while the SSE stream is ready or connecting normally.
- Root file-tree fallback polling starts only when EventSource is unsupported, recoverable retries are exhausted, heartbeat fails, or a recoverable `file-tree:degraded` event is received.
- Fallback poll ticks call `refreshFileTree(project.slug)` directly and never call initial-load wrappers or mutate `fileTreeLoading`.
- Fallback polling pauses while `document.visibilityState === "hidden"` and catches up immediately when visible.
- Worktree list polling remains available as degraded fallback with no-store requests, same-slug overlap prevention, stale slug protection, and cleanup.
- Fallback failures preserve existing visible file-tree/worktree state and sync status remains degraded/retryable.

### Test Coverage
- Update polling tests to assert polling is inactive during ready/connecting SSE states and active only during degraded fallback.
- Use fake timers and mocked visibility to assert 5000 ms ticks, hidden pause, visible catch-up, cleanup, and no `fileTreeLoading` mutation.
- Extend `use-worktrees.test.ts` for degraded fallback gating, no-store fetches, overlap prevention, stale/aborted slug responses, and listener cleanup.

## Task T7: Update `LLM.txt` repository map

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T1, T2, T3, T4, T5, T6
- **Related ADRs:** ADR-0007
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0008, CORE-COMPONENT-0009

### Description
Update `LLM.txt` so future agents can discover the new sync endpoint, hook, server helper, event schema/types, degraded fallback polling behavior, and relevant tests.

### Acceptance Criteria
- `LLM.txt` references `src/app/api/files/events/route.ts`.
- `LLM.txt` references the server-side file sync watcher helper path chosen in T1.
- `LLM.txt` references `src/hooks/use-file-tree-sync.ts` and the WorkspaceContext sync/invalidation APIs.
- `LLM.txt` mentions that existing 5000 ms polling is degraded fallback, not primary sync.
- Documentation wording avoids implementation secrets and absolute local paths.

### Test Coverage
- No dedicated runtime tests are required for the repo map.
- Include `LLM.txt` in final review and rely on `./harness verify` formatting/build/test coverage for repository-wide validation.

## Task T8: Complete integration coverage and harness verification

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1, T2, T3, T4, T5, T6, T7
- **Related ADRs:** ADR-0002, ADR-0004, ADR-0007
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008, CORE-COMPONENT-0009

### Description
Add cross-surface integration or Playwright-style coverage for external filesystem changes and use the repository harness as the implementation completion gate.

### Acceptance Criteria
- External create/delete/rename flows appear in the explorer through server-push invalidation without page reload.
- Git status/index changes refresh status badges without exposing `.git` paths.
- Loaded-directory changes update already-expanded directories while collapsed directories update `hasChildren` metadata.
- Degraded fallback mode updates the explorer within the 5000 ms fallback window.
- `./harness test` passes for the targeted unit/integration suites.
- `./harness verify` passes before handoff.
- Any direct command used instead of a harness verb for diagnostics is recorded with `./harness friction add`.

### Test Coverage
- Add integration tests using temporary project fixtures and mocked/real watcher boundaries as feasible in Vitest.
- Add Playwright or integration-style coverage for create/delete/rename visible in Explorer without reload when the dev server supports the stream.
- Add degraded fallback integration coverage by forcing watcher/EventSource degradation and advancing fake or controlled timers.
- Final verification must include `./harness verify`.
