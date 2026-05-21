# Task Breakdown: Issue #44 — Add Selectable Terminal Color Themes

## Task 1: Create `use-terminal-theme` hook and theme definitions

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0008

### Description
Create `src/hooks/use-terminal-theme.ts` with:
1. A `TerminalThemeDefinition` interface: `{ id: string; label: string; colors: ITheme }` where `ITheme` matches the 20-property subset used by the existing Catppuccin theme (background, foreground, cursor, selectionBackground, 8 ANSI colors, 8 bright ANSI colors).
2. A `TERMINAL_THEMES` constant array with all 13 theme definitions: Catppuccin Mocha, Dracula, Solarized Dark, Solarized Light, Monokai, Gruvbox Dark, Nord, One Dark, Tokyo Night, GitHub Dark, GitHub Light, Ayu Dark, Material Palenight.
3. A `DEFAULT_TERMINAL_THEME_ID` constant set to `'catppuccin'`.
4. A `useTerminalTheme()` hook that:
   - Reads `devdeck-terminal-theme` from localStorage on mount (in `useEffect` to avoid SSR mismatch)
   - Falls back to `'catppuccin'` when key is missing or invalid
   - Returns `{ themeId, theme, setThemeId, themes }` where `theme` is the resolved `TerminalThemeDefinition`
   - Persists to localStorage on change

### Acceptance Criteria
- [ ] `TERMINAL_THEMES` contains exactly 13 entries
- [ ] Every entry has a unique `id`, non-empty `label`, and `colors` object with all 20 ITheme properties
- [ ] `useTerminalTheme()` returns `catppuccin` theme by default when no localStorage value exists
- [ ] `setThemeId('dracula')` updates localStorage key `devdeck-terminal-theme` to `'dracula'`
- [ ] Invalid localStorage values fall back to `catppuccin`
- [ ] Hook is SSR-safe: no `window`/`localStorage` access during initial render

### Test Coverage
- Unit tests for theme data integrity (13 themes, unique IDs, valid color properties)
- Unit tests for `useTerminalTheme()`: default state, persistence, invalid key fallback, SSR safety
- See Test Plan: T-01 through T-06

---

## Task 2: Update `use-terminal` hook to accept dynamic theme

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** Task 1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0003

### Description
Modify `src/hooks/use-terminal.ts` to:
1. Add `theme?: ITheme` to `UseTerminalOptions` interface (import `ITheme` from `@xterm/xterm`).
2. Remove the hardcoded `CATPPUCCIN_THEME` constant (it now lives in `use-terminal-theme.ts`).
3. Use `options?.theme` in the Terminal constructor: `theme: options?.theme ?? defaultTheme` (import the default from the theme module or use a minimal fallback).
4. Add a `useEffect` that watches the `theme` option and applies `termRef.current.options.theme = theme` at runtime without reconnecting or re-instantiating the terminal.
5. Expose `termRef` internally so the runtime effect can access it.

### Acceptance Criteria
- [ ] `UseTerminalOptions` includes optional `theme` field typed as xterm.js `ITheme`
- [ ] Terminal constructor uses the provided theme or defaults to Catppuccin Mocha
- [ ] Changing the `theme` prop at runtime calls `terminal.options.theme = newTheme`
- [ ] Theme change does NOT trigger WebSocket reconnection or terminal re-instantiation
- [ ] Existing tests continue to pass (backward compatible — `theme` is optional)

### Test Coverage
- Unit test: Terminal constructor receives provided theme in options
- Unit test: runtime theme update sets `terminal.options.theme` without reconnect
- Unit test: no theme provided falls back to default
- See Test Plan: T-07 through T-09

---

## Task 3: Update `terminal-panel.tsx` — dynamic backgrounds and theme wiring

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** Task 1, Task 2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0007

### Description
Modify `src/components/terminal-panel.tsx` to:
1. Import and call `useTerminalTheme()` to get the active theme.
2. Pass `theme.colors` to `useTerminal({ slug, theme: theme.colors })`.
3. Replace hardcoded `bg-[#1e1e2e]` on the root div (line 24) with `style={{ backgroundColor: theme.colors.background }}`.
4. Replace hardcoded `bg-[#1e1e2e]/80` on the `StatusOverlay` (line 95) with `style={{ backgroundColor: theme.colors.background + 'cc' }}` (hex with alpha) or equivalent rgba approach.
5. Add the ThemePicker component (from Task 4) in the header bar between the "Terminal" label and the status indicator.

### Acceptance Criteria
- [ ] No hardcoded `bg-[#1e1e2e]` remains in terminal-panel.tsx
- [ ] Panel root background dynamically matches active terminal theme's background color
- [ ] StatusOverlay background dynamically matches active terminal theme's background color (with ~80% opacity)
- [ ] ThemePicker is rendered in the terminal header bar
- [ ] Changing theme via picker updates both xterm.js canvas and panel backgrounds immediately

### Test Coverage
- Component test: panel root has dynamic background style
- Component test: StatusOverlay has dynamic background style
- Component test: ThemePicker renders in header
- See Test Plan: T-10 through T-12

---

## Task 4: Create ThemePicker component

- **Status:** Pending
- **Complexity:** Low-Medium
- **Dependencies:** Task 1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004

### Description
Create a ThemePicker component (either in `src/components/theme-picker.tsx` or inline in `terminal-panel.tsx`) that:
1. Uses shadcn/ui `DropdownMenu` with `DropdownMenuContent` rendered via portal (for z-index safety over xterm.js canvas).
2. Trigger button uses `Palette` icon from `@phosphor-icons/react`.
3. Each menu item shows:
   - A row of small color swatches (background, foreground, and 2-3 ANSI accent colors like red, green, blue)
   - The theme label text
   - A check mark or highlight for the currently active theme
4. Clicking a theme item calls `setThemeId(id)` from `useTerminalTheme()`.
5. Picker chrome uses app CSS variables (not terminal theme colors) for its own styling.

### Acceptance Criteria
- [ ] Dropdown trigger has `Palette` icon and is accessible (has aria-label or title)
- [ ] All 13 themes are listed with label and color swatches
- [ ] Active theme has a visual indicator (check mark or highlight)
- [ ] Selecting a theme calls `setThemeId` and closes the dropdown
- [ ] Dropdown renders above the xterm.js canvas (portal rendering, proper z-index)
- [ ] Picker uses app theme CSS variables for its own styling (not terminal colors)

### Test Coverage
- Component test: renders 13 theme options
- Component test: clicking a theme calls setThemeId
- Component test: active theme has indicator
- See Test Plan: T-13 through T-15

---

## Task 5: Write comprehensive tests

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** Task 1, Task 2, Task 3, Task 4
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0006

### Description
Create and extend test files:
1. **New:** `src/hooks/use-terminal-theme.test.ts` — tests for theme data, hook behavior, persistence, SSR
2. **Extend:** `src/hooks/use-terminal.test.ts` — tests for theme constructor option, runtime update, no-reconnect guarantee
3. **New/extend:** Terminal panel and ThemePicker component tests

Each task above lists specific test coverage requirements; this task ensures all are implemented and passing.

### Acceptance Criteria
- [ ] All tests from the test plan (T-01 through T-15) are implemented and passing
- [ ] No existing tests are broken
- [ ] Test files are co-located next to source files per CORE-COMPONENT-0006

### Test Coverage
- See full Test Plan at `project/issues/44/plan/03-test-plan.md`
