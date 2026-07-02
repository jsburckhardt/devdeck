# CORE-COMPONENT-0007: Shell Layout

## Status

Adopted (amended) - 2026-07-01

## Purpose

Define the top-level IDE shell structure that all DevDeck pages share. The shell provides a persistent header, a resizable multi-panel workspace area, and conventions for how panels are composed, wrapped with error boundaries, and animated on mount.

## Scope

- Root page layout structure (header + panel workspace)
- Panel registration pattern using `react-resizable-panels`
- Panel toggle bar behavior, accessibility, and visibility guards
- Current-project workspace close affordance in the panel control bar
- Pairwise separator visibility between expanded adjacent panels
- Error boundary wrapping per panel
- Mount animation conventions
- Responsive behavior contract
- Collapsible project sidebar width and transition contract
- Selected-project/workspace detail placement and accessibility in the project sidebar

## Definition

### Rules
- The shell MUST consist of a fixed header and a flex-grow panel workspace area filling the viewport height
- The panel workspace MUST use `react-resizable-panels` (`Group`, `Panel`, `Separator`) for resizable layout
- Each panel MUST be wrapped in its own `ErrorBoundary` component (per CORE-COMPONENT-0005)
- Panel components MUST be client components (marked with `"use client"`) since they depend on browser APIs
- The header MUST contain the application title ("DevDeck") and a theme toggle button
- Panels MUST define a `minSize` percentage to prevent collapse below usable dimensions
- Togglable panels that own persistent resources (WebSocket connections, server processes) MUST remain mounted at all times; use `collapsible`/`collapsedSize` with imperative `collapse()`/`expand()` to control visibility instead of conditional rendering
- The Explorer panel MUST be toggleable from the panel toggle bar before File Preview and Terminal
- The Explorer panel MUST remain mounted when hidden using `collapsible`, `collapsedSize={0}`, and imperative `collapse()`/`expand()` behavior
- Panel separators MUST be visible only between two adjacent expanded panels
- The shell MUST prevent hiding the last visible workspace panel; the guarded toggle MUST use `aria-disabled="true"`, `tabIndex={-1}`, muted styling, and a suppressed click handler
- When visibility, project, or active worktree changes leave exactly one workspace panel visible, the shell MUST resize that remaining panel to fill the workspace; multi-panel layouts MUST preserve user-resized proportions and MUST NOT be reset by single-panel normalization
- `PanelToggle` controls MUST expose `aria-label` and `aria-pressed`
- `WorkspaceLayout` MUST render workspace control-bar actions in this order: Explorer, File Preview, Terminal, a non-interactive divider, then Close Project
- The divider before Close Project MUST use `aria-hidden="true"` and exact classes `mx-1 h-4 w-px bg-border`
- The WorkspaceLayout Close Project action MUST be visually distinct from `PanelToggle` controls and MUST NOT expose `aria-pressed`
- The WorkspaceLayout Close Project action MUST render disabled, not hidden, when the normalized current project slug is empty; disabled state MUST use `aria-disabled="true"`, `tabIndex={-1}`, muted styling, and a suppressed click handler
- Mount animations SHOULD use `framer-motion` with subtle fade/slide (duration ≤ 300ms)
- On project pages, the sidebar MUST render as a fixed-width flex sibling to the left of the `Group`, outside the resizable panel tree (see CORE-COMPONENT-0008)
- The expanded sidebar MUST use `w-44` (~176px) and display project-name labels
- The collapsed sidebar MUST use `w-12` (48px) and render icon-only navigation
- Sidebar collapse state MUST persist globally in `localStorage` under `devdeck-sidebar-collapsed`, defaulting to expanded
- Sidebar width changes MUST use CSS-only transitions and MUST NOT add runtime animation or tooltip dependencies
- Sidebar collapse MUST NOT be stored in per-project workspace state
- The sidebar collapse toggle MUST use `SidebarSimple` with `aria-label`, `aria-expanded`, and native `title` attributes
- A sidebar collapse keyboard shortcut MUST NOT be implemented in v1
- Each expanded sidebar tab MUST display the project badge and the project name as a visible truncated text label
- Each collapsed sidebar tab MUST display the project badge while hiding project-name text
- The project badge MUST keep `h-6 w-6`, `shrink-0`, and rounded styling in both sidebar modes
- The project badge MUST show the first project-name letter when Copilot status is `"idle"` or not recognized as active
- The project badge MUST use the `languageColor(project.language)` background only for the idle first-letter badge
- The project badge MUST replace the first-letter content with a visible Copilot-style bot head icon when Copilot status is `"running"` or `"waiting"`
- The sidebar MUST NOT participate in the `react-resizable-panels` layout — it is a static-width element
- The project sidebar MUST separate open-project navigation rows from the selected-project/workspace detail region; root/worktree selectors MUST NOT be nested inside any project tab row
- The selected-project/workspace detail region MUST render only for the currently selected project and MUST appear as its own sidebar region between the open-project navigation list and sidebar footer
- Expanded sidebar mode MUST expose the selected project label, selected workspace-context label, repository/worktree status, root choice, available worktree choices, disabled-state copy, refresh/retry actions, and polite status announcements within the selected-detail region
- Collapsed sidebar mode MUST expose a compact selected-context summary with native `title`, `aria-label`, and non-color visual affordance; it MUST NOT keep hidden root/worktree selector controls focusable
- Collapsed mode MAY hide the expanded selected-detail controls visually, but hidden controls MUST be removed from tab order with `hidden`, `inert`, `disabled`, or equivalent semantics
- Sidebar focus order MUST remain deterministic: Home, open project navigation/close controls, selected-detail interactive controls when expanded, then the collapse toggle
- Context changes, stale-context detection, and repository/worktree refresh results MUST use polite live-region announcements without duplicating announcements for unchanged state
- Disabled or unavailable workspace choices MUST not be keyboard-focusable and MUST expose their reason through adjacent visible text, `aria-describedby`, or a disabled-state status row
- When a focused workspace choice becomes unavailable after refresh, focus MUST recover to the selected-detail heading, refresh control, or first available choice without moving focus to a different checkout

