# Test Plan: Issue #44 — Add Selectable Terminal Color Themes

---

## Test T-01: Theme data — all 13 themes present with unique IDs

- **Type:** Unit
- **Task:** Task 1
- **Priority:** High

### Setup
Import `TERMINAL_THEMES` from `src/hooks/use-terminal-theme.ts`.

### Steps
1. Assert `TERMINAL_THEMES.length === 13`
2. Extract all `id` values and assert they are unique (no duplicates)
3. Assert the expected IDs are present: `catppuccin`, `dracula`, `solarized-dark`, `solarized-light`, `monokai`, `gruvbox-dark`, `nord`, `one-dark`, `tokyo-night`, `github-dark`, `github-light`, `ayu-dark`, `material-palenight`

### Expected Result
All 13 themes exist with unique, expected string IDs.

---

## Test T-02: Theme data — every theme has valid ITheme color properties

- **Type:** Unit
- **Task:** Task 1
- **Priority:** High

### Setup
Import `TERMINAL_THEMES` from `src/hooks/use-terminal-theme.ts`.

### Steps
1. For each theme in `TERMINAL_THEMES`:
   a. Assert `colors.background` is a non-empty string matching hex color pattern `/^#[0-9a-fA-F]{6}$/`
   b. Assert `colors.foreground` matches hex pattern
   c. Assert `colors.cursor` matches hex pattern
   d. Assert `colors.selectionBackground` matches hex pattern (may include alpha: 8 hex chars)
   e. Assert all 8 ANSI colors exist and match hex pattern: `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`
   f. Assert all 8 bright ANSI colors exist and match hex pattern
2. Assert every theme has a non-empty `label` string

### Expected Result
All 13 themes have valid hex color values for all 20 required ITheme properties and a non-empty label.

---

## Test T-03: useTerminalTheme — default theme is catppuccin

- **Type:** Unit
- **Task:** Task 1
- **Priority:** High

### Setup
Clear `localStorage.removeItem('devdeck-terminal-theme')`. Render hook via `renderHook(() => useTerminalTheme())`.

### Steps
1. Read `result.current.themeId`
2. Read `result.current.theme.id`

### Expected Result
Both return `'catppuccin'`.

---

## Test T-04: useTerminalTheme — setThemeId persists to localStorage

- **Type:** Unit
- **Task:** Task 1
- **Priority:** High

### Setup
Render hook via `renderHook(() => useTerminalTheme())`.

### Steps
1. Call `act(() => result.current.setThemeId('dracula'))`
2. Read `localStorage.getItem('devdeck-terminal-theme')`
3. Read `result.current.themeId`

### Expected Result
localStorage contains `'dracula'`. Hook returns `themeId === 'dracula'` and `theme.id === 'dracula'`.

---

## Test T-05: useTerminalTheme — invalid localStorage value falls back to catppuccin

- **Type:** Unit
- **Task:** Task 1
- **Priority:** Medium

### Setup
Set `localStorage.setItem('devdeck-terminal-theme', 'nonexistent-theme')`. Render hook.

### Steps
1. Read `result.current.themeId` after mount/effect

### Expected Result
Returns `'catppuccin'` (fallback).

---

## Test T-06: useTerminalTheme — restores persisted theme on mount

- **Type:** Unit
- **Task:** Task 1
- **Priority:** High

### Setup
Set `localStorage.setItem('devdeck-terminal-theme', 'nord')`. Render hook.

### Steps
1. Wait for effects to run
2. Read `result.current.themeId`

### Expected Result
Returns `'nord'`.

---

## Test T-07: useTerminal — constructor receives provided theme

- **Type:** Unit
- **Task:** Task 2
- **Priority:** High

### Setup
Use existing test mocks. Import a theme from `TERMINAL_THEMES`.

### Steps
1. Render `useTerminal({ wsUrl: 'ws://test:3100', theme: draculaTheme.colors })`
2. Inspect `terminalConstructorOptions.theme`

### Expected Result
Terminal constructor options include the provided Dracula theme object.

---

## Test T-08: useTerminal — runtime theme change updates terminal.options.theme

- **Type:** Unit
- **Task:** Task 2
- **Priority:** High

### Setup
Use existing test mocks. Add an `options` setter spy to `fakeTerminal`.

### Steps
1. Render `useTerminal` with initial theme A
2. Re-render with theme B
3. Check that `fakeTerminal.options.theme` was set to theme B

### Expected Result
`terminal.options.theme` is updated to the new theme without reconnect.

---

## Test T-09: useTerminal — theme change does not trigger reconnection

- **Type:** Unit
- **Task:** Task 2
- **Priority:** High

### Setup
Use existing test mocks. Track `wsInstances.length`.

### Steps
1. Render `useTerminal` with theme A, wait for WS connection
2. Record `wsInstances.length`
3. Re-render with theme B
4. Check `wsInstances.length` has not increased

### Expected Result
No new WebSocket instances created. Terminal stays connected.

---

## Test T-10: TerminalPanel — root div has dynamic background style

- **Type:** Component
- **Task:** Task 3
- **Priority:** High

### Setup
Mock `useTerminalTheme` to return a theme with `background: '#282a36'` (Dracula). Mock `useTerminal`. Render `<TerminalPanel />`.

### Steps
1. Query `[data-testid="terminal-panel"]`
2. Check `style.backgroundColor`

### Expected Result
`backgroundColor` is `'#282a36'` (not hardcoded `#1e1e2e`).

---

## Test T-11: TerminalPanel — StatusOverlay has dynamic background

- **Type:** Component
- **Task:** Task 3
- **Priority:** Medium

### Setup
Mock `useTerminalTheme` to return Dracula. Mock `useTerminal` to return `status: 'connecting'`. Render `<TerminalPanel />`.

### Steps
1. Query the StatusOverlay element
2. Check its `style.backgroundColor`

### Expected Result
Background color is derived from the Dracula theme background (with alpha/opacity).

---

## Test T-12: TerminalPanel — ThemePicker renders in header

- **Type:** Component
- **Task:** Task 3
- **Priority:** Medium

### Setup
Render `<TerminalPanel />` with mocked hooks.

### Steps
1. Query for the theme picker trigger button (by aria-label, test-id, or icon)

### Expected Result
Theme picker trigger is present in the DOM within the header bar.

---

## Test T-13: ThemePicker — renders all 13 theme options

- **Type:** Component
- **Task:** Task 4
- **Priority:** High

### Setup
Render the ThemePicker component (or open the dropdown in TerminalPanel). Provide mock `useTerminalTheme` returning full themes array.

### Steps
1. Click the Palette trigger to open the dropdown
2. Query all theme menu items

### Expected Result
13 menu items are rendered, each with its theme label.

---

## Test T-14: ThemePicker — selecting a theme calls setThemeId

- **Type:** Component
- **Task:** Task 4
- **Priority:** High

### Setup
Render ThemePicker with a spy on `setThemeId`.

### Steps
1. Open dropdown
2. Click the "Dracula" option

### Expected Result
`setThemeId` is called with `'dracula'`.

---

## Test T-15: ThemePicker — active theme has visual indicator

- **Type:** Component
- **Task:** Task 4
- **Priority:** Medium

### Setup
Render ThemePicker with `themeId: 'nord'`.

### Steps
1. Open dropdown
2. Find the "Nord" menu item
3. Check for active indicator (check mark icon, aria-checked, or highlight class)

### Expected Result
The Nord item has a distinguishing visual indicator that other items do not.
