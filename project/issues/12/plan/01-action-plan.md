# Action Plan: Add Persistent Project Sidebar Tabs for Quick Workspace Switching

## Feature
- **ID:** 12
- **Research Brief:** project/issues/12/research/00-research.md

## ADRs Created
- None — this feature extends existing conventions and requires no new ADR.

## Core-Components Created
- **CORE-COMPONENT-0008-multi-project-tabs.md** — Documents the OpenProjectsProvider context, per-project workspace state cache, localStorage slug persistence, and sidebar behavior/accessibility contracts.
- **CORE-COMPONENT-0007-shell-layout.md** (updated) — Added sidebar slot rules: the sidebar renders as a fixed-width flex sibling outside the resizable panel Group on project pages.

## Implementation Tasks

### Phase 1: Foundation (shared utilities and types)
1. **Task 1:** Extract `languageColor()` to `src/lib/utils.ts` and add `PerProjectWorkspaceState` type
   - Move the shared utility, update imports in `project-card.tsx`

### Phase 2: Core Context
2. **Task 2:** Create `OpenProjectsProvider` (`src/lib/open-projects-context.tsx`)
   - Open/close/deduplicate projects, localStorage slug persistence, in-memory workspace state cache, stale slug pruning
3. **Task 3:** Mount `OpenProjectsProvider` in root layout (`src/app/layout.tsx`)
   - Create a client wrapper component to keep root layout as Server Component

### Phase 3: Sidebar UI
4. **Task 4:** Create `ProjectSidebar` component (`src/components/project-sidebar.tsx`)
   - Vertical tab strip, language color badges, active state, close buttons, home button, accessibility
5. **Task 5:** Create intermediate project layout (`src/app/project/layout.tsx`)
   - Flex row: sidebar + children; scoped to `/project/*` routes only

### Phase 4: Integration
6. **Task 6:** Integrate `WorkspaceProvider` with `OpenProjectsProvider` for state save/restore
   - Save on unmount, restore on mount, update `setProject()` to not reset when cache exists
7. **Task 7:** Update project page (`src/app/project/[slug]/page.tsx`) to call `openProject()`
   - Register project in open list on mount

### Phase 5: Polish
8. **Task 8:** Accessibility and keyboard navigation audit
   - aria-labels, aria-current, keyboard tab navigation, focus management
