# Task Breakdown — Issue #30: Visualize git worktrees

## Task 1: Update .gitignore pattern

- **Status:** Not started
- **Complexity:** Trivial
- **Dependencies:** None
- **Related ADRs:** None
- **Related Core-Components:** None

### Description
Change `.trees/*` to `.trees/` on line 29 of `.gitignore` for consistent directory-level exclusion matching the `git worktree` convention.

### Acceptance Criteria
- `.gitignore` line 29 reads `.trees/` instead of `.trees/*`
- No other lines changed

### Test Coverage
- Manual verification only (no automated test needed for gitignore)

---

## Task 2: Add Worktree type and extend PerProjectWorkspaceState

- **Status:** Not started
- **Complexity:** Small
- **Dependencies:** None
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0008

### Description
In `src/lib/types.ts`:
1. Add `Worktree` interface: `{ path: string; branch: string; commit: string; name: string; isMain: boolean }`
2. Add `activeWorktree: string | null` and `worktreesSectionCollapsed: boolean` to `PerProjectWorkspaceState`

### Acceptance Criteria
- `Worktree` interface is exported from `src/lib/types.ts`
- `PerProjectWorkspaceState` includes `activeWorktree` and `worktreesSectionCollapsed` fields
- TypeScript compiles without errors

### Test Coverage
- Type compilation verified by `npm run build`
- Existing tests still pass (no runtime behavior change)

---

## Task 3: Create GET /api/worktrees API route

- **Status:** Not started
- **Complexity:** Medium
- **Dependencies:** Task 2
- **Related ADRs:** ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0008

### Description
Create `src/app/api/worktrees/route.ts` that:
1. Accepts `slug` query parameter, resolves project path via `resolveProjectPath(slug)`
2. Runs `git worktree list --porcelain` via `execFileAsync`
3. Parses the porcelain output into blocks, filtering to entries whose path starts with `<projectRoot>/.trees/`
4. Returns `Worktree[]` with `name` derived from the basename under `.trees/`
5. Returns `[]` (not an error) when `.trees/` is absent, git is unavailable, or any subprocess error occurs
6. Uses `Cache-Control: private, max-age=5, stale-while-revalidate=10`
7. Returns structured JSON errors `{ error, code }` for missing/invalid slug

Create co-located `src/app/api/worktrees/route.test.ts`.

### Acceptance Criteria
- `GET /api/worktrees?slug=valid-slug` returns `Worktree[]` with correct fields
- Returns `[]` when no `.trees/` worktrees exist
- Returns `[]` when `git` command fails (not a git repo, git not installed)
- Returns 400 for missing `slug` parameter
- Returns 404 for invalid slug (project not found)
- Response includes `Cache-Control` header
- Follows same pattern as `src/app/api/files/route.ts`

### Test Coverage
- Unit tests for porcelain output parser (multiple worktrees, detached HEAD, no worktrees)
- Unit tests for `.trees/` filtering (includes `.trees/` entries, excludes main worktree)
- Unit tests for error cases (missing slug, invalid slug, git failure, non-git repo)
- Mock `execFileAsync` and `resolveProjectPath` following `files/route.test.ts` pattern

---

## Task 4: Create useWorktrees hook

- **Status:** Not started
- **Complexity:** Small
- **Dependencies:** Task 2, Task 3
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0008

### Description
Create `src/hooks/use-worktrees.ts`:
1. Accept `slug: string` parameter
2. Fetch `GET /api/worktrees?slug=<slug>` on mount and when slug changes
3. Expose `{ worktrees: Worktree[], loading: boolean, error: string | null, refresh: () => void }`
4. Handle fetch errors gracefully (set error state, preserve empty array)

Create co-located `src/hooks/use-worktrees.test.ts`.

### Acceptance Criteria
- Hook fetches worktrees on mount with the provided slug
- Hook re-fetches when slug changes
- `refresh()` triggers a new fetch
- Loading and error states are correctly managed
- Returns empty array while loading or on error

### Test Coverage
- Unit test: successful fetch populates `worktrees`
- Unit test: fetch error sets `error` and `worktrees` remains `[]`
- Unit test: slug change triggers re-fetch
- Unit test: `refresh()` triggers re-fetch
- Mock `fetch` globally

