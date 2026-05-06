# CORE-COMPONENT-0007: Shell Layout

## Status

Adopted

## Purpose

Define the top-level IDE shell structure that all DevDeck pages share. The shell provides a persistent header, a resizable multi-panel workspace area, and conventions for how panels are composed, wrapped with error boundaries, and animated on mount.

## Scope

- Root page layout structure (header + panel workspace)
- Panel registration pattern using `react-resizable-panels`
- Error boundary wrapping per panel
- Mount animation conventions
- Responsive behavior contract

## Definition

### Rules
- The shell MUST consist of a fixed header and a flex-grow panel workspace area filling the viewport height
- The panel workspace MUST use `react-resizable-panels` (`Group`, `Panel`, `Separator`) for resizable layout
- Each panel MUST be wrapped in its own `ErrorBoundary` component (per CORE-COMPONENT-0005)
- Panel components MUST be client components (marked with `"use client"`) since they depend on browser APIs
- The header MUST contain the application title ("DevDeck") and a theme toggle button
- Panels MUST define a `minSize` percentage to prevent collapse below usable dimensions
- Mount animations SHOULD use `framer-motion` with subtle fade/slide (duration ≤ 300ms)

### Interfaces
- **ShellLayout:** The top-level page component composing Header + PanelGroup
- **Header:** Fixed-height bar with app branding and toolbar actions (theme toggle)
- **Panel placeholders:** Each panel renders a centered icon + label when no real content is loaded
- **Separator:** Visible drag handle between panels with hover/active states

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

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md)
