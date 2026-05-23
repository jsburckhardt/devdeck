# Test Plan — Issue #30: Visualize git worktrees

## Test T1: Worktree API — porcelain parser with multiple worktrees

- **Type:** Unit
- **Task:** Task 3
- **Priority:** High

### Setup
- Mock `resolveProjectPath` to return `/projects/demo`
- Mock `execFileAsync` to return fixture porcelain output with main + two `.trees/` entries + one detached HEAD

### Steps
1. Call `GET /api/worktrees?slug=demo`
2. Inspect response body

### Expected Result
- Response status 200
- Returns array of 2 `Worktree` objects (main worktree filtered out)
- Each object has correct `path`, `branch`, `commit`, `name`, `isMain: false`
- Detached HEAD entry has `branch: "(detached)"`

---

## Test T2: Worktree API — empty when no .trees/ worktrees

- **Type:** Unit
- **Task:** Task 3
- **Priority:** High

### Setup
- Mock `resolveProjectPath` to return `/projects/demo`
- Mock `execFileAsync` to return porcelain output with only the main worktree (no `.trees/` entries)

### Steps
1. Call `GET /api/worktrees?slug=demo`

### Expected Result
- Response status 200
- Returns empty array `[]`

---

## Test T3: Worktree API — graceful failure on git error

- **Type:** Unit
- **Task:** Task 3
- **Priority:** High

### Setup
- Mock `resolveProjectPath` to return `/projects/demo`
- Mock `execFileAsync` to throw (simulating git not found or non-git repo)

### Steps
1. Call `GET /api/worktrees?slug=demo`

### Expected Result
- Response status 200
- Returns empty array `[]` (not an HTTP error)

---

## Test T4: Worktree API — missing slug returns 400

- **Type:** Unit
- **Task:** Task 3
- **Priority:** Medium

### Setup
- No mocks needed

### Steps
1. Call `GET /api/worktrees` (no slug param)

### Expected Result
- Response status 400
- Body contains `{ error: "...", code: "MISSING_SLUG" }`

---

## Test T5: Worktree API — invalid slug returns 404

- **Type:** Unit
- **Task:** Task 3
- **Priority:** Medium

### Setup
- Mock `resolveProjectPath` to throw (project not found)

### Steps
1. Call `GET /api/worktrees?slug=nonexistent`

### Expected Result
- Response status 404
- Body contains structured error

---

## Test T6: useWorktrees — successful fetch

- **Type:** Unit
- **Task:** Task 4
- **Priority:** High

### Setup
- Mock `fetch` to return `[{ path: ".trees/feat", branch: "refs/heads/feat", commit: "abc", name: "feat", isMain: false }]`

### Steps
1. Render hook with `slug="demo"`
2. Wait for loading to complete

### Expected Result
- `worktrees` contains one entry with correct fields
- `loading` is `false`
- `error` is `null`

---

## Test T7: useWorktrees — fetch error

- **Type:** Unit
- **Task:** Task 4
- **Priority:** High

### Setup
- Mock `fetch` to reject with network error

### Steps
1. Render hook with `slug="demo"`
2. Wait for loading to complete

### Expected Result
- `worktrees` is `[]`
- `loading` is `false`
- `error` is a non-null string

---

## Test T8: useWorktrees — refresh triggers re-fetch

- **Type:** Unit
- **Task:** Task 4
- **Priority:** Medium

### Setup
- Mock `fetch` to return results

### Steps
1. Render hook with `slug="demo"`
2. Wait for initial load
3. Call `refresh()`
4. Wait for second load

### Expected Result
- `fetch` called twice
- Data refreshed

---

## Test T9: WorkspaceContext — worktree state save/restore

- **Type:** Unit
- **Task:** Task 5
- **Priority:** High

### Setup
- Render `WorkspaceProvider` with mock `OpenProjectsProvider`

