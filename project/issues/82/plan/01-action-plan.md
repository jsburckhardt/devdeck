# Action Plan: Add Visible Close Project Action to Wide Workspace Controls

## Feature
- **ID:** 82
- **Research Brief:** project/issues/82/research/00-research.md

## ADRs Created
- None. This issue is a feature-level UI affordance within the existing Next.js/React shell architecture in [ADR-0002](../../../architecture/ADR/ADR-0002-tech-stack.md).

## Core-Components Created
- None.
- Amended [CORE-COMPONENT-0007: Shell Layout](../../../architecture/core-components/CORE-COMPONENT-0007-shell-layout.md) to require an always-visible current-project Close Project action in `WorkspaceLayout` controls and to prohibit `aria-pressed` on that non-toggle action.
- Amended [CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State](../../../architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md) to require the workspace close action to reuse the existing `closeNavigationTarget()` + `closeProject()` navigation flow and accessible project-name labels/titles.
- Updated [DECISION-LOG.md](../../../architecture/ADR/DECISION-LOG.md) with amended component metadata and decision records #167-#170.

## Implementation Tasks
1. **Add the workspace close control in `WorkspaceLayout`.**
   - Source target: `src/components/workspace-layout.tsx`.
   - Reuse `useOpenProjects()`, `closeNavigationTarget()`, and `useRouter()` rather than inventing a new close algorithm.
   - Render a trailing, always-visible regular button after the Explorer/File Preview/Terminal toggles.
   - Use the existing `X` icon, an `aria-label`, and a native `title` that include `project.name`.
2. **Extend `WorkspaceLayout` component tests.**
   - Test target: `src/components/workspace-layout.test.tsx`.
   - Reference close-flow expectations from `src/components/project-sidebar.test.tsx`.
   - Cover rendering/accessibility semantics, multiple-open-project navigation, and single-open-project navigation to `/`.
3. **Run implementation verification through the harness.**
   - Preferred commands: `./harness test` during iteration and `./harness verify` before implementation handoff.
   - Do not change sidebar hover/focus close-button behavior unless tests prove the workspace control depends on it.

## Notes for Implementer
- Treat `WorkspaceLayout`'s `project.slug` prop as the active slug for close navigation.
- The workspace close button is not a panel visibility toggle; it must not use `aria-pressed`.
- A shared close hook is not required for this issue. Only introduce one if implementation uncovers a third caller or materially reduces tested duplication without changing behavior.
- Plan stage did not run full verification.
