# Research Brief — Issue #58

# feat(sidebar): collapsible sidebar with icon-only mode and expand/minimize toggle

## Meta

| Field | Value |
|---|---|
| Issue | [GitHub Issue #58](https://github.com/jsburckhardt/devdeck/issues/58) |
| scope_type | `issue` |
| ADRs required | No new ADR — update existing core-components |
| Core-components required | No new core-component — update CORE-COMPONENT-0007 and CORE-COMPONENT-0008 |
| DECISION-LOG.md update | Yes — add decisions for collapsible sidebar behavior |
| Research date | 2026-05-30 |

## 1. Issue Summary

The project sidebar currently renders at a fixed 176 px width (`w-44`) with a Home
button, open project tabs, project-name labels, close buttons, Copilot status
indicators, and the active project's `WorktreeTree`. Issue #58 adds an optional
collapsed state that shrinks the sidebar to 48 px (`w-12`) and shows only
icon/badge affordances while preserving existing expanded behavior.

The requested feature includes:

- Global sidebar collapse state persisted in `localStorage` under
  `devdeck-sidebar-collapsed`, defaulting to expanded (`false`).
- Collapsed width of 48 px with language-color project badges only.
- Expanded width of 176 px with current text labels and close-button behavior.
- Close buttons always visible in collapsed mode, not hover-only.
- Home button icon-only in collapsed mode.
- `WorktreeTree` remains mounted for the active project and is hidden via CSS
  (`display: none` / Tailwind `hidden`) when collapsed.
- Native `title` attributes for collapsed tooltips; no tooltip dependency.
- Copilot status indicator remains visible on the project badge.
- Bottom toggle button using `SidebarSimple` from `@phosphor-icons/react`, with
  `aria-label` and `aria-expanded`.
- Smooth CSS-only width transition and no new dependencies.

## 2. Scope Classification

**scope_type: `issue`**

This is a bounded UI feature implemented primarily in `ProjectSidebar`, with
tests and documentation updates. It does not introduce a new architecture
decision record or a new reusable core-component document. It extends existing
shell/sidebar contracts in CORE-COMPONENT-0007 and CORE-COMPONENT-0008.

## 3. Relevant Existing Decisions

| Decision # | Statement | Source |
|---|---|---|
| #47 | Render project sidebar as a fixed-width flex sibling outside the resizable panel Group | CORE-COMPONENT-0007 |
| #53 | Use native `title` attribute for sidebar tooltips; no `@radix-ui/react-tooltip` | CORE-COMPONENT-0008 |
| #84 | Togglable panels owning persistent resources must remain mounted and use visibility controls | CORE-COMPONENT-0007 |
| #88 | Require sidebar width of ~176 px with visible project-name labels | CORE-COMPONENT-0007 |
| #89 | Sidebar tabs show language-color badge plus project name text label | CORE-COMPONENT-0007 |
| #114 | Render `WorktreeTree` in the active project sidebar panel, always mounted per #84 | CORE-COMPONENT-0008 |
| #49 | Persist open project slug array to `localStorage` under `devdeck-open-projects` | CORE-COMPONENT-0008 |
| #15 | Theme preference persists in `localStorage` with a default | CORE-COMPONENT-0004 |

## 4. Relevant Documentation

| File | Relevance |
|---|---|
| `AGENTS.md` | Requires RPIV pipeline, scope classification, and decision-log updates for core-component changes |
| `project/architecture/ADR/DECISION-LOG.md` | Current decisions end at #125; add new sidebar-collapse decisions |
| `project/architecture/core-components/CORE-COMPONENT-0007-shell-layout.md` | Shell layout/sidebar width and mounted-panel rules |
| `project/architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md` | Open project tabs, sidebar interaction, `WorktreeTree`, and Copilot status rules |
| `docs/README.md` and `project/README.md` | Confirm project documentation structure and architecture pointers |

## 5. Current Implementation Observations

### `src/components/project-sidebar.tsx`

- The sidebar is a `nav` with fixed `w-44` width.
- Home button renders a `House` icon and visible `Home` text.
- Each project tab renders a language-color badge and visible project-name text.
- Close button is present in the DOM but hidden with opacity until hover/focus.
- `CopilotStatusIndicator` is positioned on the badge, so it should naturally
  remain visible in collapsed mode.
- `WorktreeTree` is currently rendered only for the active project. Sidebar
  collapse must not add another conditional unmount; wrap it and toggle CSS
  visibility instead.

### `src/app/project/layout.tsx`

The project layout renders `<ProjectSidebar />` when open projects exist. The
collapse state should stay internal to the sidebar; no layout-level state is
required.

### State and persistence

Existing localStorage patterns exist in the open-projects and theming flows.
The sidebar collapse state should remain global, not per-project, and must not
be added to `PerProjectWorkspaceState`.

### Tests

Existing sidebar tests cover Home rendering, open project tab rendering,
sidebar width, close buttons, Copilot status indicators, and navigation. These
tests should be extended for collapsed/expanded rendering, persisted state, and
`WorktreeTree` mount preservation.

## 6. Proposed Implementation Surfaces

| File | Change |
|---|---|
| `src/components/project-sidebar.tsx` | Add persisted collapse state, dynamic width, icon-only rendering, toggle button, collapsed close-button visibility, and CSS-hidden `WorktreeTree` wrapper |
| `src/components/project-sidebar.test.tsx` | Add tests for expanded/collapsed rendering, localStorage persistence, toggle accessibility, close button visibility, and mounted `WorktreeTree` |
| `project/architecture/core-components/CORE-COMPONENT-0007-shell-layout.md` | Document collapsed/expanded width contract, global persisted state, toggle button, CSS transition, and mount-preservation rule |
| `project/architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md` | Document icon-only tab behavior, title tooltips, close-button visibility, and Copilot/Worktree behavior in collapsed mode |
| `project/architecture/ADR/DECISION-LOG.md` | Add decisions starting at #126 for collapsible sidebar behavior |

## 7. Planner Handoff Notes

1. No new ADR is needed. Update CORE-COMPONENT-0007 and CORE-COMPONENT-0008.
2. No new dependency is needed. `@phosphor-icons/react` is already present and
   should provide `SidebarSimple`.
3. Use `localStorage` key `devdeck-sidebar-collapsed`. Store a boolean-shaped
   value and default to expanded when absent or unreadable.
4. Read localStorage in a client-safe effect to avoid SSR access. A brief
   expanded-to-collapsed hydration update is acceptable and consistent with
   existing client preference patterns.
5. Keep sidebar collapse global. Do not add it to `PerProjectWorkspaceState`.
6. Do not conditionally unmount `WorktreeTree` because of collapse. Keep the
   active project's component instance mounted and toggle a wrapping container's
   `hidden` class.
7. In collapsed mode, project-name and Home text labels should not render, while
   native `title` and `aria-label` attributes preserve accessible names and
   tooltips.
8. In collapsed mode, close buttons must use always-visible styling; in expanded
   mode, retain hover/focus reveal.
9. Add new decision-log entries after #125 and mark CORE-COMPONENT-0007 and
   CORE-COMPONENT-0008 as updated if the file convention requires it.
10. Verification should include unit tests for `project-sidebar`, plus
    `npm run lint` and `npm run format:check`.

## 8. Risks and Pitfalls

| Risk | Mitigation |
|---|---|
| localStorage access during SSR | Initialize to expanded and hydrate in `useEffect` or guard `window` access |
| `WorktreeTree` state loss | Hide via CSS wrapper instead of conditional rendering on collapse |
| Close button becomes hover-only in collapsed mode | Toggle class names so collapsed mode uses `opacity-100` |
| Text bleed during width animation | Add `overflow-hidden` and keep labels conditional |
| Accessibility regressions in icon-only mode | Preserve `aria-label`, `title`, `aria-current`, keyboard focus, and `aria-expanded` |

## 9. Suggested Decision Log Entries

The planner should add decision entries starting at #126. Suggested decisions:

| Suggested # | Decision | Source |
|---|---|---|
| 126 | Persist sidebar collapse state to `localStorage` under `devdeck-sidebar-collapsed`, defaulting to expanded | CORE-COMPONENT-0007 |
| 127 | Collapsed sidebar width must be 48 px and expanded sidebar width must remain ~176 px with CSS-only width transition | CORE-COMPONENT-0007 |
| 128 | Sidebar collapse toggle must use `SidebarSimple` with `aria-label`, `aria-expanded`, and native `title` attributes | CORE-COMPONENT-0007 |
| 129 | Collapsed sidebar tabs must show language-color badges only, hiding project-name and Home text labels | CORE-COMPONENT-0007 |
| 130 | Collapsed sidebar close buttons must be always visible; expanded mode may retain hover/focus reveal | CORE-COMPONENT-0008 |
| 131 | Collapsing the sidebar must keep the active project's `WorktreeTree` mounted and hide it via CSS | CORE-COMPONENT-0008 |
| 132 | Copilot CLI status indicators must remain visible on project badges in both sidebar modes | CORE-COMPONENT-0008 |
| 133 | Sidebar collapse state is global and must not be stored in per-project workspace state | CORE-COMPONENT-0008 |
