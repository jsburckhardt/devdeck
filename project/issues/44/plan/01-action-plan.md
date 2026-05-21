# Action Plan: Add Selectable Terminal Color Themes

## Feature
- **ID:** 44
- **Research Brief:** project/issues/44/research/00-research.md

## ADRs Created
None — this feature operates within the existing tech stack (ADR-0002).

## Core-Components Updated
- **CORE-COMPONENT-0004 (Theming)** — Updated to add terminal theme independence rules, `useTerminalTheme()` hook interface, terminal palette scope, and exemption from Decision #57 for xterm.js.

## Implementation Tasks

### Task 1: Create `use-terminal-theme` hook and theme definitions
Create `src/hooks/use-terminal-theme.ts` containing:
- `TerminalThemeDefinition` type (`{ id: string; label: string; colors: ITheme }`)
- `TERMINAL_THEMES` array with all 13 theme definitions
- `useTerminalTheme()` hook with localStorage persistence under `devdeck-terminal-theme`
- SSR-safe initialization (default to `catppuccin` server-side, hydrate from localStorage client-side)

### Task 2: Update `use-terminal` hook to accept dynamic theme
Modify `src/hooks/use-terminal.ts` to:
- Accept optional `theme?: ITheme` in `UseTerminalOptions`
- Remove hardcoded `CATPPUCCIN_THEME` constant (moved to theme definitions)
- Pass `theme` to Terminal constructor
- Add a `useEffect` that updates `terminal.options.theme` at runtime when theme changes

### Task 3: Update `terminal-panel.tsx` — dynamic backgrounds and theme picker
Modify `src/components/terminal-panel.tsx` to:
- Wire `useTerminalTheme()` and pass theme to `useTerminal()`
- Replace both hardcoded `bg-[#1e1e2e]` with dynamic inline `style={{ backgroundColor }}` 
- Add ThemePicker to the header bar

### Task 4: Create ThemePicker component
Create a theme picker component (inline in terminal-panel or separate file) using:
- shadcn/ui `DropdownMenu` with portal rendering (z-index safety)
- `Palette` icon from `@phosphor-icons/react` as trigger
- Color swatches showing each theme's background + foreground + accent colors
- Active theme indicator

### Task 5: Write tests
- New: `src/hooks/use-terminal-theme.test.ts` — theme data integrity, hook behavior, persistence
- Extend: `src/hooks/use-terminal.test.ts` — constructor theme option, runtime update, no reconnect
- New/extend: terminal panel and ThemePicker tests
