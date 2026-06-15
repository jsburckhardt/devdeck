# Action Plan: Near-Realtime File Explorer Synchronization

## Feature
- **ID:** 81
- **Research Brief:** project/issues/81/research/00-research.md

## ADRs Created
- None. Issue #81 stays within the React/Next.js client behavior already covered by [ADR-0002](../../../architecture/ADR/ADR-0002-tech-stack.md). No server-push, filesystem watcher, or new streaming architecture is planned.

## Core-Components Created
- None.
- Amended [CORE-COMPONENT-0008](../../../architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md) on 2026-06-15 to define near-realtime file explorer synchronization through conservative client-side polling, visibility pause/resume, `refreshFileTree` reuse, worktree list co-refresh, SSR/test guards, and cleanup requirements.

## Implementation Tasks
1. Add a client-only, visibility-aware root file-tree polling lifecycle at the active workspace boundary.
2. Extend worktree list refresh behavior so active project worktrees co-refresh with the same interval and visibility lifecycle.
3. Add deterministic fake-timer, visibility, cleanup, deduplication, stale-context, and harness verification coverage.

## Architecture Direction
- Use a fixed 5000 ms v1 polling interval rather than ADR-0006 config-file customization.
- Poll only the active root file tree; loaded child directories remain lazy and are not periodically polled.
- Call the existing `refreshFileTree(...)` path directly so polling inherits `cache: "no-store"`, in-flight deduplication, stale slug/worktree guards, root merge behavior, `fileTreeRefreshing`, and silent refresh semantics.
- Do not call the existing `loadRootFileTree` wrapper from polling because it mutates `fileTreeLoading` and is reserved for initial load and explicit retry.
- Pause interval ticks while `document.visibilityState === "hidden"` and perform an immediate catch-up refresh when visibility returns.
- Co-refresh `GET /api/worktrees?slug=<slug>` for the active project using no-store fetches, same visibility behavior, no overlapping same-slug poll requests, and cleanup on slug changes/unmount.
- Guard all `document`/timer browser APIs for SSR and jsdom tests.
- Verify through `./harness test` during implementation and `./harness verify` before completion.
