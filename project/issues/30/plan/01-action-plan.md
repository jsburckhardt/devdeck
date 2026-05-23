# Action Plan: Visualize git worktrees from .trees/ directory with terminal integration and sidebar enhancement

## Feature
- **ID:** 30
- **Research Brief:** project/issues/30/research/00-research.md

## ADRs Created
_None — no new ADRs required. This is a feature addition within existing architectural boundaries._

## Core-Components Updated
- **CORE-COMPONENT-0003** (WebSocket Terminal Communication) — Added `worktree` WebSocket query param, `extractWorktree` function, shell-only mode contract for worktree terminals
- **CORE-COMPONENT-0007** (Shell Layout) — Updated sidebar width from ~48px to ~176px; added project name display rule
- **CORE-COMPONENT-0008** (Multi-Project Tabs and Workspace State) — Added `activeWorktree`, `worktreesSectionCollapsed` workspace state; `useWorktrees` hook, `WorktreeTree` component, `GET /api/worktrees` endpoint contracts

## Implementation Tasks

### Phase 1: Foundation (no UI dependencies)
1. **Task 1** — Update `.gitignore` (`.trees/*` → `.trees/`)
2. **Task 2** — Add `Worktree` type and extend `PerProjectWorkspaceState` in `src/lib/types.ts`

### Phase 2: API & Data Layer
3. **Task 3** — Create `GET /api/worktrees` API route + tests
4. **Task 4** — Create `useWorktrees` hook + tests

### Phase 3: State Management
5. **Task 5** — Extend `WorkspaceContext` with worktree state fields

### Phase 4: Terminal Server
6. **Task 6** — Add `extractWorktree` and worktree path resolution to `terminal-server.mts`
7. **Task 7** — Add `worktree` option to `useTerminal` hook

### Phase 5: UI Components
8. **Task 8** — Create `WorktreeTree` component + tests
9. **Task 9** — Integrate `WorktreeTree` into `workspace-layout.tsx` and wire worktree terminal
10. **Task 10** — Widen project sidebar and add project name labels
