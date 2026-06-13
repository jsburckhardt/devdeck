# Research Brief: Add Visible Close Project Action to Wide Workspace Controls

## GitHub Issue

- **Issue:** #82
- **Title:** feat(workspace): add visible Close Project action to wide workspace controls

## Scope Classification

- **Scope Type:** `issue`

**ADRs required:** No. The change follows existing shell layout and multi-project state decisions.

**Core-components required:** No new core-component. The Plan stage should decide whether to amend CORE-COMPONENT-0007 and CORE-COMPONENT-0008 to document the new always-visible workspace close affordance.

## Problem Statement

The Close Project affordance currently lives in `ProjectSidebar` on each project tab. In expanded sidebar mode, that close button is hidden until hover or focus, making the action hard to discover. Collapsed sidebar mode keeps close buttons visible, but wide/expanded workspace users do not have an always-visible close action.

The workspace panel toggle bar in `WorkspaceLayout` shows visible controls for Explorer, File Preview, and Terminal, but has no close action. Issue #82 asks for a visible Close Project action in those wide workspace controls.

## Relevant Files and Components

| Path | Relevance |
|------|-----------|
| `src/components/workspace-layout.tsx` | Primary implementation target; contains the panel toggle bar. |
| `src/components/workspace-layout.test.tsx` | Primary test target for workspace control rendering and interaction. |
| `src/components/project-sidebar.tsx` | Existing close button and navigation reference implementation. |
| `src/lib/open-projects-context.tsx` | Provides `closeProject()` and `closeNavigationTarget()`. |
| `src/app/project/[slug]/page.tsx` | Renders `WorkspaceLayout` for the active project. |
| `src/app/project/layout.tsx` | Mounts project sidebar and workspace provider. |
| `project/architecture/core-components/CORE-COMPONENT-0007-shell-layout.md` | Shell layout and workspace control rules. |
| `project/architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md` | Open project tab and close behavior rules. |
| `project/architecture/ADR/DECISION-LOG.md` | Registry for any core-component amendments. |

## Existing Behavior

`ProjectSidebar` already closes projects by:

1. Calculating a navigation target with `closeNavigationTarget(openProjects, project.slug, activeSlug)`.
2. Calling `closeProject(project.slug)`.
3. Navigating to the returned project URL or `/` when closing the final open project.

The sidebar close button uses `aria-label` with the project name and uses the `X` icon. Expanded sidebar close buttons are intentionally hover/focus revealed, while collapsed sidebar close buttons remain visible.

`WorkspaceLayout` currently renders the panel toggle bar with `PanelToggle` controls only. It does not import `useOpenProjects`, `closeNavigationTarget`, `useRouter`, or a close icon.

## Proposed Implementation Direction

1. Add a trailing Close Project button to the `WorkspaceLayout` panel toggle bar.
2. Reuse the existing close flow from `ProjectSidebar`: `closeNavigationTarget()` + `closeProject()` + `router.push()`.
3. Treat `project.slug` as the active slug inside `WorkspaceLayout`, because the component renders for the current project route.
4. Keep the close button visually distinct from `PanelToggle`; it should not use `aria-pressed`.
5. Give the button an `aria-label` and `title` that include the current project name.
6. Use the existing `X` icon for consistency with sidebar close buttons.
7. Add tests that assert the button renders and closes/navigates correctly for multiple-open-project and single-open-project cases.

## Risks and Edge Cases

| Risk | Severity | Mitigation |
|------|----------|------------|
| Duplicate close logic between sidebar and workspace layout | Low | Reuse `closeNavigationTarget()` and `closeProject()`; defer a shared hook unless Plan requires it. |
| Closing the last project must leave the workspace route | Medium | Test that the single-project case navigates to `/`. |
| Closing with multiple projects must choose the same next project as sidebar close | Medium | Use the shared navigation helper and cover with tests. |
| Close button could be confused with panel toggles | Low | Use a regular button with no `aria-pressed`; label and title identify the action. |
| Core-component documentation may lag the new behavior | Low | Planner should decide whether to amend CORE-COMPONENT-0007/0008 and the Decision Log. |

## Handoff Notes for Plan

- **Scope:** `issue`
- **No ADR:** This is a feature-level UI change within existing architecture.
- **No new core-component:** Existing components cover the pattern, though minor amendments may be appropriate.
- **Primary source change:** `src/components/workspace-layout.tsx`
- **Primary test change:** `src/components/workspace-layout.test.tsx`
- **Reference tests:** `src/components/project-sidebar.test.tsx`
- **Verification target:** `./harness verify`
