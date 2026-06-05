# Research Brief - Issue #70

## Metadata

| Field | Value |
|---|---|
| Issue | GitHub Issue #70 |
| Title | fix(layout): prevent fullscreen clipping of bottom controls |
| Label | bug |
| scope_type | issue |
| New ADRs required | No |
| New core-components required | No |
| DECISION-LOG.md update required | No |
| Related architecture | CORE-COMPONENT-0007 Shell Layout; CORE-COMPONENT-0008 Multi-Project Tabs and Workspace State |

## Problem Summary

When DevDeck is viewed in browser or OS fullscreen, the bottom portion of the project workspace can be clipped. The user specifically reported losing sight of the "green" element and the left-side Wide/Narrow control.

The Wide/Narrow control maps to the `SidebarSimple` collapse/expand button at the bottom of `ProjectSidebar`. The "green" element is most likely the last visible terminal prompt row in the xterm.js terminal area, which is commonly green and lives at the bottom of the workspace. Secondary candidates are the green terminal connection dot in `TerminalPanel` and the green Copilot status badge in `ProjectSidebar`.

Expected behavior: the project shell remains constrained to the visible viewport, the sidebar collapse control remains visible/clickable/keyboard reachable in expanded and collapsed states, and terminal/status content remains visible after fullscreen and resize transitions.

## Existing Architecture Constraints

### CORE-COMPONENT-0007 - Shell Layout

- The shell must fill the viewport and avoid outer document scrolling.
- The project sidebar must be a fixed-width flex sibling outside the `react-resizable-panels` group.
- Expanded sidebar width is `w-44`; collapsed sidebar width is `w-12`.
- The sidebar collapse toggle must use `SidebarSimple` with `aria-label`, `aria-expanded`, and native `title`.
- Panels that own persistent resources must remain mounted; do not use unmounting as a clipping workaround.

### CORE-COMPONENT-0008 - Multi-Project Tabs and Workspace State

- Sidebar tabs and controls must remain keyboard-navigable and accessible.
- Sidebar status indicators must not rely on color alone and must remain visible when meaningful.
- Sidebar collapse state is global and persisted under `devdeck-sidebar-collapsed`.
- `WorktreeTree` remains mounted and CSS-hidden when needed; do not move it into `ExplorerContent`.

No new ADR or core-component is required. This is an issue-scoped bug fix that restores existing shell/sidebar contracts.

## Findings from Code Inspection

### Primary finding: root/project height chain can allow outer overflow

`src/app/layout.tsx` sets the document height chain with `html` using `h-full`, while `body` uses `min-h-full flex flex-col`. Because `min-h-full` is a minimum rather than a hard constraint and the body does not hide overflow, child layout overflow can become page-level scroll. In fullscreen transitions, any mismatch between the visible viewport and calculated layout height can push the bottom of the shell below the fold.

`src/app/project/layout.tsx` uses `flex h-screen flex-col` for the project wrapper. `h-screen` maps to `100vh`, which can be fragile during browser/OS fullscreen transitions and viewport chrome changes. Once the root body is explicitly constrained, the project wrapper should inherit that height with `h-full` instead of recalculating viewport height independently.

### Secondary finding: sidebar toggle is not structurally protected from overflow

`src/components/project-sidebar.tsx` renders one `nav` as a `flex flex-col overflow-hidden` column. The Home button, divider, project list, active `WorktreeTree`, and bottom collapse toggle all live in the same flex column. The collapse toggle is pushed to the bottom with `mt-auto`.

That works only while the middle content fits. If fullscreen clipping or many project/worktree rows reduce effective height, the `overflow-hidden` nav can clip the toggle. A more robust structure is:

1. Fixed, non-shrinking header: Home button and divider.
2. Scrollable middle: project tabs and active worktree tree with `min-h-0 flex-1 overflow-y-auto`.
3. Fixed, non-shrinking footer: Wide/Narrow collapse toggle with no `mt-auto` dependency.

