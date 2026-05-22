# Implementation Notes — Issue #44: Add Selectable Terminal Color Themes

## Task 1: Create `use-terminal-theme` hook and theme definitions

- **Status:** Complete
- **Files Changed:** `src/hooks/use-terminal-theme.ts` (new)
- **Tests Passed:** 6
- **Tests Failed:** 0

### Changes Summary
Created `src/hooks/use-terminal-theme.ts` with:
- `TerminalThemeDefinition` interface (`id`, `label`, `colors: ITheme`)
- `TERMINAL_THEMES` constant array with all 13 theme definitions (Catppuccin Mocha, Dracula, Solarized Dark, Solarized Light, Monokai, Gruvbox Dark, Nord, One Dark, Tokyo Night, GitHub Dark, GitHub Light, Ayu Dark, Material Palenight)
- `useTerminalTheme()` hook with SSR-safe localStorage hydration, default to `catppuccin`, persistence on change

### Test Results
- T-01: 13 themes present with unique IDs ✅
- T-02: Every theme has valid ITheme color properties ✅
- T-03: Default theme is catppuccin ✅
- T-04: setThemeId persists to localStorage ✅
- T-05: Invalid localStorage value falls back to catppuccin ✅
- T-06: Restores persisted theme on mount ✅

---

## Task 2: Update `use-terminal` hook to accept dynamic theme

- **Status:** Complete
- **Files Changed:** `src/hooks/use-terminal.ts`
- **Tests Passed:** 20 (17 existing + 3 new)
- **Tests Failed:** 0

### Changes Summary
- Added `theme?: ITheme` to `UseTerminalOptions` interface
- Removed hardcoded `CATPPUCCIN_THEME` constant; now imports from `use-terminal-theme.ts` via `TERMINAL_THEMES[0].colors`
- Terminal constructor uses `options?.theme ?? DEFAULT_THEME`
- Added runtime `useEffect` that watches `options?.theme` and applies `termRef.current.options.theme` without reconnection
- Theme intentionally excluded from `connect` callback dependencies to prevent reconnection

### Test Results
- T-27: Terminal constructor receives provided theme ✅
- T-28: Runtime theme change updates terminal.options.theme without reconnect ✅
- T-29: No theme provided falls back to default ✅
- All 17 existing tests continue to pass ✅

---

## Task 3: Update `terminal-panel.tsx` — dynamic backgrounds and ThemePicker

- **Status:** Complete
- **Files Changed:** `src/components/terminal-panel.tsx`
- **Tests Passed:** All existing tests pass
- **Tests Failed:** 0

### Changes Summary
- Imported and called `useTerminalTheme()` to get active theme
- Passed `theme.colors` to `useTerminal({ slug, theme: theme.colors })`
- Replaced hardcoded `bg-[#1e1e2e]` with inline `style={{ backgroundColor: theme.colors.background }}`
- Updated `StatusOverlay` to accept `bgColor` prop; uses inline style with hex alpha (`+ "cc"`) for ~80% opacity
- Added `ThemePicker` component inline using `@radix-ui/react-dropdown-menu` directly (same pattern as `project-card.tsx`)
- ThemePicker shows color swatches (background, foreground, green, blue), theme label, and check mark for active theme
- Trigger button uses `Palette` icon from `@phosphor-icons/react` with `data-testid="theme-picker-trigger"`

---

## Task 4: ThemePicker component (inline in terminal-panel.tsx)

- **Status:** Complete (implemented inline as part of Task 3)
- **Files Changed:** `src/components/terminal-panel.tsx`

### Changes Summary
ThemePicker implemented as a local function component within `terminal-panel.tsx`:
- Uses `@radix-ui/react-dropdown-menu` with portal rendering
- Palette icon trigger with title="Terminal theme"
- 13 theme options with 4 color swatches each
- Check mark indicator for active theme
- `data-testid` attributes for all interactive elements

---

## Task 5: Write comprehensive tests

- **Status:** Complete
- **Files Changed:** `src/hooks/use-terminal-theme.test.ts` (new), `src/hooks/use-terminal.test.ts` (extended)
- **Tests Passed:** 26 (6 new theme tests + 20 terminal tests including 3 new)
- **Tests Failed:** 0

### Changes Summary
- Created `src/hooks/use-terminal-theme.test.ts` with tests T-01 through T-06
- Extended `src/hooks/use-terminal.test.ts` with tests T-27 through T-29
- Added `options` property to `fakeTerminal` mock and reset in `beforeEach`
- Imported `TERMINAL_THEMES` in use-terminal test file

### Overall Test Results
- **Total test files:** 25 passed
- **Total tests:** 263 passed
- **Build:** Successful
- **Lint:** Clean
- **Format:** Clean