---

## Task 5: Extend WorkspaceContext with worktree state

- **Status:** Not started
- **Complexity:** Medium
- **Dependencies:** Task 2
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0008

### Description
In `src/lib/workspace-context.tsx`:
1. Add `activeWorktree: string | null` and `worktreesSectionCollapsed: boolean` to `WorkspaceState`
2. Add `setActiveWorktree`, `toggleWorktreesSection` to `WorkspaceContextValue`
3. Initialize from cached state via `cachedStateRef.current?.activeWorktree ?? null` and `cachedStateRef.current?.worktreesSectionCollapsed ?? false`
4. Add to `stateRef` tracking (lines 139-157) for save-on-unmount
5. Include in `saveWorkspaceState` call (lines 159-172)
6. Reset `activeWorktree` to `null` when `setProject` is called (prevent stale worktree on project switch)

### Acceptance Criteria
- `useWorkspace()` exposes `activeWorktree`, `worktreesSectionCollapsed`, `setActiveWorktree`, `toggleWorktreesSection`
- State is saved to cache on unmount and restored on mount
- `activeWorktree` resets to `null` on project switch
- TypeScript compiles without errors

### Test Coverage
- Existing workspace context tests must still pass
- New test: `setActiveWorktree` updates state
- New test: `toggleWorktreesSection` toggles state
- New test: worktree state is included in save/restore cycle
- New test: `setProject` resets `activeWorktree` to null

---

## Task 6: Add worktree path resolution to terminal server

- **Status:** Not started
- **Complexity:** Medium
- **Dependencies:** Task 2
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
In `src/server/terminal-server.mts`:
1. Add `extractWorktree(req: IncomingMessage): string | null` function that reads `worktree` query param, rejects absolute paths and `..` segments, returns sanitized relative path or `null`
2. Modify `resolveTerminalSetup` to accept a new `worktree: string | null` parameter. When `worktree` is non-null:
   - Resolve `<resolvedCwd>/<worktree>`
   - Verify the resolved path is within the project root (double-check after resolve)
   - Verify the path is a directory
   - Return `{ command: shell, args: shellArgs, cwd: worktreeAbsPath, mode: "shell" }` — bypass tmux entirely
   - On any failure, fall back to project root shell
3. Thread `worktree` from `wss.on('connection')` → `handleConnection` → `resolveTerminalSetup`

### Acceptance Criteria
- `extractWorktree` returns `null` for missing, absolute, or `..`-containing paths
- `extractWorktree` returns normalized relative path for valid input
- `resolveTerminalSetup` with `worktree` bypasses tmux and spawns shell-only
- `resolveTerminalSetup` with `worktree` falls back to project root on invalid/non-existent worktree path
- Worktree sessions send `{ type: "setup", mode: "shell" }` to client
- Connection handler threads `worktree` through correctly

### Test Coverage
- Unit test `extractWorktree`: null for missing param, null for absolute path, null for `..` traversal, valid relative path returned
- Unit test `resolveTerminalSetup` with worktree: returns shell-only config with worktree CWD
- Unit test `resolveTerminalSetup` with invalid worktree: falls back to project root
- Unit test `resolveTerminalSetup` with worktree: does NOT attempt tmux

---

## Task 7: Add worktree option to useTerminal hook

- **Status:** Not started
- **Complexity:** Small
- **Dependencies:** Task 6
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
In `src/hooks/use-terminal.ts`:
1. Add `worktree?: string` to `UseTerminalOptions`
2. Update `buildWsUrl` to accept `worktree` parameter and set `worktree` query param when provided
3. Update `baseWsUrl` derivation to pass `options?.worktree`
4. Ensure the WebSocket URL changes (and reconnects) when `worktree` value changes

### Acceptance Criteria
- `buildWsUrl` includes `worktree` query param when provided
- `buildWsUrl` omits `worktree` query param when undefined
- Hook reconnects when `worktree` option changes
- Existing behavior unchanged when `worktree` is not provided

