# Implementation Notes: Issue #81

## Summary

Implemented the revised server-push file explorer synchronization architecture:

- primary `GET /api/files/events?slug=<slug>[&worktree=<relative-worktree>]` SSE invalidation stream;
- direct server-only `chokidar` watcher dependency and shared watcher helper;
- WorkspaceContext sync status/error/retry and scoped invalidation APIs;
- client `useFileTreeSync` EventSource lifecycle hook;
- accessible Explorer sync status/retry UI;
- existing 5000 ms root file-tree and worktree-list polling retained only as degraded fallback.

## Files Changed

- `package.json`, `package-lock.json` — added direct `chokidar` dependency.
- `src/server/file-tree-sync.ts`, `src/server/file-tree-sync.test.ts` — watcher registry, batching/redaction/resource caps/tests.
- `src/app/api/files/events/route.ts`, `src/app/api/files/events/route.test.ts` — SSE endpoint and route coverage.
- `src/hooks/use-file-tree-sync.ts`, `src/hooks/use-file-tree-sync.test.ts` — EventSource hook and lifecycle tests.
- `src/lib/types.ts` — shared file-tree sync event/status/error types.
- `src/lib/workspace-context.tsx`, `src/lib/workspace-context.test.tsx` — sync state APIs and scoped canonical invalidation.
- `src/components/workspace-layout.tsx`, `src/components/workspace-layout.test.tsx` — hook wiring, Explorer status/retry UI, degraded fallback polling.
- `src/hooks/use-worktrees.ts`, `src/hooks/use-worktrees.test.ts`, `src/components/worktree-tree.tsx`, `src/components/worktree-tree.test.tsx` — worktree polling gated to degraded fallback.
- `src/lib/file-tree-sync-integration.test.tsx` — EventSource-to-WorkspaceContext integration-style coverage for external create/delete invalidations.
- `src/lib/near-realtime-sync-contract.test.ts`, `LLM.txt` — updated contract/docs for server-push primary sync.
- `src/middleware.ts` — API auth failures now include `code: "AUTH_REQUIRED"`.

## Acceptance Criteria Coverage

- **T1:** Watchers are shared by normalized slug/worktree/root, ref-counted, cleaned up on final unsubscribe/abort, debounced at 250 ms, force-flushed at 1000 ms, capped at 256 path hints, and redact absolute/`.git` internals while surfacing safe git metadata invalidation.
- **T2:** SSE route uses Node runtime, EventSource headers, structured auth/origin/scope rejection before watcher allocation, ready/changed/degraded events, heartbeat comments plus ready heartbeat frames, path sanitization, and abort cleanup.
- **T3:** WorkspaceContext exposes sync status/error/retry/fallback/invalidation APIs and refreshes root/loaded directories through canonical no-store `/api/files` calls while preserving expansion, updating `hasChildren`, handling empty transitions, ignoring stale scopes, and clearing deleted selected files only when a canonical refresh proves deletion.
- **T4:** `useFileTreeSync` covers URL construction, EventSource cleanup, ready/changed/degraded parsing, stale-scope rejection, retry/backoff, heartbeat timeout, non-retry auth/validation classification, manual retry, and Strict Mode cleanup.
- **T5:** Explorer header renders visible `role="status"` / `aria-live="polite"` sync text and a keyboard-accessible Retry Sync button only for retryable states without replacing existing loading/error/empty tree UI.
- **T6:** Root and worktree polling are disabled during normal SSE connecting/ready states and run only when degraded fallback is active.
- **T7:** `LLM.txt` documents the endpoint, watcher helper, hook, WorkspaceContext APIs, event schema, tests, and degraded fallback behavior.
- **T8:** Added integration-style Vitest coverage for EventSource invalidations updating WorkspaceContext for external create/delete flows.

## Corrective Fix: SSE Preflight Validation

- Added `GET /api/files/events?...&preflight=1` handling that runs the same auth, origin, slug, worktree, and scope validation as the SSE route, returns structured JSON success/failure responses, and returns before `subscribeFileTreeChanges(...)` so no watcher is allocated during preflight.
- Updated `useFileTreeSync` to fetch the same-origin preflight URL with `{ cache: "no-store" }` before opening `EventSource`, abort in-flight preflights during cleanup/scope changes, and use preflight JSON/status to classify auth/origin/slug/worktree/parameter failures as non-retryable without relying on native `EventSource.onerror` details.
- Extended route, hook, and integration coverage for preflight rejection before watcher allocation, non-retry hook behavior without mocked EventSource status, successful preflight opening exactly one EventSource, and in-flight preflight abort cleanup.

## Test Results

- Corrective preflight targeted diagnostics passed:
  - `npm run test -- src/app/api/files/events/route.test.ts src/hooks/use-file-tree-sync.test.ts src/lib/file-tree-sync-integration.test.tsx`
  - Result: 3 files / 24 tests passed at `2026-06-15T10:48:34Z`.
- Latest harness:
  - `./harness verify --json` passed at `2026-06-15T10:51:16Z` with lint, format check, build, test, and smoke passing.
  - Final evidence file: `.harness/evidence/verify-20260615T105022Z-40832.json`.
- Targeted direct diagnostics passed:
  - `npm run test -- src/server/file-tree-sync.test.ts src/app/api/files/events/route.test.ts src/hooks/use-file-tree-sync.test.ts src/lib/workspace-context.test.tsx src/components/workspace-layout.test.tsx src/hooks/use-worktrees.test.ts src/components/worktree-tree.test.tsx src/components/file-tree.test.tsx src/lib/file-tree-sync-integration.test.tsx src/lib/near-realtime-sync-contract.test.ts`
  - Result: 10 files / 155 tests passed.
- Previous harness baseline:
  - `./harness test --json` passed at `2026-06-15T10:19:28Z`.
  - `./harness verify --json` passed at `2026-06-15T10:31:15Z` with lint, format check, build, test, and smoke passing.
  - Final evidence file: `.harness/evidence/verify-20260615T103025Z-34268.json`.

## Limitations / Friction

- Full Playwright UI coverage for real external filesystem operations was not added in this implementation pass. Instead, Vitest covers watcher helper behavior, SSE route streaming/sanitization, hook lifecycle, WorkspaceContext invalidation, and an EventSource-to-WorkspaceContext integration flow. Final Verify can decide whether to add browser E2E coverage.
- Direct Vitest/format/build/port diagnostic commands were used after harness verdicts lacked raw failure or port-owner details; each bypass was recorded with `./harness friction add`.
- Final `./harness verify --json` reruns exposed a transient formatting miss and lingering smoke-port listeners; formatting was corrected manually, the specific `next-server` PIDs were stopped, and verification passed on rerun.