### Interfaces
- **ShellLayout:** The top-level page component composing Header + PanelGroup
- **Header:** Fixed-height bar with app branding and toolbar actions (theme toggle)
- **ProjectSidebar:** Collapsible fixed-width vertical strip rendered on project pages as a left-edge sibling of the panel workspace; owns open-project navigation plus a separate selected-project/workspace detail region (see CORE-COMPONENT-0008)
- **Panel placeholders:** Each panel renders a centered icon + label when no real content is loaded
- **Separator:** Visible drag handle between panels with hover/active states
- **PanelToggle:** Toggle-bar button for workspace panels; exposes `aria-label`, `aria-pressed`, and guarded disabled semantics when hiding the last visible panel is prohibited
- **WorkspaceLayout Close Project action:** Regular button after the panel toggles and divider; stays visible, exposes no pressed state, handles empty-slug disabled semantics, and delegates close behavior to CORE-COMPONENT-0008

### Expectations
- The shell MUST render without JavaScript errors when all panels contain only placeholder content
- The layout MUST fill 100vh with no scroll on the outer shell (individual panels may scroll internally)
- `Group` orientation MUST be `"horizontal"` for the primary split; nested vertical splits are optional
- Future panels (terminal, file explorer, editor) slot into the existing PanelGroup without layout changes

## Rationale

Establishing the shell structure in the bootstrap phase ensures all future panel work has a consistent container. Using `react-resizable-panels` from the start (rather than CSS grid placeholders) proves the dependency works and establishes the pattern that subsequent issues will follow. Wrapping each panel in an ErrorBoundary from day one prevents a single broken panel from crashing the entire workspace.

## Usage Examples

```tsx
// src/app/page.tsx (simplified)
"use client";

import { Group, Panel, Separator } from "react-resizable-panels";
import { ErrorBoundary } from "@/components/error-boundary";
import { Header } from "@/components/header";

export default function Home() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <Group orientation="horizontal" className="flex-1">
        <Panel defaultSize={25} minSize={15}>
          <ErrorBoundary>
            <PlaceholderPanel icon="FolderOpen" label="File Explorer" />
          </ErrorBoundary>
        </Panel>
        <Separator className="w-1 bg-border hover:bg-accent" />
        <Panel defaultSize={50} minSize={30}>
          <ErrorBoundary>
            <PlaceholderPanel icon="Code" label="Editor" />
          </ErrorBoundary>
        </Panel>
        <Separator className="w-1 bg-border hover:bg-accent" />
        <Panel defaultSize={25} minSize={15}>
          <ErrorBoundary>
            <PlaceholderPanel icon="TerminalWindow" label="Terminal" />
          </ErrorBoundary>
        </Panel>
      </Group>
    </div>
  );
}
```

## Integration Guidelines

- The shell layout lives in `src/app/page.tsx` as the root page component
- Header component should be extracted to `src/components/header.tsx`
- ErrorBoundary component lives at `src/components/error-boundary.tsx`
- Future issues replace placeholder panels with real implementations without changing the shell structure
- Panel size persistence (localStorage) is deferred to a future enhancement

## Exceptions

- During initial bootstrap (Issue #1), panels contain only placeholder content — no real functionality is expected
- Mobile/narrow viewports may stack panels vertically in a future iteration; not required for bootstrap

## Enforcement

- [x] Automated checks: Smoke test verifies shell renders with header and panel labels
- [x] Code review checklist: New panels must be wrapped in ErrorBoundary
- [x] Test coverage requirements: Shell layout smoke test must pass
- [x] Test coverage requirements: Layout tests must assert Explorer mounted-collapse behavior, toggle order, pairwise separators, last-panel guard, and `PanelToggle` accessibility
- [x] Test coverage requirements: WorkspaceLayout tests must assert the current-project close action is visible, trails panel toggles, and has no `aria-pressed`
- [ ] Automated checks: ProjectSidebar tests must assert expanded `w-44`, collapsed `w-12`, persisted collapse state, and accessible toggle attributes
- [ ] Automated checks: ProjectSidebar tests must assert active Copilot bot badges preserve `h-6 w-6` sizing and visibility in expanded and collapsed modes
- [ ] Automated checks: ProjectSidebar tests must assert selected workspace detail is outside project navigation rows and follows the required focus order
- [ ] Automated checks: ProjectSidebar tests must assert collapsed selected-context summaries expose labels while hiding selector controls from the tab order
- [ ] Automated checks: Selected-detail tests must assert stale/disabled workspace choices are not focusable and focus recovers safely after refresh

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md)
