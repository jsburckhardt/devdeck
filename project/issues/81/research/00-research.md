# Research Brief: feat(file-explorer): synchronize tree with filesystem changes in near realtime

## GitHub Issue
- **Issue:** #81
- **Title:** feat(file-explorer): synchronize tree with filesystem changes in near realtime
- **URL:** https://github.com/jsburckhardt/devdeck/issues/81
- **Research revision:** v2 - supersedes the earlier polling-only brief after Verify found the issue checklist requires server-push synchronization.

## Scope Classification
- **Scope Type:** issue

## Problem Statement

The DevDeck file explorer currently updates only on explicit application-controlled refreshes:

1. Initial project or active-worktree load through `WorkspaceLayout`.
2. Successful in-portal `FileViewer` saves through `refreshFileTree()`.
3. Manual retry after a root tree load error.

Issue #81 requires near-realtime synchronization for filesystem changes made outside the React save flow, including terminal commands, branch checkouts, generators, package installs, external editors, and git index changes. The GitHub issue checklist is broader than polling: it requires a server-push filesystem event stream, loaded-directory invalidation, degraded polling fallback, sync status/retry UI, auth/origin handling, watcher resource limits, and integration-style coverage.

The previous polling-only implementation on this branch should be retained as degraded fallback, not treated as the complete solution.

## Existing Context

### Current branch state

The first implementation pass already added a visibility-aware 5000 ms polling path:

- `src/components/workspace-layout.tsx` defines root file-tree polling through `refreshFileTree(project.slug)`.
- `src/hooks/use-worktrees.ts` defines worktree list polling with no-store fetches, abort/stale guards, and visibility pause/resume.
- `project/architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md` and `DECISION-LOG.md` currently record polling as the near-realtime contract in Decisions #198-#206.

Those decisions conflict with the issue acceptance criteria if they remain the primary strategy. The Plan stage must supersede them so polling becomes a degraded fallback beneath a server-push contract.

### Refresh infrastructure to reuse

`src/lib/workspace-context.tsx` already provides the canonical merge and fetch behavior:

- `refreshFileTree(explicitSlug?)` fetches `GET /api/files?slug=<slug>[&worktree=<wt>]` with `cache: "no-store"`.
- `loadDirectoryChildren(path, explicitSlug?)` fetches direct children for loaded directories.
- File-tree fetches are scoped by project slug, active worktree, and path.
- Existing stale slug/worktree guards prevent obsolete responses from mutating the visible tree.
- Existing in-flight deduplication can collapse bursts of server-push invalidations into fewer canonical `/api/files` refreshes.

The server-push implementation should emit invalidation hints only. The client should still refresh canonical tree state through existing `/api/files` calls instead of trusting event payloads as source-of-truth file rows.

### File APIs and worktree scoping

`src/app/api/files/route.ts` already supports project-root and worktree-root listing. It resolves roots server-side, rejects invalid paths, applies the `.git` exclusion list, runs git status, and returns direct children only. Server-push events must preserve those semantics:

- no absolute filesystem paths to the client;
- POSIX-style relative paths only;
- project root and active worktree scopes are independent;
- `.git` contents remain hidden while git metadata changes can still invalidate status badges.

### Auth and transport context

Relevant existing authentication and transport surfaces:

- `src/middleware.ts` protects HTTP routes using the `devdeck_token` cookie after token entry.
- `src/lib/auth.ts` exposes token loading and validation helpers.
- `src/server/terminal-server.mts` is an informative reference for authenticated upgrade handling, token validation, close code `4401`, per-connection cleanup, and subscriber maps.

Issue #81 proposes `/api/files/events` as a filesystem event stream. Research recommends Server-Sent Events (SSE) from the Next.js route layer instead of reusing the terminal WebSocket server because the events are one-way server-to-client invalidations and can rely on existing HTTP auth middleware. If the Plan stage chooses a WebSocket event stream instead, it must document how routing/auth does not regress `/api/terminal`.

### Missing capabilities

No current code implements:

- `/api/files/events`;
- `EventSource` or a file-tree sync client hook;
- server-side filesystem watchers;
- watcher sharing/ref-count cleanup;
- debounce/batching of raw filesystem events;
- `file-tree:ready`, `file-tree:changed`, or `file-tree:degraded` control messages;
- accessible sync status and retry UI in the Explorer header;
- loaded-directory invalidation after external changes;
- integration/UI coverage for external create/delete/rename flows.

## Proposed ADRs

An ADR is required because Issue #81 introduces a new synchronization transport and watcher lifecycle architecture not covered by existing ADRs.

Proposed title:

- **ADR-0007: Filesystem Sync Transport Strategy - Server-Push SSE with Polling Fallback**

The ADR should decide:

