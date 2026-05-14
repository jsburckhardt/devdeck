# Test Plan: Issue #36

## Test P36-1: Active first tab closes to right neighbor

- **Type:** Unit
- **Tasks:** T1, T2
- **Priority:** High

### Setup

Render `ProjectSidebar` with open projects `[alpha, beta, gamma]` and pathname
`/project/alpha`.

### Expected Result

- `closeProject("alpha")` is called.
- `router.push("/project/beta")` is called exactly once.

## Test P36-2: Active middle tab closes to same-index right neighbor

- **Type:** Unit
- **Tasks:** T1, T2
- **Priority:** High

### Setup

Render `ProjectSidebar` with open projects `[alpha, beta, gamma]` and pathname
`/project/beta`.

### Expected Result

- `closeProject("beta")` is called.
- `router.push("/project/gamma")` is called exactly once.

## Test P36-3: Active last tab closes to previous remaining project

- **Type:** Unit
- **Tasks:** T1, T2
- **Priority:** High

### Setup

Render `ProjectSidebar` with open projects `[alpha, beta, gamma]` and pathname
`/project/gamma`.

### Expected Result

- `closeProject("gamma")` is called.
- `router.push("/project/beta")` is called exactly once.

## Test P36-4: Only active tab closes to home

- **Type:** Unit
- **Tasks:** T1, T2
- **Priority:** High

### Setup

Render `ProjectSidebar` with open projects `[alpha]` and pathname `/project/alpha`.

### Expected Result

- `closeProject("alpha")` is called.
- `router.push("/")` is called exactly once.

## Test P36-5: Inactive tab close does not navigate

- **Type:** Unit
- **Tasks:** T1, T2
- **Priority:** High

### Setup

Render `ProjectSidebar` with open projects `[alpha, beta, gamma]` and pathname
`/project/alpha`.

### Expected Result

- `closeProject("gamma")` is called.
- `router.push()` is not called.

## Test P36-6: Project routes encode slugs

- **Type:** Unit
- **Tasks:** T1, T2
- **Priority:** Medium

### Setup

Render `ProjectSidebar` with an active project whose adjacent target slug contains
characters requiring URL encoding.

### Expected Result

- Navigation target is `/project/${encodeURIComponent(targetSlug)}`.

## Test P36-7: Provider close preserves persistence and cache contracts

- **Type:** Unit
- **Tasks:** T2, T3
- **Priority:** High

### Setup

Render `OpenProjectsProvider`, open multiple projects, and save workspace state for at
least one project.

### Expected Result

- Closed project is removed.
- Remaining slugs persist as an ordered slug array.
- Closed slug workspace cache is deleted.
- Other project state is not cleared.

## Test P36-8: Close buttons remain accessible

- **Type:** Unit
- **Tasks:** T2, T3
- **Priority:** Medium

### Setup

Render `ProjectSidebar` with multiple open projects.

### Expected Result

- Close buttons have `aria-label`.
- Close buttons remain keyboard focusable.
- Keyboard activation calls `closeProject()`.
- Close activation does not trigger tab navigation.

## Test P36-9: Repository verification

- **Type:** Verification
- **Tasks:** T4
- **Priority:** High

### Steps

1. Run `npm run lint`.
2. Run `npm run format:check`.
3. Run `npm run build`.
4. Run `npm run test`.

### Expected Result

- All commands pass.
- Updated tests cover deterministic active tab close navigation.
