# Task Breakdown — Issue #1: Bootstrap DevDeck Shell Layout

## Task 1.1: Rewrite globals.css with oklch color tokens

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0007

### Description
Completely rewrite `src/app/globals.css` to:
1. Keep `@import "tailwindcss"` at the top
2. Define `:root` block with all shadcn/ui CSS variables using oklch color space (--background, --foreground, --card, --card-foreground, --popover, --popover-foreground, --primary, --primary-foreground, --secondary, --secondary-foreground, --muted, --muted-foreground, --accent, --accent-foreground, --destructive, --destructive-foreground, --border, --input, --ring, --radius)
3. Define `.dark` class block with dark theme oklch values (dark is the primary theme)
4. Update `@theme inline` block to map all color tokens to Tailwind
5. Remove the `@media (prefers-color-scheme: dark)` block entirely
6. Keep font-family mappings for geist-sans and geist-mono

### Acceptance Criteria
- [ ] No hex color values remain in globals.css
- [ ] All colors use oklch() color space
- [ ] `.dark` class block exists (not media query)
- [ ] All standard shadcn/ui variable names are defined
- [ ] `@theme inline` maps color variables for Tailwind consumption
- [ ] `just build` passes without CSS errors

### Test Coverage
- Visual verification via `just dev`
- Build validation via `just build`
- No unit test needed for CSS file

---

## Task 1.2: Create ThemeProvider and useTheme hook

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** TASK-1.1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004

### Description
Create `src/components/theme-provider.tsx` with:
1. `ThemeProvider` — a React context provider component
   - On mount, reads `localStorage.getItem("theme")`
   - If no stored value, defaults to `"dark"`
   - Adds/removes `.dark` class on `document.documentElement`
   - Syncs changes to localStorage
   - Must be a client component (`"use client"`)
2. `useTheme()` hook — returns `{ theme, setTheme, toggleTheme }`
   - `theme`: `"dark" | "light"`
   - `setTheme(theme)`: sets theme explicitly
   - `toggleTheme()`: toggles between dark and light

### Acceptance Criteria
- [ ] File exists at `src/components/theme-provider.tsx`
- [ ] Named exports: `ThemeProvider`, `useTheme`
- [ ] Defaults to dark theme when no localStorage value
- [ ] Toggles `.dark` class on `<html>` element
- [ ] Persists preference to localStorage under key `"theme"`
- [ ] No hydration warnings (provider only modifies DOM on client mount)
- [ ] TypeScript strict mode passes

### Test Coverage
- Unit test at `src/components/theme-provider.test.tsx`
- Test: defaults to dark
- Test: toggleTheme switches theme
- Test: reads stored preference from localStorage

---

## Task 1.3: Create ErrorBoundary component

- **Status:** Pending
- **Complexity:** Low
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0007

### Description
Create `src/components/error-boundary.tsx` with:
1. `ErrorBoundary` — React class component
   - Props: `children`, optional `fallback` ReactNode
   - State: `hasError: boolean`, `error: Error | null`
   - `getDerivedStateFromError`: sets hasError
   - `componentDidCatch`: logs error to console
   - Renders fallback UI (or default `PanelError`) when error caught
   - Provides a `reset` method to clear error state
2. `PanelError` — functional component for fallback UI
   - Displays error icon + "Something went wrong" message
   - "Try again" button that calls reset/retry callback

### Acceptance Criteria
- [ ] File exists at `src/components/error-boundary.tsx`
- [ ] Named exports: `ErrorBoundary`, `PanelError`
- [ ] Catches rendering errors in children
- [ ] Does NOT crash sibling panels when one panel errors
- [ ] Retry button clears error state and re-renders children
- [ ] TypeScript strict mode passes

### Test Coverage
- Unit test at `src/components/error-boundary.test.tsx`
- Test: renders children when no error
- Test: renders fallback when child throws
- Test: retry button resets error state

---

## Task 1.4: Update layout.tsx

- **Status:** Pending
- **Complexity:** Low
- **Dependencies:** TASK-1.1, TASK-1.2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0005

### Description
Modify `src/app/layout.tsx`:
1. Update `metadata` — title: "DevDeck", description: "A developer workspace"
2. Add `dark` to `<html>` className (server-rendered default)
3. Add `suppressHydrationWarning` to `<html>` element
4. Import and wrap `{children}` with `<ThemeProvider>`
5. Import and add `<Toaster />` from `sonner` inside `<body>`, after ThemeProvider
6. Keep existing Geist font configuration

### Acceptance Criteria
- [ ] `metadata.title` is "DevDeck"
- [ ] `<html>` has `dark` in className
- [ ] `<html>` has `suppressHydrationWarning`
- [ ] `ThemeProvider` wraps children
- [ ] `<Toaster />` from sonner is rendered in body
- [ ] Fonts still load correctly (Geist Sans + Mono)
- [ ] `just build` passes

