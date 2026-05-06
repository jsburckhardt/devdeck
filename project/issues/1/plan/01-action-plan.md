# Action Plan: Bootstrap DevDeck Shell Layout

## Feature
- **ID:** 1
- **Research Brief:** project/issues/1/research/00-research.md

## ADRs Created
None — existing ADR-0002 covers all technology choices.

## Core-Components Created
- **CORE-COMPONENT-0007-shell-layout.md** — Defines the IDE shell structure (header + resizable panels), panel composition rules, ErrorBoundary wrapping, and mount animation conventions.

## Implementation Tasks

### Overview
Replace the default Next.js boilerplate with a DevDeck-branded shell layout featuring a header, resizable placeholder panels, dark theme by default, and a smoke test. All `just check` steps must pass.

### Task Sequence

1. **TASK-1.1: Rewrite `globals.css` with oklch tokens and `.dark` class**
   - Replace hex values with oklch color space
   - Add full shadcn/ui CSS variable set
   - Switch from `@media prefers-color-scheme` to `.dark` class

2. **TASK-1.2: Create ThemeProvider and useTheme hook**
   - Custom lightweight provider (no new dependency)
   - Manages `.dark` class on `<html>`, localStorage persistence
   - SSR-safe with `suppressHydrationWarning`

3. **TASK-1.3: Create ErrorBoundary component**
   - React class component with fallback UI
   - PanelError fallback with retry button

4. **TASK-1.4: Update `layout.tsx`**
   - Metadata → "DevDeck"
   - Add `dark` class to `<html>` (server default)
   - Add `suppressHydrationWarning`
   - Wrap children in ThemeProvider
   - Add sonner `<Toaster />`

5. **TASK-1.5: Create Header component**
   - DevDeck branding with Phosphor icon
   - Theme toggle button (Sun/Moon)

6. **TASK-1.6: Rewrite `page.tsx` as shell layout**
   - Use react-resizable-panels for 3-panel layout
   - Each panel wrapped in ErrorBoundary
   - Placeholder content with Phosphor icons
   - framer-motion mount animations

7. **TASK-1.7: Add smoke test**
   - Co-located `page.test.tsx`
   - Verify key structural elements render

8. **TASK-1.8: Validate `just check` passes**
   - Run lint, format-check, build, test
   - Fix any issues

### Design Decisions (for implementer)
- **ThemeProvider:** Custom (no `next-themes`) — lighter, no new dependency
- **Panel layout:** `react-resizable-panels` (already installed, proves the stack)
- **shadcn CLI:** Do NOT run it; hand-craft minimal styling using CSS variables
- **Colors:** Standard shadcn/ui variable names with oklch values
- **Smoke test:** Minimal — render + check key text ("DevDeck", panel labels)
- **Named exports:** Use named exports for all new components (per CORE-COMPONENT-0006)
