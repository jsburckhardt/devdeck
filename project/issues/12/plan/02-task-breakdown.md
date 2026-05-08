# Task Breakdown — Issue #12: Persistent Project Sidebar Tabs

## Task 1: Extract `languageColor()` and Add `PerProjectWorkspaceState` Type

- **Status:** Not Started
- **Complexity:** Low
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008

### Description
Extract the `languageColor()` function from `src/components/project-card.tsx` (lines 21–40) to `src/lib/utils.ts` so it can be shared with the new `ProjectSidebar` component. Update the import in `project-card.tsx`. Add the `PerProjectWorkspaceState` interface to `src/lib/types.ts`.

### Acceptance Criteria
- `languageColor()` is exported from `src/lib/utils.ts`
- `src/components/project-card.tsx` imports `languageColor` from `@/lib/utils` instead of defining it locally
- `PerProjectWorkspaceState` interface is exported from `src/lib/types.ts` with fields: `selectedFile: string | null`, `expandedFolders: string[]`, `showFileViewer: boolean`, `showTerminal: boolean`, `fileTree: FileNode[]`
- Existing `ProjectCard` tests still pass (no behavior change)

### Test Coverage
- Unit test: `languageColor()` returns correct Tailwind class for each supported language and the default fallback
- Type check: `PerProjectWorkspaceState` compiles with expected field types

---

## Task 2: Create `OpenProjectsProvider` Context

- **Status:** Not Started
- **Complexity:** High
- **Dependencies:** Task 1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008

### Description
Create `src/lib/open-projects-context.tsx` implementing the `OpenProjectsProvider` and `useOpenProjects()` hook. The provider manages:
1. `openProjects: Project[]` — ordered list of open projects
2. `openProject(project: Project)` — adds project (idempotent, no duplicates)
3. `closeProject(slug: string)` — removes project and deletes cached workspace state
4. `saveWorkspaceState(slug, state)` — writes to in-memory `Map<string, PerProjectWorkspaceState>`
5. `restoreWorkspaceState(slug)` — reads from in-memory Map, returns `undefined` if not cached
6. localStorage persistence of slug array under key `devdeck-open-projects`
7. On mount: read slugs from localStorage, fetch `/api/projects`, hydrate `openProjects` with matched projects, prune stale slugs

### Acceptance Criteria
- `openProject()` is idempotent — duplicate slug calls do not create duplicate entries
- `closeProject()` removes the project and its cached workspace state
- Slug array is written to localStorage on every open/close
- On mount, stale slugs (not found in `/api/projects`) are pruned from localStorage
- `saveWorkspaceState()` stores state in memory keyed by slug
- `restoreWorkspaceState()` returns cached state or `undefined`
- `useOpenProjects()` throws if used outside provider

### Test Coverage
- Unit test: `openProject()` adds a project to the list
- Unit test: `openProject()` with duplicate slug does not create duplicate
- Unit test: `closeProject()` removes the project from the list
- Unit test: `closeProject()` deletes the cached workspace state for that slug
- Unit test: Slug list is written to localStorage on open/close
- Unit test: On mount, slugs are hydrated from localStorage and cross-referenced with API
- Unit test: Stale slugs are pruned on mount
- Unit test: `saveWorkspaceState()` stores and `restoreWorkspaceState()` retrieves state
- Unit test: `useOpenProjects()` throws outside provider

---

## Task 3: Mount `OpenProjectsProvider` in Root Layout

- **Status:** Not Started
- **Complexity:** Low
- **Dependencies:** Task 2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008

### Description
Create a thin client wrapper component (e.g., `src/components/providers.tsx` with `"use client"`) that composes `ThemeProvider` and `OpenProjectsProvider`. Update `src/app/layout.tsx` to use this wrapper instead of just `ThemeProvider`, keeping the root layout as a Server Component.

### Acceptance Criteria
- `OpenProjectsProvider` wraps all page content below `ThemeProvider`
- Root layout (`src/app/layout.tsx`) remains a Server Component (no `"use client"` directive)
- Application renders without hydration errors
- Landing page still works with no sidebar visible

### Test Coverage
- Smoke test: App renders without errors with the new provider hierarchy
- Unit test: `useOpenProjects()` is accessible from a project page component

---

## Task 4: Create `ProjectSidebar` Component

- **Status:** Not Started
- **Complexity:** High
- **Dependencies:** Task 1, Task 2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description
Create `src/components/project-sidebar.tsx` as a `"use client"` component rendering a vertical sidebar strip (~48px wide). Features:
- Home button at top (navigates to `/`)
- One tab per open project showing first letter of project name with `languageColor()` background
- Active project tab distinguished with left border accent + brighter background (uses `usePathname()` to detect active slug)
- Close button on each tab (visible on hover)
- Native `title` attribute for tooltip (full project name)
- All colors via CSS custom properties (CORE-COMPONENT-0004)
- `aria-label` on all interactive elements, `aria-current="page"` on active tab
- Keyboard navigable: Tab key focuses tabs, Enter/Space activates

