# Action Plan: Simplify worktree context in the project sidebar

## Feature
- **ID:** 103
- **Research Brief:** project/issues/103/research/00-research.md

## ADRs Created
- None. The plan amends existing core-components because the feature changes existing workspace/sidebar/terminal contracts without introducing a new persistence technology, transport family, or global strategy.

## Core-Components Created
- None.

## Core-Components Amended
- [CORE-COMPONENT-0003: WebSocket Terminal Communication](../../../architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md) — explicit project-page workspace terminal context while preserving the host-rooted default terminal.
- [CORE-COMPONENT-0005: Error Handling](../../../architecture/core-components/CORE-COMPONENT-0005-error-handling.md) — workspace context error redaction, safe disabled-state copy, and remote-label sanitization.
- [CORE-COMPONENT-0007: Shell Layout](../../../architecture/core-components/CORE-COMPONENT-0007-shell-layout.md) — selected-project detail region and collapsed-sidebar accessibility.
- [CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State](../../../architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md) — selected workspace context, safe worktree identity, API shape, stale/unavailable behavior, and per-context state.
- [Decision Log](../../../architecture/ADR/DECISION-LOG.md) — updated core-component statuses and decisions #280-#294.

## Implementation Tasks
1. Define server-issued workspace context types, worktree identity generation, repository/worktree status models, and remote/label sanitization.
2. Migrate file, diff, content, and file-tree sync APIs from client-constructed `worktree` paths to `workspaceContext` IDs.
3. Migrate client workspace state, hooks, Explorer, and FileViewer to selected workspace context IDs and blocked stale states.
4. Refactor the sidebar so open-project navigation and selected-project workspace detail are separate accessible regions.
5. Add the explicit `/api/terminal/project` scoped terminal path, hook/panel surface, and project-page restart behavior while preserving `/api/terminal`.
6. Harden redaction and disabled/error copy across API responses, logs, UI labels, and E2E snapshots.
7. Add focused unit/component/API coverage, browser E2E coverage, and final harness verification evidence.

## Key Plan Decisions
- Use `WorkspaceContextId = "root" | wt_<hash>` as the client-visible selected workspace identity.
- Generate worktree IDs server-side from `sha256(realProjectRoot + "\0" + realWorktreePath).slice(0, 24)`, recomputed from `git worktree list --porcelain` on every use.
- Treat Git-reported linked worktrees as eligible even when they live outside `<projectRoot>/.trees/`.
- Use `workspaceContext=<id>` for file APIs, diff APIs, file-tree sync, and project-page terminal scoping; omit or pass `"root"` for the project root.
- Keep stale/invalid/unavailable selections blocked and visible; never silently reset to root or another checkout.
- Keep `/api/terminal` host-rooted and add `/api/terminal/project` for selected workspace terminals.
- Strip absolute paths, credentials, query strings, fragments, remote URL userinfo, and raw command output from UI/API/log/snapshot surfaces.
