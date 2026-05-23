# Implementation Notes — Issue #30: Visualize git worktrees

## Summary

Implemented git worktree visualization with terminal integration and sidebar enhancement across 10 tasks.

## Tasks Completed

### Task 1: Update .gitignore
- **Files Changed:** `.gitignore`
- Changed `.trees/*` to `.trees/` for consistent directory-level exclusion

### Task 2: Add Worktree type and extend PerProjectWorkspaceState
- **Files Changed:** `src/lib/types.ts`
- Added `Worktree` interface with `name` and `branch` fields
- Added `activeWorktree` and `worktreesSectionCollapsed` to `PerProjectWorkspaceState`

### Task 3: Create GET /api/worktrees API route
- **Files Changed:** `src/app/api/worktrees/route.ts`, `src/app/api/worktrees/route.test.ts`
- Created API route that parses `git worktree list --porcelain` output
- Filters to `.trees/` entries only, returns `Worktree[]`
- Returns `[]` on git errors (graceful degradation)
- Returns 400 for missing slug, 404 for invalid slug
- Includes Cache-Control header
- 6 unit tests (T1-T5, T27)

### Task 4: Create useWorktrees hook
- **Files Changed:** `src/hooks/use-worktrees.ts`, `src/hooks/use-worktrees.test.ts`
- Client-side hook that fetches worktrees from the API
- Supports abort on unmount/re-fetch, slug changes, and manual refresh
- 5 unit tests (T6-T8, slug change, undefined slug)

### Task 5: Extend WorkspaceContext with worktree state
- **Files Changed:** `src/lib/workspace-context.tsx`
- Added `activeWorktree` and `worktreesSectionCollapsed` to workspace state
- Added `setActiveWorktree` and `toggleWorktreesSection` callbacks
- State persisted on unmount, restored on mount
- `activeWorktree` resets to null on project switch

### Task 6: Terminal server worktree support
- **Files Changed:** `src/server/terminal-server.mts`, `src/server/terminal-server.test.ts`
- Added `extractWorktree` function with path traversal protection
- Modified `resolveTerminalSetup` to accept worktree parameter
- Worktree terminals bypass tmux, spawn shell-only in worktree directory
- Invalid worktree paths fall back to project root
- Threaded worktree through connection handler
- 5 integration tests (T11-T15)

### Task 7: Add worktree option to useTerminal hook
- **Files Changed:** `src/hooks/use-terminal.ts`, `src/hooks/use-terminal.test.ts`
- Added `worktree` to `UseTerminalOptions`
- Updated `buildWsUrl` to include worktree query parameter
- Hook reconnects when worktree changes (via baseWsUrl dependency)
- 2 unit tests (T16-T17)

### Task 8: Create WorktreeTree component
- **Files Changed:** `src/components/worktree-tree.tsx`, `src/components/worktree-tree.test.tsx`
- Collapsible "Worktrees" section with GitBranch icons
- "Project root" entry + worktree entries with branch display
- Active worktree highlighted, collapse/expand toggle
- Hidden when empty (stays mounted per Decision #84)
- Loading spinner, error state with retry
- All interactive elements have aria-label attributes
- 9 unit tests (T18-T21 + additional coverage)

### Task 9: Integrate into workspace layout
- **Files Changed:** `src/components/workspace-layout.tsx`, `src/components/terminal-panel.tsx`, `src/components/workspace-layout.test.tsx`
- WorktreeTree rendered above FileTree in explorer panel
- TerminalPanel receives `worktree` prop from workspace context
- Terminal header shows "Terminal · worktree-name" when active
- 3 unit tests (T22-T23)

### Task 10: Widen project sidebar
- **Files Changed:** `src/components/project-sidebar.tsx`, `src/components/project-sidebar.test.tsx`
- Sidebar widened from `w-12` to `w-44` (~176px)
- Home button shows icon + "Home" text
- Project tabs show letter badge + truncated project name
- All aria-label, aria-current, and title attributes preserved
- 4 new unit tests (T24-T26)

## Verification

```
npm run lint       ✅ (0 errors, 3 warnings — pre-existing)
npm run format:check ✅
npm run build      ✅
npm test           ✅ (332 tests, 29 test files)
```

## Architecture Compliance

- No new ADRs required — all changes within existing architectural boundaries
- Updated core-components: CORE-COMPONENT-0003, CORE-COMPONENT-0007, CORE-COMPONENT-0008
- Follows existing patterns for API routes, hooks, and components
- Terminal server uses `.mts` extension with inlined utilities (no `@/` imports)
- All tests co-located with source files
