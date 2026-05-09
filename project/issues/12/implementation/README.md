# Implementation Notes — Issue #12: Persistent Project Sidebar Tabs

## Summary

Implemented persistent project sidebar tabs for quick workspace switching. Users can now keep multiple projects "open" simultaneously via a vertical sidebar strip, with per-project workspace UI state preserved in memory across tab switches.

## Tasks Completed

### Task 1: Extract `languageColor()` + Add `PerProjectWorkspaceState` Type
- **Status:** Done
- **Files Changed:** `src/lib/utils.ts`, `src/components/project-card.tsx`, `src/lib/types.ts`, `src/lib/utils.test.ts`
- **Tests Passed:** 9 (T1)

Extracted `languageColor()` from `project-card.tsx` to `src/lib/utils.ts` for shared use. Added `PerProjectWorkspaceState` interface to `src/lib/types.ts`.

### Task 2: Create `OpenProjectsProvider` Context
- **Status:** Done
- **Files Changed:** `src/lib/open-projects-context.tsx`, `src/lib/open-projects-context.test.tsx`
- **Tests Passed:** 8 (T2–T7, T21)

Created the `OpenProjectsProvider` context with:
- `openProject()` — idempotent add
- `closeProject()` — remove + delete cache + navigate home if last
- `saveWorkspaceState()` / `restoreWorkspaceState()` — in-memory Map cache
- localStorage persistence of slug array under `devdeck-open-projects`
- Stale slug pruning on mount via `/api/projects`

### Task 3: Mount Provider in Root Layout
- **Status:** Done
- **Files Changed:** `src/components/providers.tsx`, `src/app/layout.tsx`

Created `Providers` wrapper composing `ThemeProvider` + `OpenProjectsProvider`. Root layout remains a Server Component.

### Task 4: Create `ProjectSidebar` Component
- **Status:** Done
- **Files Changed:** `src/components/project-sidebar.tsx`, `src/components/project-sidebar.test.tsx`
- **Tests Passed:** 7 (T8–T14)

Created a `"use client"` vertical sidebar with:
- Home button (House icon) navigating to `/`
- Project tabs showing first letter with `languageColor()` background
- Active tab detection via `usePathname()`
- Close button (X) on hover, with `stopPropagation()`
- `aria-label`, `aria-current="page"`, `title` attributes
- Keyboard navigable (standard button elements)

### Task 5: Create Intermediate Project Layout
- **Status:** Done
- **Files Changed:** `src/app/project/layout.tsx`

Created project layout that renders `ProjectSidebar` + children in a flex row. Sidebar only appears when projects are open. Layout provides `h-screen flex-col` wrapper.

### Task 6: Integrate WorkspaceProvider with State Save/Restore
- **Status:** Done
- **Files Changed:** `src/lib/workspace-context.tsx`, `src/lib/workspace-context.test.tsx`
- **Tests Passed:** 4 (T15–T18)

Modified `WorkspaceProvider` to:
- Accept optional `slug` prop
- Restore state from cache on mount (via `useState` lazy initializers)
- Save state to cache on unmount (via cleanup effect with refs)
- Skip state reset in `setProject()` when restored from cache
- Used `useState` for the `restoredFromCache` flag and effects for ref syncing to comply with React strict mode lint rules

### Task 7: Update Project Page
- **Status:** Done
- **Files Changed:** `src/app/project/[slug]/page.tsx`

Updated project page to:
- Call `openProject(project)` via `useEffect` when project is loaded
- Pass `slug` to `WorkspaceProvider`
- Remove outer `<div className="flex h-screen flex-col">` (now provided by project layout)
- Use fragments (`<>`) instead of the wrapping div

### Task 8: Accessibility (included in Tasks 4, 6, 7)
Accessibility requirements were addressed inline:
- All interactive elements have `aria-label` attributes
- Active tab has `aria-current="page"`
- Keyboard navigation works via standard button elements
- Close button uses `stopPropagation()` to prevent navigation

## Verification Results

| Check | Result |
|-------|--------|
| `npm run test` | ✅ 178 tests passed (21 files) |
| `npm run lint` | ✅ 0 errors (1 pre-existing warning in terminal-server.test.ts) |
| `npm run format:check` | ✅ All files formatted |
| `npm run build` | ✅ Build successful |

## Files Created
- `src/lib/open-projects-context.tsx` — OpenProjectsProvider + useOpenProjects
- `src/components/project-sidebar.tsx` — ProjectSidebar component
- `src/app/project/layout.tsx` — Intermediate project layout
- `src/components/providers.tsx` — Providers wrapper (ThemeProvider + OpenProjectsProvider)
- `src/lib/utils.test.ts` — languageColor tests (T1)
- `src/lib/open-projects-context.test.tsx` — Context tests (T2–T7, T21)
- `src/components/project-sidebar.test.tsx` — Sidebar tests (T8–T14)
- `src/lib/workspace-context.test.tsx` — Workspace integration tests (T15–T18)

## Files Modified
- `src/lib/types.ts` — Added `PerProjectWorkspaceState` interface
- `src/lib/utils.ts` — Added `languageColor()` function
- `src/components/project-card.tsx` — Import `languageColor` from `@/lib/utils`
- `src/app/layout.tsx` — Use `Providers` wrapper instead of `ThemeProvider`
- `src/lib/workspace-context.tsx` — Added `slug` prop, save/restore integration
- `src/app/project/[slug]/page.tsx` — Call `openProject()`, pass `slug`, adjust layout

## Architecture Compliance
- Follows ADR-0002 (tech stack: React, Next.js, TypeScript, Tailwind, @phosphor-icons/react)
- Follows CORE-COMPONENT-0004 (theming: CSS custom properties only)
- Follows CORE-COMPONENT-0007 (shell layout: sidebar as flex sibling)
- Follows CORE-COMPONENT-0008 (multi-project tabs: all rules satisfied)
