# Action Plan: Issue #58

# feat(sidebar): collapsible sidebar with icon-only mode and expand/minimize toggle

## Feature

| Field | Value |
|---|---|
| Issue | 58 |
| Research Brief | `project/issues/58/research/00-research.md` |
| Scope Type | `issue` |

## ADRs Created

None. No new ADR is required.

## Core-Components

No new core-component is required. Update these existing global artifacts:

- `CORE-COMPONENT-0007: Shell Layout`
- `CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State`

## Documentation Updates

- Update CORE-COMPONENT-0007 with sidebar expanded/collapsed width, global
  persistence, toggle accessibility, CSS-only transition, and no-keyboard-shortcut
  v1 rules.
- Update CORE-COMPONENT-0008 with icon-only collapsed tabs, native titles,
  close-button visibility, Copilot badge visibility, and CSS-hidden mounted
  `WorktreeTree` behavior.
- Update `DECISION-LOG.md` with decisions #126-#134.

## Implementation Tasks

1. Add global persisted collapse state to `ProjectSidebar`.
2. Add expanded/collapsed sidebar layout and icon-only rendering.
3. Add accessible bottom collapse toggle using `SidebarSimple`.
4. Preserve tab close, Copilot status, and `WorktreeTree` behavior in collapsed
   mode.
5. Extend `project-sidebar` tests for collapsed/expanded behavior and
   persistence.
6. Run verification: `npm run lint`, `npm run format:check`, and `npm run test`.
