# Test Plan — Issue #12: Persistent Project Sidebar Tabs

## Test T1: `languageColor()` Utility

- **Type:** Unit
- **Task:** Task 1
- **Priority:** High

### Setup
Import `languageColor` from `@/lib/utils`. No mocks needed.

### Steps
1. Call `languageColor("TypeScript")` → expect `"bg-blue-500"`
2. Call `languageColor("JavaScript")` → expect `"bg-yellow-500"`
3. Call `languageColor("Python")` → expect `"bg-green-500"`
4. Call `languageColor("Rust")` → expect `"bg-orange-500"`
5. Call `languageColor("Go")` → expect `"bg-cyan-500"`
6. Call `languageColor("Ruby")` → expect `"bg-red-500"`
7. Call `languageColor("Java")` → expect `"bg-amber-700"`
8. Call `languageColor(undefined)` → expect `"bg-muted-foreground"`
9. Call `languageColor("UnknownLang")` → expect `"bg-muted-foreground"`

### Expected Result
Each call returns the correct Tailwind class string.

---

## Test T2: `OpenProjectsProvider` — Open Project

- **Type:** Unit
- **Task:** Task 2
- **Priority:** High

### Setup
Render `OpenProjectsProvider` wrapping a test consumer component. Mock `localStorage` and `fetch` for `/api/projects`.

### Steps
1. Call `openProject({ slug: "proj-a", name: "Project A", ... })`
2. Assert `openProjects` contains the project
3. Assert `localStorage.setItem` was called with `devdeck-open-projects` containing `["proj-a"]`

### Expected Result
Project is added to context state and slug persisted to localStorage.

---

## Test T3: `OpenProjectsProvider` — Idempotent Open

- **Type:** Unit
- **Task:** Task 2
- **Priority:** High

### Setup
Same as T2.

### Steps
1. Call `openProject(projA)` twice with the same slug
2. Assert `openProjects.length === 1`

### Expected Result
No duplicate entries created.

---

## Test T4: `OpenProjectsProvider` — Close Project

- **Type:** Unit
- **Task:** Task 2
- **Priority:** High

### Setup
Same as T2, with one project already open.

### Steps
1. Open project A
2. Call `saveWorkspaceState("proj-a", someState)`
3. Call `closeProject("proj-a")`
4. Assert `openProjects` is empty
5. Assert `restoreWorkspaceState("proj-a")` returns `undefined`
6. Assert localStorage updated to `[]`

### Expected Result
Project removed from list, cached state deleted, localStorage updated.

---

## Test T5: `OpenProjectsProvider` — Stale Slug Pruning

- **Type:** Unit
- **Task:** Task 2
- **Priority:** Medium

### Setup
Set `localStorage` to `["proj-a", "stale-slug"]`. Mock `fetch(/api/projects)` to return only `proj-a`.

### Steps
1. Mount `OpenProjectsProvider`
2. Wait for hydration
3. Assert `openProjects` contains only `proj-a`
4. Assert localStorage updated to `["proj-a"]`

### Expected Result
Stale slugs pruned on cold start.

---

## Test T6: `OpenProjectsProvider` — Save and Restore Workspace State

- **Type:** Unit
- **Task:** Task 2
- **Priority:** High

### Setup
Same as T2.

### Steps
1. Call `saveWorkspaceState("proj-a", { selectedFile: "main.ts", expandedFolders: ["src"], showFileViewer: true, showTerminal: false, fileTree: [] })`
2. Call `restoreWorkspaceState("proj-a")`
3. Assert returned state matches saved state

### Expected Result
State round-trips correctly through in-memory cache.

---

## Test T7: `useOpenProjects()` — Throws Outside Provider

- **Type:** Unit
- **Task:** Task 2
- **Priority:** Medium

### Setup
Render a component calling `useOpenProjects()` without wrapping it in `OpenProjectsProvider`.

### Steps
1. Attempt to render the component

### Expected Result
Throws an error with a descriptive message.

---

## Test T8: `ProjectSidebar` — Renders Tabs

- **Type:** Unit
- **Task:** Task 4
- **Priority:** High

### Setup
Mock `useOpenProjects()` to return 3 open projects. Mock `usePathname()` to return `/project/proj-b`.

### Steps
1. Render `<ProjectSidebar />`
2. Assert 3 tab elements are rendered
3. Assert each tab shows the first letter of the project name
4. Assert each tab has `title` attribute with full project name

### Expected Result
Correct number of tabs with correct content and tooltips.

---

## Test T9: `ProjectSidebar` — Active Tab State

- **Type:** Unit
- **Task:** Task 4
- **Priority:** High

### Setup
Same as T8 with pathname `/project/proj-b`.

### Steps
1. Render sidebar
2. Assert the tab for `proj-b` has `aria-current="page"`
3. Assert other tabs do NOT have `aria-current`

### Expected Result
Only the active tab is marked with `aria-current="page"`.

---

## Test T10: `ProjectSidebar` — Tab Click Navigates

- **Type:** Unit
- **Task:** Task 4
- **Priority:** High

### Setup
Mock `useRouter()` and `useOpenProjects()`.

### Steps
1. Render sidebar with project tabs
2. Click on the tab for `proj-c`
3. Assert `router.push("/project/proj-c")` was called

### Expected Result
Clicking a tab navigates to the project page.

---

## Test T11: `ProjectSidebar` — Close Button

- **Type:** Unit
- **Task:** Task 4
- **Priority:** High

### Setup
Mock `useOpenProjects()` with `closeProject` spy.