### Test Coverage
- Unit test: `buildWsUrl` with worktree includes the param
- Unit test: `buildWsUrl` without worktree omits the param
- Verify existing `buildWsUrl` tests still pass

---

## Task 8: Create WorktreeTree component

- **Status:** Not started
- **Complexity:** Medium
- **Dependencies:** Task 4, Task 5
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0008, CORE-COMPONENT-0007

### Description
Create `src/components/worktree-tree.tsx`:
1. Accept `slug: string` prop
2. Use `useWorktrees(slug)` to fetch worktree list
3. Use `useWorkspace()` to read/write `activeWorktree`, `worktreesSectionCollapsed`, `setActiveWorktree`, `toggleWorktreesSection`
4. Render a collapsible "Worktrees" section header with toggle chevron
5. Render each worktree as a row showing `name` and `branch` with an "Open Terminal" action button
6. Clicking a worktree entry calls `setActiveWorktree(worktree.path)` (relative path like `.trees/feature-branch`)
7. Highlight the active worktree
8. When worktree list is empty, render nothing (hidden via CSS — always mounted per Decision #84)
9. Use framer-motion for collapse/expand animation consistent with existing patterns

Create co-located `src/components/worktree-tree.test.tsx`.

### Acceptance Criteria
- Component renders worktree list with name and branch for each entry
- Clicking a worktree sets `activeWorktree` in context
- Active worktree is visually distinguished
- Section is collapsible/expandable
- Component renders nothing visible when worktree list is empty (but remains mounted)
- Loading state shows spinner
- Error state is handled gracefully
- All interactive elements have `aria-label` attributes

### Test Coverage
- Unit test: renders list of worktrees
- Unit test: clicking worktree calls `setActiveWorktree`
- Unit test: active worktree is highlighted
- Unit test: section collapses/expands
- Unit test: renders nothing visible when empty
- Unit test: loading state renders spinner
- Unit test: error state handled

---

## Task 9: Integrate WorktreeTree and worktree terminal into workspace layout

- **Status:** Not started
- **Complexity:** Medium
- **Dependencies:** Task 7, Task 8
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description
In `src/components/workspace-layout.tsx`:
1. Import `WorktreeTree` component
2. Render `<WorktreeTree slug={project.slug} />` above the existing FileTree content inside the explorer panel (before the loading/error/tree conditional)
3. Read `activeWorktree` from `useWorkspace()`
4. Pass `worktree={activeWorktree}` to `TerminalPanel` (which passes it to `useTerminal`)
5. When `activeWorktree` changes, the terminal reconnects to the worktree-scoped shell

### Acceptance Criteria
- `WorktreeTree` appears above `FileTree` in the explorer panel
- Setting `activeWorktree` causes the terminal to reconnect with the worktree CWD
- Clearing `activeWorktree` (set to null) returns the terminal to the project root
- Explorer panel shows both worktree section and file tree

### Test Coverage
- Integration test: workspace layout renders `WorktreeTree` above `FileTree`
- Test: terminal receives `worktree` prop when `activeWorktree` is set
- Existing workspace layout tests still pass

---

## Task 10: Widen project sidebar and add project name labels

- **Status:** Not started
- **Complexity:** Small
- **Dependencies:** None
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description
In `src/components/project-sidebar.tsx`:
1. Change nav width from `w-12` to `w-44` (~176px)
2. Remove `items-center` from nav (left-align content)
3. Update Home button to show "Home" text label next to icon
4. Update project tab buttons to show language-color badge (first letter) + truncated project name
5. Update divider width from `w-6` to full width
6. Preserve `title` attribute (Decision #53), `aria-label`, `aria-current` attributes
7. Adjust close button positioning for new layout

### Acceptance Criteria
- Sidebar is ~176px wide (w-44)
- Home button shows icon + "Home" text
- Project tabs show color badge + project name (truncated)
- `title` attribute preserved on all buttons
- All `aria-label` and `aria-current` attributes preserved
- Close button works correctly in new layout
- Sidebar appearance is consistent at 1024px viewport width

### Test Coverage
- Unit test: sidebar renders project names as visible text
- Unit test: sidebar renders at correct width class
- Existing sidebar tests updated for new structure
- Visual check at 1024px viewport width