### Acceptance Criteria
- Sidebar renders one tab per open project from `useOpenProjects()`
- Active tab is visually distinct and has `aria-current="page"`
- Clicking a tab navigates to `/project/{slug}` via `router.push()`
- Close button calls `closeProject(slug)` and does not trigger navigation
- Home button navigates to `/`
- All interactive elements have `aria-label`
- `title` attribute shows full project name on tabs
- Sidebar uses CSS custom properties only (no hardcoded colors)
- Sidebar width is ~48px

### Test Coverage
- Unit test: Renders correct number of tabs for open projects
- Unit test: Active tab has `aria-current="page"` based on current pathname
- Unit test: Click on tab calls `router.push` with correct slug
- Unit test: Close button calls `closeProject` and stops propagation
- Unit test: Home button navigates to `/`
- Unit test: Each tab has `title` attribute with project name
- Unit test: Each interactive element has `aria-label`
- Accessibility test: Keyboard navigation (Tab, Enter, Space)

---

## Task 5: Create Intermediate Project Layout

- **Status:** Not Started
- **Complexity:** Low
- **Dependencies:** Task 4
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description
Create `src/app/project/layout.tsx` as a Client Component that renders the `ProjectSidebar` alongside children in a horizontal flex layout. This scopes the sidebar to all `/project/*` routes without affecting the landing page.

```tsx
"use client";
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <ProjectSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
```

### Acceptance Criteria
- `src/app/project/layout.tsx` exists and renders sidebar + children in flex row
- Sidebar appears on all `/project/*` pages
- Sidebar does NOT appear on the landing page (`/`)
- Children fill remaining horizontal space with `min-w-0 flex-1`
- Layout fills available height

### Test Coverage
- Unit test: Layout renders sidebar and children
- Integration test: Sidebar visible on `/project/test-slug`, absent on `/`

---

## Task 6: Integrate `WorkspaceProvider` with State Save/Restore

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 2, Task 3
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008

### Description
Modify `src/lib/workspace-context.tsx` to:
1. Accept a `slug` prop on `WorkspaceProvider`
2. On mount: if `slug` is provided, call `restoreWorkspaceState(slug)` from `useOpenProjects()` and hydrate state from cache (selectedFile, expandedFolders as Set from array, showFileViewer, showTerminal, fileTree)
3. On unmount: call `saveWorkspaceState(slug, currentState)` converting `expandedFolders` Set to array
4. Modify `setProject()` to skip resetting state when cached state was restored

### Acceptance Criteria
- `WorkspaceProvider` accepts an optional `slug` prop
- When cached state exists for the slug, workspace hydrates from cache on mount
- When no cache exists, workspace starts with default state (current behavior)
- On unmount, current workspace state is saved to OpenProjectsProvider cache
- `expandedFolders` Set ↔ string[] conversion works correctly at boundaries
- State survives a round-trip: mount → interact → unmount → mount again

### Test Coverage
- Unit test: State is saved to cache on unmount
- Unit test: State is restored from cache on mount when cache exists
- Unit test: Default state is used when no cache exists
- Unit test: `expandedFolders` Set→array→Set conversion preserves values
- Integration test: Round-trip — modify state, unmount, remount, verify state restored

---

## Task 7: Update Project Page to Register Open Project

- **Status:** Not Started
- **Complexity:** Low
- **Dependencies:** Task 2, Task 6
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008

### Description
Update `src/app/project/[slug]/page.tsx` to:
1. Call `openProject(project)` from `useOpenProjects()` once the project is fetched
2. Pass `slug` prop to `WorkspaceProvider` for state save/restore integration
3. Keep existing back button and error handling behavior

### Acceptance Criteria
- Navigating to `/project/{slug}` adds the project to the open projects list
- `WorkspaceProvider` receives the `slug` prop
- Back button still navigates to `/`
- Error and loading states still work correctly

### Test Coverage
- Unit test: `openProject()` is called with the fetched project on mount
- Unit test: `WorkspaceProvider` receives `slug` prop
- Regression test: Error state and loading state still render correctly

---

## Task 8: Accessibility and Keyboard Navigation Audit

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 4, Task 5, Task 6, Task 7
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008

### Description
Final pass to ensure all sidebar interactions meet accessibility standards:
- All interactive elements have meaningful `aria-label` attributes
- Active tab has `aria-current="page"`
- Sidebar is navigable via keyboard (Tab to focus, Enter/Space to activate, close button reachable)
- Focus management: after closing the active tab, focus moves to the next tab or home button
- Color contrast meets WCAG AA (4.5:1) for tab letters on language color backgrounds

### Acceptance Criteria
- All `aria-label` values are descriptive (e.g., "Open project My App", "Close project My App", "Go to home page")
- Active tab has `aria-current="page"`
- All tabs and buttons are reachable and activatable via keyboard
- After closing the active tab, focus is managed gracefully (not lost)
- Language color badges have sufficient contrast for the text letter

### Test Coverage
- Accessibility test: All interactive elements have `aria-label`
- Accessibility test: Active tab has `aria-current="page"`
- Accessibility test: Keyboard navigation through all sidebar elements
- Accessibility test: Focus management after tab close