### Steps
1. Render sidebar
2. Hover over a tab to reveal close button
3. Click the close button for `proj-a`
4. Assert `closeProject("proj-a")` was called
5. Assert `router.push` was NOT called (close should not navigate)

### Expected Result
Close removes the project without triggering navigation.

---

## Test T12: `ProjectSidebar` — Home Button

- **Type:** Unit
- **Task:** Task 4
- **Priority:** Medium

### Setup
Mock `useRouter()`.

### Steps
1. Render sidebar
2. Click the home button
3. Assert `router.push("/")` was called

### Expected Result
Home button navigates to landing page.

---

## Test T13: `ProjectSidebar` — Accessibility Labels

- **Type:** Accessibility
- **Task:** Task 4, Task 8
- **Priority:** High

### Setup
Render sidebar with 2 open projects.

### Steps
1. Assert home button has `aria-label`
2. Assert each tab has `aria-label` containing the project name
3. Assert each close button has `aria-label` containing the project name
4. Assert active tab has `aria-current="page"`

### Expected Result
All interactive elements have descriptive accessibility attributes.

---

## Test T14: `ProjectSidebar` — Keyboard Navigation

- **Type:** Accessibility
- **Task:** Task 4, Task 8
- **Priority:** High

### Setup
Render sidebar with 2 open projects.

### Steps
1. Tab through sidebar elements — assert focus moves to home button, then each tab
2. Press Enter on a tab — assert navigation triggered
3. Press Space on a tab — assert navigation triggered
4. Tab to close button and press Enter — assert `closeProject` called

### Expected Result
All elements reachable and activatable via keyboard.

---

## Test T15: `WorkspaceProvider` — State Save on Unmount

- **Type:** Unit
- **Task:** Task 6
- **Priority:** High

### Setup
Render `WorkspaceProvider` with `slug="proj-a"` inside `OpenProjectsProvider`. Mock `saveWorkspaceState`.

### Steps
1. Mount `WorkspaceProvider`
2. Modify workspace state (select a file, expand a folder)
3. Unmount `WorkspaceProvider`
4. Assert `saveWorkspaceState` was called with `"proj-a"` and the current state

### Expected Result
State is saved to cache on unmount.

---

## Test T16: `WorkspaceProvider` — State Restore on Mount

- **Type:** Unit
- **Task:** Task 6
- **Priority:** High

### Setup
Pre-populate cache with state for `proj-a` via `saveWorkspaceState`. Render `WorkspaceProvider` with `slug="proj-a"`.

### Steps
1. Mount `WorkspaceProvider`
2. Assert `selectedFile` matches cached value
3. Assert `expandedFolders` matches cached value (converted from array to Set)
4. Assert `showFileViewer` and `showTerminal` match cached values

### Expected Result
State is restored from cache on mount.

---

## Test T17: `WorkspaceProvider` — Default State Without Cache

- **Type:** Unit
- **Task:** Task 6
- **Priority:** Medium

### Setup
Render `WorkspaceProvider` with `slug="new-proj"` and no cached state.

### Steps
1. Mount `WorkspaceProvider`
2. Assert `selectedFile` is `null`
3. Assert `expandedFolders` is empty Set
4. Assert `showFileViewer` is `true`
5. Assert `showTerminal` is `true`

### Expected Result
Default state used when no cache exists.

---

## Test T18: `WorkspaceProvider` — State Round-Trip

- **Type:** Integration
- **Task:** Task 6
- **Priority:** High

### Setup
Full provider hierarchy: `OpenProjectsProvider` → `WorkspaceProvider`.

### Steps
1. Mount `WorkspaceProvider` with `slug="proj-a"`
2. Select a file, expand folders, toggle terminal off
3. Unmount `WorkspaceProvider`
4. Remount `WorkspaceProvider` with `slug="proj-a"`
5. Assert all state values match what was set before unmount

### Expected Result
Full state round-trip succeeds — workspace feels preserved across tab switches.

---

## Test T19: Project Page — Calls `openProject` on Mount

- **Type:** Unit
- **Task:** Task 7
- **Priority:** High

### Setup
Mock `useOpenProjects()` with `openProject` spy. Mock `fetch(/api/projects)` to return a project.

### Steps
1. Render `ProjectPage` with slug `"proj-a"`
2. Wait for project fetch to resolve
3. Assert `openProject` was called with the fetched project

### Expected Result
Project is registered in the open projects list on page mount.

---

## Test T20: Project Layout — Sidebar Scoping

- **Type:** Unit
- **Task:** Task 5
- **Priority:** Medium

### Setup
Render the project layout with mocked children.

### Steps
1. Render `ProjectLayout` with `<div data-testid="child" />`
2. Assert `ProjectSidebar` is present
3. Assert child content is rendered in the flex-1 container

### Expected Result
Layout correctly composes sidebar + children in flex row.

---

## Test T21: Close Last Project — Navigate Home

- **Type:** Unit
- **Task:** Task 2
- **Priority:** Medium

### Setup
Open one project. Mock `router.push`.

### Steps
1. Call `closeProject("only-project")`
2. Assert `router.push("/")` is called

### Expected Result
Closing the last open project navigates to landing page.

---

## Test T22: Focus Management After Tab Close

- **Type:** Accessibility
- **Task:** Task 8
- **Priority:** Medium

### Setup
Render sidebar with 3 projects, active is middle one.

### Steps
1. Close the active (middle) tab
2. Assert focus moves to the next tab (or previous if last)

### Expected Result
Focus is not lost after closing a tab.
