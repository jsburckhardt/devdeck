# Implementation Notes: Issue #36

## Summary

Implemented deterministic close navigation for project sidebar tabs using the existing `openProjects` order as tab order. Navigation is computed once before state removal in the sidebar close handler, then `closeProject(slug)` updates provider state/cache and `router.push()` runs only when a target exists.

## Tasks Completed

### Task T1: Add close-navigation target calculation

- Added `projectRoute(slug)` to construct `/project/{slug}` routes with `encodeURIComponent` and reused it from `ProjectSidebar` and `ProjectCard`.
- Added `closeNavigationTarget(openProjects, closedSlug, activeSlug)` covering inactive, first, middle, last, only-active, and encoded-slug cases.

### Task T2: Wire sidebar close behavior through one navigation path

- `ProjectSidebar` now resolves the active slug from the encoded route.
- Close handlers compute the navigation target before calling `closeProject(project.slug)`.
- Inactive closes remove the tab without route changes.
- Active closes route exactly once to the right neighbor, previous neighbor, or `/` for the only tab.
- Removed provider-owned navigation to avoid double navigation and keep route decisions in the sidebar flow.

### Task T3: Preserve existing multi-project contracts

- Provider still persists only the ordered slug array in `devdeck-open-projects`.
- `closeProject(slug)` still deletes only the closed slug workspace cache entry.
- Existing `openProject(project)` registration and deduplication behavior are unchanged.
- Sidebar tab clicks, Home navigation, close button `stopPropagation()`, aria labels, and keyboard reachability are preserved.

### Task T4: Run verification commands

Commands run:

- `npm run test -- src/lib/open-projects-context.test.tsx src/components/project-sidebar.test.tsx` — passed, 26 tests.
- `npm run test -- src/components/project-card.test.tsx src/components/project-sidebar.test.tsx src/lib/open-projects-context.test.tsx` — passed, 32 tests; added follow-up coverage for encoded ProjectCard navigation.
- `npm run lint && npm run format:check && npm run build && npm run test` — passed. Lint reported one existing warning in `src/server/terminal-server.test.ts` for `_p` unused; no errors.

## Files Changed

- `src/lib/open-projects-context.tsx`
- `src/lib/open-projects-context.test.tsx`
- `src/components/project-sidebar.tsx`
- `src/components/project-sidebar.test.tsx`
- `src/components/project-card.tsx`
- `src/components/project-card.test.tsx`
- `project/issues/36/implementation/README.md`