### Steps
1. Call `setActiveWorktree(".trees/feat")`
2. Call `toggleWorktreesSection()`
3. Unmount provider
4. Remount provider with same slug
5. Read state

### Expected Result
- `activeWorktree` restored as `.trees/feat`
- `worktreesSectionCollapsed` restored as `true`

---

## Test T10: WorkspaceContext — activeWorktree resets on project switch

- **Type:** Unit
- **Task:** Task 5
- **Priority:** High

### Setup
- Render `WorkspaceProvider`

### Steps
1. Call `setActiveWorktree(".trees/feat")`
2. Call `setProject(newProject)`

### Expected Result
- `activeWorktree` is `null`

---

## Test T11: extractWorktree — rejects absolute paths

- **Type:** Unit
- **Task:** Task 6
- **Priority:** High

### Setup
- Create mock `IncomingMessage` with `url` containing `worktree=/etc/passwd`

### Steps
1. Call `extractWorktree(req)`

### Expected Result
- Returns `null`

---

## Test T12: extractWorktree — rejects path traversal

- **Type:** Unit
- **Task:** Task 6
- **Priority:** High

### Setup
- Create mock `IncomingMessage` with `url` containing `worktree=../../etc/passwd`

### Steps
1. Call `extractWorktree(req)`

### Expected Result
- Returns `null`

---

## Test T13: extractWorktree — returns valid relative path

- **Type:** Unit
- **Task:** Task 6
- **Priority:** High

### Setup
- Create mock `IncomingMessage` with `url` containing `worktree=.trees/feature-branch`

### Steps
1. Call `extractWorktree(req)`

### Expected Result
- Returns `.trees/feature-branch`

---

## Test T14: resolveTerminalSetup — worktree bypasses tmux

- **Type:** Unit
- **Task:** Task 6
- **Priority:** High

### Setup
- Mock `resolveProjectPath` to return a valid directory
- Mock `fs.stat` to confirm worktree directory exists
- Provide `worktree=".trees/feat"`

### Steps
1. Call `resolveTerminalSetup(slug, defaultCwd, shell, shellArgs, ".trees/feat")`

### Expected Result
- Returns `{ command: shell, args: shellArgs, cwd: "<projectRoot>/.trees/feat", mode: "shell" }`
- tmux functions NOT called

---

## Test T15: resolveTerminalSetup — invalid worktree falls back to project root

- **Type:** Unit
- **Task:** Task 6
- **Priority:** High

### Setup
- Mock `resolveProjectPath` to return a valid directory
- Mock `fs.stat` to throw ENOENT for worktree path

### Steps
1. Call `resolveTerminalSetup(slug, defaultCwd, shell, shellArgs, ".trees/nonexistent")`

### Expected Result
- Returns `{ command: shell, args: shellArgs, cwd: projectRoot, mode: "shell" }`

---

## Test T16: buildWsUrl — includes worktree param

- **Type:** Unit
- **Task:** Task 7
- **Priority:** High

### Setup
- Mock `window.location` for URL building

### Steps
1. Call `buildWsUrl("demo", ".trees/feat", 80, 24)`

### Expected Result
- URL contains `worktree=.trees%2Ffeat` (or equivalent encoded form)
- URL also contains `slug=demo`, `cols=80`, `rows=24`

---

## Test T17: buildWsUrl — omits worktree when undefined

- **Type:** Unit
- **Task:** Task 7
- **Priority:** Medium

### Setup
- Mock `window.location`

### Steps
1. Call `buildWsUrl("demo", undefined, 80, 24)`

### Expected Result
- URL does NOT contain `worktree`

---

## Test T18: WorktreeTree — renders worktree list

- **Type:** Unit
- **Task:** Task 8
- **Priority:** High

### Setup
- Mock `useWorktrees` to return two worktrees
- Mock `useWorkspace` with `activeWorktree: null`

### Steps
1. Render `<WorktreeTree slug="demo" />`