- Use SSE for file-tree invalidation events, not direct row transport.
- Use existing `/api/files` responses as the canonical state after invalidation.
- Use polling only as degraded fallback.
- Define watcher implementation strategy and dependency choice (`fs.watch` vs `chokidar` or another watcher).
- Define debounce/batching, payload limits, watcher sharing/ref-count cleanup, and fallback triggers.
- Define auth/origin constraints for the event stream.

## Proposed Core-Components

No new core-component is required, but existing core-components must be amended:

- **CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State** must supersede polling-primary Decisions #198-#206 and define the server-push sync contract, loaded-directory invalidation, stale event handling, sync status state, retry API, fallback polling, and required tests.
- **CORE-COMPONENT-0005: Error Handling** should define sync connection error/degraded behavior, retry semantics, accessible status announcements, auth failure no-retry behavior, and fallback polling rules.

CORE-COMPONENT-0003 is an informative reference for authenticated connection lifecycle patterns but does not need an amendment if the chosen transport is a Next.js SSE endpoint.

## Risks and Open Questions

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Filesystem watcher APIs differ across platforms and can miss events | High | Use debounced invalidation + canonical `/api/files` refresh; provide degraded polling fallback |
| Watcher bursts from `npm install` or branch checkout can overwhelm clients | High | Batch raw events and cap payloads; refresh parent directories rather than every raw event |
| Multiple tabs can create duplicate watchers | High | Share watchers by normalized `slug + worktree + root` and ref-count subscribers |
| Stale events/responses can corrupt active project/worktree state | High | Include scope tokens and reuse existing stale slug/worktree guards |
| Auth/origin handling is easy to under-specify for long-lived streams | High | ADR/core-component must define auth failure behavior and tests |
| Loaded directory refresh can disrupt expansion/selection state | Medium | Invalidate/reload only loaded direct-child directories and merge immutably |
| Polling-only branch commits already exist | Medium | Treat current polling as fallback and supersede architecture docs rather than deleting useful fallback code |

### Open Questions for Plan Stage

1. Should the server watcher use Node `fs.watch` only, or add a watcher dependency such as `chokidar`? If a dependency is added, update package metadata and document it.
2. Should `/api/files/events` be SSE or WebSocket? Research recommends SSE for one-way invalidation events.
3. What debounce interval and event payload cap should be enforced?
4. What exact event schema should be used for `file-tree:ready`, `file-tree:changed`, `file-tree:degraded`, and auth/error control messages?
5. Which API should `WorkspaceContext` expose for loaded-directory refresh/invalidation?
6. Should missing selected files clear selection immediately or rely on existing `FileViewer` missing-file handling?
7. What integration coverage is feasible in Vitest versus Playwright for this repository?

## Preliminary Change Surfaces

| File/Area | Change Type | Notes |
|-----------|-------------|-------|
| `project/architecture/ADR/ADR-0007-*.md` | New ADR | Server-push SSE with polling fallback |
| `project/architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md` | Amendment | Supersede polling-primary decisions; define sync contract |
| `project/architecture/core-components/CORE-COMPONENT-0005-error-handling.md` | Amendment | Sync degraded/error/retry behavior |
| `project/architecture/ADR/DECISION-LOG.md` | Amendment | Register ADR and updated decisions |
| `src/app/api/files/events/route.ts` | New API | SSE endpoint for file-tree invalidation events |
| `src/server/file-sync-*` or `src/lib/file-sync-*` | New server helper | Watcher registry, batching, path normalization, limits |
| `src/hooks/use-file-tree-sync.ts` | New hook | EventSource lifecycle, backoff, degraded polling fallback, retry |
| `src/lib/workspace-context.tsx` | Runtime behavior | Expose sync status/retry and loaded-directory refresh helpers if needed |
| `src/components/workspace-layout.tsx` / Explorer header | UI | Sync status and retry control |
| `src/components/file-tree.tsx` / tests | Regression coverage | Preserve states and loaded-directory behavior |
| `src/hooks/use-worktrees.ts` | Runtime behavior | Retain existing polling fallback for worktree list |
| `LLM.txt` | Documentation | Add new sync endpoint/hook/server helper references |

## Test Implications

Required test coverage should include:

- Server watcher batching, path normalization, scope isolation, `.git` filtering, git metadata invalidation, resource caps, redaction, and cleanup.
- `/api/files/events` auth, invalid slug/worktree rejection, no absolute path leakage, control messages, and degraded events.
- Client hook URL construction, EventSource lifecycle, retry/backoff, no-retry auth failures, Strict Mode duplicate mount cleanup, and degraded polling fallback.
- WorkspaceContext application of invalidations to root, loaded directories, collapsed `hasChildren`, empty directory transitions, stale events, inactive worktree isolation, and deleted selected-file behavior.
- ExplorerContent/FileTree sync status UI, retry accessibility, `role="status"` / `aria-live`, and preservation of existing loading/error/empty states.
- Integration or Playwright-style coverage that external create/delete/rename operations appear in the explorer without reload within the server-push timing window, and that degraded polling updates within the polling window.
- `./harness verify` must pass before handoff.
