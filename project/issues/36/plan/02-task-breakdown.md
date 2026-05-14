# Task Breakdown: Issue #36

## Task T1: Add close-navigation target calculation

- **Status:** Planned
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008

### Description

Add a deterministic helper or equivalent small calculation that derives the close
navigation target from the pre-close `openProjects` order, the `closedSlug`, and the
active project slug.

Rules:

- If closing an inactive project, return no navigation target.
- If closing the active middle or first project, navigate to the remaining project at
  the same index.
- If closing the active last project, navigate to the previous remaining project.
- If closing the only active project, navigate to `/`.
- Project routes must use `encodeURIComponent(slug)`.

### Acceptance Criteria

- Active first project in `[alpha, beta]` closes to `/project/beta`.
- Active middle project in `[alpha, beta, gamma]` closes to `/project/gamma`.
- Active last project in `[alpha, beta, gamma]` closes to `/project/beta`.
- Only active project closes to `/`.
- Inactive project close returns no navigation target.
- Encoded slugs are used when constructing project routes.

### Test Coverage

- Add unit coverage for all navigation target branches.
- Include a slug requiring URL encoding and assert the route uses
  `encodeURIComponent()`.

## Task T2: Wire sidebar close behavior through one navigation path

- **Status:** Planned
- **Dependencies:** T1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008

### Description

Update close handling so the sidebar computes the navigation target before removing the
project, calls `closeProject(project.slug)`, then calls `router.push(target)` only when a
target exists.

Avoid duplicate navigation paths. If the provider currently navigates on last close,
remove or neutralize that side effect so active close navigation is determined from the
sidebar route context and inactive close never navigates.

Preserve:

- `closeProject(slug)` removing only the closed slug.
- Workspace cache deletion only for the closed slug.
- localStorage persistence as an ordered slug array.
- Existing project page `openProject(project)` registration.
- Close button `stopPropagation()`.
- Close button aria labels and keyboard reachability.

### Acceptance Criteria

- Closing inactive tabs removes them without calling `router.push()`.
- Closing active tabs calls `router.push()` exactly once with the deterministic target.
- `closeProject()` still removes the closed slug and deletes only that slug's cached
  workspace state.
- localStorage remains slug-array JSON.
- Project tab clicks and Home button navigation still use client-side `router.push()`.
- No new endpoint, server persistence model, or architectural artifact is introduced.

### Test Coverage

- Extend `src/components/project-sidebar.test.tsx` to verify active first, middle, last,
  only, inactive close, and encoded slug navigation.
- Update `src/lib/open-projects-context.test.tsx` so provider tests assert
  state/cache/persistence behavior without relying on provider-owned navigation.
- Keep accessibility tests for aria labels, keyboard focus, and close buttons.

## Task T3: Preserve existing multi-project contracts

- **Status:** Planned
- **Dependencies:** T2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008

### Description

Ensure existing multi-project tab behavior remains intact while adding the
close-navigation fix.

Focus on:

- Open project deduplication.
- Cold-start stale slug pruning.
- Workspace cache save/restore.
- Sidebar active tab rendering with `aria-current="page"`.
- Sidebar client-side navigation with no full page reload.

### Acceptance Criteria

- Existing `OpenProjectsProvider` tests continue to pass after updates.
- Existing `ProjectSidebar` rendering, active-state, Home navigation, tab navigation, and
  accessibility tests continue to pass.
- No unrelated source files are changed.

### Test Coverage

- Run the full existing provider and sidebar unit test files.
- Ensure tests continue to cover CORE-COMPONENT-0008 persistence and accessibility
  contracts.

## Task T4: Run verification commands

- **Status:** Planned
- **Dependencies:** T1, T2, T3
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008

### Description

Run repository verification after implementation.

Commands:

- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm run test`

### Acceptance Criteria

- All verification commands pass.
- Any failure is fixed within the small targeted scope of Issue #36.
- No application source or test changes are made outside the planned implementation area.

### Test Coverage

- `npm run test` includes updated sidebar/provider tests.
- Build and lint validate TypeScript and formatting compliance.
