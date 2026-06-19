# Action Plan: Server-Push File Explorer Synchronization

## Feature
- **ID:** 81
- **Research Brief:** project/issues/81/research/00-research.md

## ADRs Created
- [ADR-0007: Filesystem Sync Transport Strategy - Server-Push SSE with Polling Fallback](../../../architecture/ADR/ADR-0007-filesystem-sync-transport-strategy.md)

## Core-Components Created
- None created.
- Amended [CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State](../../../architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md) to supersede polling-primary Decisions #198-#206, define `/api/files/events` SSE invalidation, loaded-directory invalidation, sync status/retry API, stale scope handling, and degraded 5000 ms fallback polling.
- Amended [CORE-COMPONENT-0005: Error Handling](../../../architecture/core-components/CORE-COMPONENT-0005-error-handling.md) to define file-tree sync degraded/error handling, accessible live status, bounded retry, no-retry auth/invalid-param states, and fallback polling behavior.

## Implementation Tasks
1. Add the server-side file sync watcher helper and direct `chokidar` dependency.
2. Add `GET /api/files/events` SSE endpoint for `file-tree:ready`, `file-tree:changed`, and `file-tree:degraded`.
3. Extend shared sync types and `WorkspaceContext` with scoped invalidation, sync status, sync error, and retry APIs.
4. Implement the client `useFileTreeSync` EventSource hook with stale-scope cleanup, retry/backoff, heartbeat timeout, and degraded fallback handoff.
5. Wire Explorer status/retry UI with accessible `role="status"` / `aria-live` semantics.
6. Preserve the current 5000 ms polling implementation as degraded fallback for root file-tree and worktree list refresh, not as primary sync.
7. Update `LLM.txt` with the new endpoint, hook, server helper, event schema, and fallback references.
8. Complete integration/regression coverage and run `./harness verify`.

## Architecture Direction
- Use SSE `/api/files/events?slug=<slug>[&worktree=<relative-worktree>]` as the primary server-push invalidation transport.
- Use existing `/api/files` root and directory responses as the only canonical file-tree data source after invalidation.
- Use a shared, ref-counted `chokidar` watcher registry keyed by normalized project/worktree scope and resolved root.
- Debounce watcher bursts for 250 ms, force-flush by 1000 ms, cap changed path hints at 256 per event, and degrade when watcher/subscriber/resource limits are exceeded.
- Never send absolute filesystem paths or raw `.git` paths to the browser; use POSIX-style relative path hints and git-status/root invalidation flags.
- Preserve the existing 5000 ms polling behavior as degraded fallback only; fallback polling must stay visibility-aware and silent.
- Treat authentication, invalid-origin, invalid slug, invalid worktree, and invalid parameter failures as non-retryable sync errors that do not enter fallback polling.
- Verify through targeted unit/integration tests during implementation and `./harness verify` before handoff.