### "Green" element identification

| Candidate | Location | Likelihood |
|---|---|---|
| Terminal prompt / last terminal row | Bottom of xterm.js terminal content | High |
| TerminalPanel connection dot (`bg-green-500`) | Terminal panel header near the top | Low for bottom clipping |
| CopilotStatusIndicator green badge | Sidebar project badge | Medium if sidebar content is clipped |

The fix should not depend on knowing which candidate the user meant; correcting the viewport height chain and protected sidebar footer keeps all of them visible.

## Affected Files

| File | Role | Expected change |
|---|---|---|
| `src/app/layout.tsx` | Root document/body height model | Constrain the root/body height and prevent outer scroll |
| `src/app/project/layout.tsx` | Project shell wrapper | Use inherited full height instead of standalone `h-screen`; prevent propagated overflow |
| `src/components/project-sidebar.tsx` | Sidebar layout and Wide/Narrow control | Split fixed header, scrollable middle, and fixed footer toggle |
| `src/components/project-sidebar.test.tsx` | Sidebar component tests | Assert toggle accessibility and protected footer/scrollable middle structure |

No expected changes are required in `src/components/workspace-layout.tsx`, `src/components/terminal-panel.tsx`, or `src/app/globals.css` unless implementation uncovers a tighter coupling.

## Implementation Considerations

- Keep the shell aligned with CORE-COMPONENT-0007: viewport-filling, no outer scroll, panels remain mounted.
- Do not add dependencies.
- Preserve sidebar widths (`w-44`, `w-12`), persisted collapse state, native `title`, `aria-label`, and `aria-expanded` behavior.
- Do not hide the Wide/Narrow control behind hover-only CSS.
- Make project/worktree overflow internal to the sidebar middle region rather than page-level or nav-level clipping.
- Keep `WorktreeTree` mounted and hidden only by existing CSS state rules.

## Test Considerations

- Extend `src/components/project-sidebar.test.tsx` to cover:
  - collapse toggle remains present with correct accessible attributes;
  - sidebar contains a scrollable project-list region distinct from the fixed footer;
  - many open projects do not remove the Wide/Narrow toggle from the DOM.
- Add or adjust layout tests only where jsdom can assert structural classes; jsdom cannot measure real fullscreen clipping.
- If an existing Playwright setup is available and stable, add viewport-like geometry coverage for 1280x720 or 1366x768 by asserting the sidebar toggle is within the viewport and the document has no page-level vertical overflow.
- Required verification remains `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test`.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Root `overflow-hidden` changes home/error page scroll behavior | Medium | Confirm app pages still fit the intended viewport model and internal scrolling works where needed |
| Sidebar restructuring breaks existing collapse tests | Low | Preserve labels, titles, storage key, width classes, and toggle semantics |
| Scrollbar appears in collapsed sidebar with many projects | Low | Accept internal scroll or use existing styling conventions if needed; do not hide controls |
| Fullscreen e2e tests are flaky across OS/browser fullscreen APIs | Low | Prefer viewport geometry assertions over true OS fullscreen automation |

## ADR and Core-Component Assessment

No ADR is required. No core-component is required. No `DECISION-LOG.md` update is required.

This issue implements existing architecture rather than changing it: CORE-COMPONENT-0007 already requires a viewport-filling shell with no outer scroll, and CORE-COMPONENT-0008 already requires sidebar controls and indicators to remain accessible.

## Planner Handoff

Plan a single issue-scoped fix that:

1. Constrains `html`/`body` and the project wrapper to a single full-height, overflow-hidden outer shell.
2. Replaces project `h-screen` with inherited `h-full` once the root height chain is explicit.
3. Refactors `ProjectSidebar` into fixed header, scrollable middle, and fixed footer toggle.
4. Adds component tests for the sidebar footer/toggle structure and accessibility.
5. Avoids ADR/core-component updates unless implementation materially changes the shell contract.