### Test Coverage
- Covered by smoke test (TASK-1.7)
- Build validation via `just build`

---

## Task 1.5: Create Header component

- **Status:** Pending
- **Complexity:** Low
- **Dependencies:** TASK-1.2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0007

### Description
Create `src/components/header.tsx`:
1. Fixed-height header bar (h-12 or similar)
2. Left side: DevDeck logo/title using Phosphor `TerminalWindow` icon + "DevDeck" text
3. Right side: Theme toggle button using `useTheme()` hook
   - Shows `Sun` icon in dark mode (click → light)
   - Shows `Moon` icon in light mode (click → dark)
4. Styled with theme CSS variables (bg-card, text-foreground, border-border)
5. Must be a client component (uses useTheme hook)

### Acceptance Criteria
- [ ] File exists at `src/components/header.tsx`
- [ ] Named export: `Header`
- [ ] Displays "DevDeck" text
- [ ] Has a functioning theme toggle button
- [ ] Uses Phosphor icons (TerminalWindow, Sun, Moon)
- [ ] Styled with CSS variable-based classes

### Test Coverage
- Covered by smoke test (TASK-1.7) for rendering
- Theme toggle tested via ThemeProvider tests (TASK-1.2)

---

## Task 1.6: Rewrite page.tsx as DevDeck shell layout

- **Status:** Pending
- **Complexity:** High
- **Dependencies:** TASK-1.3, TASK-1.4, TASK-1.5
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0007

### Description
Replace `src/app/page.tsx` entirely with the DevDeck shell:
1. Mark as `"use client"`
2. Import `PanelGroup`, `Panel`, `PanelResizeHandle` from `react-resizable-panels`
3. Import `ErrorBoundary` from `@/components/error-boundary`
4. Import `Header` from `@/components/header`
5. Structure:
   - Outer div: `flex h-screen flex-col` (fills viewport)
   - `<Header />`
   - `<PanelGroup direction="horizontal" className="flex-1">`
     - Panel 1 (25%, min 15%): "File Explorer" with `FolderOpen` icon
     - PanelResizeHandle
     - Panel 2 (50%, min 30%): "Editor" with `Code` icon
     - PanelResizeHandle
     - Panel 3 (25%, min 15%): "Terminal" with `TerminalWindow` icon
   - Each panel wrapped in `<ErrorBoundary>`
6. Placeholder panel content: centered Phosphor icon + label, styled with muted colors
7. Optional: subtle framer-motion fade-in on mount (opacity 0→1, duration 200ms)

### Acceptance Criteria
- [ ] No Next.js boilerplate remains
- [ ] Three resizable panels visible
- [ ] Panels can be resized by dragging handles
- [ ] Each panel wrapped in ErrorBoundary
- [ ] Panel labels visible: "File Explorer", "Editor", "Terminal"
- [ ] Phosphor icons render in each panel
- [ ] Layout fills viewport height without outer scrollbar
- [ ] `just build` passes
- [ ] `just dev` shows DevDeck shell

### Test Coverage
- Smoke test (TASK-1.7)
- Manual verification of resize behavior

---

## Task 1.7: Add smoke test for page

- **Status:** Pending
- **Complexity:** Low
- **Dependencies:** TASK-1.6
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0007

### Description
Create `src/app/page.test.tsx`:
1. Import `render`, `screen` from `@testing-library/react`
2. Import `Home` (default export) from `./page`
3. Mock `react-resizable-panels` if needed (or let it render)
4. Tests:
   - "renders DevDeck header" — `screen.getByText("DevDeck")`
   - "renders panel placeholders" — check for "File Explorer", "Editor", "Terminal" text
5. Keep test minimal — no interaction tests in smoke

### Acceptance Criteria
- [ ] File exists at `src/app/page.test.tsx`
- [ ] Test passes with `just test`
- [ ] Verifies "DevDeck" text is rendered
- [ ] Verifies at least one panel label is rendered
- [ ] No flaky behavior (no timers, no async waits needed)

### Test Coverage
- This IS the test coverage for the shell layout
- `just test` must pass with 0 failures

---

## Task 1.8: Validate full check pipeline

- **Status:** Pending
- **Complexity:** Low
- **Dependencies:** TASK-1.7
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006

### Description
Run the complete `just check` pipeline and fix any issues:
1. `just lint` — ESLint passes on all new/modified files
2. `just format-check` — Prettier formatting is correct
3. `just build` — Next.js production build succeeds
4. `just test` — All vitest tests pass

Fix any issues found (import ordering, formatting, type errors, etc.)

### Acceptance Criteria
- [ ] `just lint` exits 0
- [ ] `just format-check` exits 0
- [ ] `just build` exits 0
- [ ] `just test` exits 0
- [ ] `just check` (all four sequential) exits 0

### Test Coverage
- The pipeline itself validates all test coverage
- No additional tests needed for this task
