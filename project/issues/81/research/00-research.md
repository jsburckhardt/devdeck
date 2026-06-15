# Research Brief: feat(file-explorer): synchronize tree with filesystem changes in near realtime

## GitHub Issue
- **Issue:** #81
- **Title:** feat(file-explorer): synchronize tree with filesystem changes in near realtime
- **URL:** https://github.com/jsburckhardt/devdeck/issues/81

## Scope Classification
- **Scope Type:** issue

## Problem Statement

The DevDeck file explorer tree currently reflects the filesystem state only at specific, user-triggered moments:

1. **Initial project/worktree load** - `WorkspaceLayout` fires a `useEffect` on `[activeWorktree, project.slug, loadRootFileTree]` mount/change, calling `loadRootFileTree(project.slug)` which sets `fileTreeLoading=true`, calls `refreshFileTree(slug)`, then clears the loading flag.
2. **After a successful `FileViewer` save** - `FileViewer` calls `refreshFileTree()` after a successful `PUT /api/files/content` response (Decision #61, CORE-COMPONENT-0008).
3. **Manual retry** - `ExplorerContent` exposes a retry button that calls `loadRootFileTree` when the tree is empty and an error is present.

Changes made via the terminal, external editors, or background processes are not reflected until one of the above triggers fires. A user working in the integrated terminal who creates, deletes, or moves files sees a stale tree until they switch projects or tabs, save a file in the viewer, or hard-reload.

The issue requests that the file explorer synchronize with filesystem changes in near realtime, meaning the tree should update within a few seconds of actual filesystem changes without requiring explicit user action beyond the normal editing workflow.

## Existing Context

### Refresh Infrastructure

The core refresh mechanism is already implemented in `src/lib/workspace-context.tsx` and is designed for silent, non-disruptive refreshes:

- `refreshFileTree(explicitSlug?: string)` fetches `GET /api/files?slug=<slug>[&worktree=<wt>]` with `{ cache: "no-store" }` (Decision #59).
- Refreshes are deduplicated by `slug + activeWorktree + path` via the in-flight request map (Decision #70).
- Responses are guarded against stale project/worktree contexts and ignored when they target obsolete state (Decision #106).
- `refreshFileTree` mutates `fileTreeRefreshing`, not `fileTreeLoading`, so `ExplorerContent` does not show a global spinner during silent refreshes (Decisions #60 and #62).
- Root refreshes merge with existing tree state so previously loaded child subtrees and expansion state can survive root updates.

### File API Behavior

`src/app/api/files/route.ts` handles file tree reads and already supports the relevant scoping:

- Reads direct directory entries for root or path-scoped tree requests.
- Runs `git status --porcelain -u` on each tree request so status badges can reflect current repository state.
- Applies the server-side default exclusion list, including `.git` (Decision #73).
- Supports optional `worktree` parameters for worktree-scoped file APIs (Decision #107).
- Resolves worktree roots server-side with escape protection (Decision #108).

Because `refreshFileTree` uses `cache: "no-store"`, periodic root refreshes would bypass browser caching even though the API route returns caching headers.

### Worktree List Behavior

`src/hooks/use-worktrees.ts` fetches `GET /api/worktrees?slug=<slug>` on slug changes and exposes a manual `refresh()` method. There is no periodic refresh for worktree additions or removals, so the worktree selector can also become stale when terminal commands create or delete worktrees.

### No Existing Polling or File Watch

There is no existing file-tree polling, filesystem watching, SSE, `EventSource`, or `chokidar` integration in the application. The current code relies on explicit refresh triggers only.

### Relevant Decisions

| # | Decision | Relevance |
|---|----------|-----------|
| 59 | Expose `refreshFileTree()` and `fileTreeRefreshing`; use `cache: 'no-store'` | Existing root refresh API is suitable for silent polling |
| 60 | `refreshFileTree` must no-op without an active project and never mutate `fileTreeLoading` | Polling can call it without global loading UI |
| 61 | `FileViewer` calls `refreshFileTree()` on successful save only | Polling becomes an additional refresh trigger |
| 62 | `ExplorerContent` must not gate spinners on `fileTreeRefreshing` | Poll refreshes remain visually quiet |
| 70 | Deduplicate file-tree fetches by slug/path/worktree | Polling should not duplicate in-flight refreshes |
| 104 | File-tree requests are keyed by slug, activeWorktree, and path | Polling must preserve active worktree scoping |
| 106 | Guard file-tree responses against stale slug and activeWorktree contexts | Late poll responses are safely ignored |

### Relevant Architecture Artifacts

- `project/architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md` defines the file-tree refresh, worktree scoping, request deduplication, stale-response, and merge contracts.
- `project/architecture/core-components/CORE-COMPONENT-0005-error-handling.md` defines error-handling expectations; polling failures should follow the existing non-disruptive refresh behavior unless the root tree is empty.
- `project/architecture/ADR/ADR-0002-tech-stack.md` already establishes Next.js, React, TypeScript, and the existing client/server stack.
- `project/architecture/ADR/ADR-0006-config-file-driven-configuration.md` is relevant only if the polling interval becomes configurable.

## Proposed ADRs

ADRs are **not required** for the recommended client-side polling approach. It uses the existing React/Next.js stack established by ADR-0002 and the existing file-tree refresh architecture from CORE-COMPONENT-0008.

If the Plan stage chooses a server-push approach such as SSE plus filesystem watchers, a new ADR should be created for that server-side event streaming strategy.

## Proposed Core-Components

No new core-component is required. The Plan stage should amend `CORE-COMPONENT-0008` to codify near-realtime file explorer synchronization rules:

- Poll root file-tree state at a conservative default interval.
- Pause interval polling while `document.visibilityState === "hidden"`.
- Trigger an immediate catch-up refresh when the document becomes visible again.
- Reuse existing `refreshFileTree` deduplication, stale-response guards, and silent refresh behavior.
- Refresh worktree list state as part of the same near-realtime synchronization contract or define why worktree list refresh is out of scope.
- Guard browser-only APIs for SSR/test environments.
- Cover polling lifecycle, visibility behavior, unmount cleanup, project/worktree switching, and deduplication in tests.

## Risks and Open Questions

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `git status --porcelain -u` is slow on large repositories or many untracked files | Medium | Use a conservative interval and rely on in-flight deduplication; avoid adding more frequent per-directory polling in v1 |
| Polling fires during project or worktree switches | Low | Existing stale slug/worktree guards should drop obsolete responses |
| Browser `document` APIs are unavailable in SSR/test contexts | Low | Use `typeof document !== "undefined"` guards and tests that mock visibility state |
| Interval leaks after project close or provider unmount | Medium | Cleanup must clear timers and event listeners |
| Worktree list remains stale if only file tree polling is implemented | Medium | Plan should explicitly include or exclude worktree list co-refresh |

### Open Questions for Plan Stage

1. Should the polling interval be hardcoded for v1 or configurable through the ADR-0006 config system?
2. Should `git status --porcelain -u` be optimized for polling, or should status badge correctness be preserved unchanged?
3. Should worktree list polling live in `useWorktrees`, `ProjectSidebar`, or a shared near-realtime synchronization hook?
4. Should visibility restore trigger an immediate refresh, or wait for the next interval tick?
5. Should polling live inside `WorkspaceProvider`, `WorkspaceLayout`, or a dedicated hook for testability?
6. Should loaded directory children be periodically refreshed too, or should v1 poll only the root tree and preserve existing lazy-loaded child behavior?
7. Should polling failures use backoff after repeated errors, or follow the current silent refresh behavior?

## Preliminary Change Surfaces

| File | Change Type | Notes |
|------|-------------|-------|
| `src/lib/workspace-context.tsx` | Runtime behavior | Add near-realtime polling or consume a dedicated polling hook |
| `src/lib/workspace-context.test.tsx` | Tests | Cover interval lifecycle, visibility pause/resume, cleanup, stale guards, and deduplication |
| `src/hooks/use-worktrees.ts` | Runtime behavior | Optionally add or expose periodic refresh behavior for worktree list changes |
| `src/hooks/use-worktrees.test.ts` | Tests | Cover worktree polling if hook behavior changes |
| `project/architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md` | Architecture documentation | Amend existing file-tree/workspace state contract |
| `project/architecture/ADR/DECISION-LOG.md` | Decision registry | Add decisions for the CORE-COMPONENT-0008 amendment |

## Test Implications

- Add fake-timer tests for root file-tree polling interval behavior.
- Verify no global loading spinner state changes during poll ticks.
- Verify polling pauses while the document is hidden.
- Verify a catch-up refresh occurs when document visibility returns to visible.
- Verify interval and event listeners are cleaned up on unmount.
- Verify project/worktree changes do not allow stale polling responses to overwrite current state.
- Verify in-flight refresh deduplication still prevents duplicate `GET /api/files` calls.
- Add worktree list refresh tests if worktree list co-refresh is included in scope.