### Expected Result
- Two worktree entries rendered with names and branches
- Each has accessible labels

---

## Test T19: WorktreeTree — clicking worktree sets activeWorktree

- **Type:** Unit
- **Task:** Task 8
- **Priority:** High

### Setup
- Mock `useWorktrees` to return one worktree
- Mock `useWorkspace` with `setActiveWorktree` spy

### Steps
1. Render `<WorktreeTree slug="demo" />`
2. Click the worktree entry

### Expected Result
- `setActiveWorktree` called with the worktree's relative path

---

## Test T20: WorktreeTree — renders nothing visible when empty

- **Type:** Unit
- **Task:** Task 8
- **Priority:** Medium

### Setup
- Mock `useWorktrees` to return empty array

### Steps
1. Render `<WorktreeTree slug="demo" />`

### Expected Result
- Component is mounted (in the DOM) but no visible worktree entries
- No "Worktrees" header visible

---

## Test T21: WorktreeTree — collapse/expand toggle

- **Type:** Unit
- **Task:** Task 8
- **Priority:** Medium

### Setup
- Mock `useWorktrees` to return worktrees
- Mock `useWorkspace` with `toggleWorktreesSection` spy

### Steps
1. Render `<WorktreeTree slug="demo" />`
2. Click the section header toggle

### Expected Result
- `toggleWorktreesSection` called

---

## Test T22: Workspace layout — WorktreeTree above FileTree

- **Type:** Unit
- **Task:** Task 9
- **Priority:** High

### Setup
- Render `WorkspaceLayout` with mocked context

### Steps
1. Inspect explorer panel DOM order

### Expected Result
- `WorktreeTree` component renders before `FileTree` in the explorer panel
- Both are present in the DOM

---

## Test T23: Workspace layout — terminal receives worktree prop

- **Type:** Unit
- **Task:** Task 9
- **Priority:** High

### Setup
- Render `WorkspaceLayout` with `activeWorktree: ".trees/feat"`

### Steps
1. Inspect `TerminalPanel` props

### Expected Result
- `TerminalPanel` receives `worktree=".trees/feat"` prop

---

## Test T24: Project sidebar — renders at ~176px width

- **Type:** Unit
- **Task:** Task 10
- **Priority:** High

### Setup
- Render `ProjectSidebar` with mock open projects

### Steps
1. Inspect the nav element's class list

### Expected Result
- Nav element has `w-44` class

---

## Test T25: Project sidebar — renders project name text

- **Type:** Unit
- **Task:** Task 10
- **Priority:** High

### Setup
- Render `ProjectSidebar` with a project named "my-project"

### Steps
1. Find the project tab button
2. Inspect its content

### Expected Result
- Button contains visible text "my-project" (truncated if needed)
- Button also contains the initial letter badge

---

## Test T26: Project sidebar — preserves accessibility attributes

- **Type:** Unit
- **Task:** Task 10
- **Priority:** Medium

### Setup
- Render `ProjectSidebar` with an active project

### Steps
1. Inspect aria attributes on project tabs

### Expected Result
- Active tab has `aria-current="page"`
- All tabs have `aria-label`
- All tabs have `title` attribute
- Close buttons have `aria-label`

---

## Test T27: Worktree API — Cache-Control header present

- **Type:** Unit
- **Task:** Task 3
- **Priority:** Low

### Setup
- Mock successful git worktree list

### Steps
1. Call `GET /api/worktrees?slug=demo`
2. Inspect response headers

### Expected Result
- Response includes `Cache-Control` header with `private`

---

## Test T28: End-to-end verification

- **Type:** Integration
- **Task:** All tasks
- **Priority:** High

### Setup
- Full build and test run

### Steps
1. `npm run lint`
2. `npm run format:check`
3. `npm run build`
4. `npm run test`

### Expected Result
- All commands pass without errors
- No TypeScript compilation errors
- All existing and new tests pass
