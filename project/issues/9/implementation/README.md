# Implementation Notes — Issue #9: Manual Project Tracking

## Summary

Implemented full manual project tracking functionality allowing users to add, edit, and remove projects from the DevDeck landing page. Projects are persisted in a JSON registry file following ADR-0003.

## Tasks Completed

### Task 1: Update `Project` type + create `src/lib/registry.ts`
- **Status:** Complete
- **Files Changed:** `src/lib/types.ts`, `src/lib/registry.ts` (new), `src/lib/registry.test.ts` (new)
- **Tests Passed:** 10
- Added `path`, `source`, `available` fields to `Project` interface
- Added `ProjectRegistryEntry` and `ProjectRegistry` types
- Created registry module with `loadRegistry`, `saveRegistry`, `resolveProjectPath`, `detectLanguage`, `readPackageJson`
- Atomic writes via temp file + `fs.rename`

### Task 2: Update `GET /api/projects` to merge registry with auto-discovery
- **Status:** Complete
- **Files Changed:** `src/app/api/projects/route.ts`, `src/app/api/projects/route.test.ts` (new)
- **Tests Passed:** 12
- Auto-discovered projects now include `path` and `source: 'auto'`
- Hidden projects excluded via registry `hidden: true` flag
- Registry metadata overrides applied
- Manual entries included with accessibility check

### Task 3: Update file API routes to use async resolver
- **Status:** Complete
- **Files Changed:** `src/app/api/files/route.ts`, `src/app/api/files/content/route.ts`
- Changed import from `@/app/api/projects/route` to `@/lib/registry`
- Added `await` to `resolveProjectPath` calls

### Task 4: Add `POST /api/projects` endpoint
- **Status:** Complete
- **Files Changed:** `src/app/api/projects/route.ts`
- **Tests Passed:** 6 (in route.test.ts)
- Validates path, derives slug, checks collisions (409), auto-populates metadata
- Returns 201 with created project

### Task 5: Add `PUT /api/projects/[slug]` and `DELETE /api/projects/[slug]`
- **Status:** Complete
- **Files Created:** `src/app/api/projects/[slug]/route.ts`, `src/app/api/projects/[slug]/route.test.ts`
- **Tests Passed:** 7
- PUT updates name/description/path, validates new path, slug immutable
- DELETE removes manual entries, hides auto-discovered with `hidden: true`

### Task 6: Dialog components
- **Status:** Complete
- **Files Created:** `src/components/add-project-dialog.tsx`, `src/components/edit-project-dialog.tsx`, `src/components/remove-project-dialog.tsx`, and corresponding test files
- **Tests Passed:** 6
- Installed `@radix-ui/react-dialog` for accessible modals
- All dialogs use `sonner` toast for feedback
- Loading and error states handled

### Task 7: Update `ProjectCard` with edit and remove actions
- **Status:** Complete
- **Files Changed:** `src/components/project-card.tsx`, `src/components/project-card.test.tsx` (new)
- **Tests Passed:** 5
- Added `onEdit`/`onRemove` callback props with hover-visible icon buttons
- Unavailable projects show warning icon and muted styling
- Manual projects show "manual" badge

### Task 8: Update landing page
- **Status:** Complete
- **Files Changed:** `src/app/page.tsx`, `src/app/page.test.tsx`
- **Tests Passed:** 6
- "Add Project" button opens AddProjectDialog
- Project list refreshes after mutations with `cache: 'no-store'`
- Edit/Remove dialogs wired to project cards
- Empty state updated to mention Add functionality

## Test Results

- **Total Tests:** 70 passed, 0 failed
- **Test Files:** 12 passed, 0 failed
- **Build:** Clean, no TypeScript errors

## Architecture Compliance

- **ADR-0003:** Fully compliant — JSON file persistence at `$DEVDECK_DATA_DIR/registry.json`, atomic writes, immutable slugs, 409 on collision, merge strategy implemented
- **CORE-COMPONENT-0006:** Tests co-located next to source files, vitest + @testing-library/react used
- **Backward Compatibility:** Auto-discovered projects continue working without registry entries; `resolveProjectPath` falls back to `PROJECTS_DIR/<slug>`

## New Dependencies

- `@radix-ui/react-dialog` — accessible modal dialog primitives
