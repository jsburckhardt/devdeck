# CORE-COMPONENT-0004: Theming

## Status

Adopted (updated)

## Purpose

Provide a consistent dark/light theme system across the entire application, including the file explorer and all UI components. Additionally, provide an independent, user-selectable terminal color theme system for xterm.js that persists across sessions. The app theme controls the shell UI; the terminal theme controls the xterm.js canvas independently.

## Scope

- CSS custom properties for all color tokens (app UI)
- Theme toggle component (dark/light) for the app shell
- Terminal color theme palette (13 predefined themes selectable by the user)
- Terminal theme persistence in localStorage under `devdeck-terminal-theme`
- xterm.js theme configuration via `ITheme` objects
- System preference detection (app theme only)

## Definition

### Rules
- All app UI colors MUST be defined as CSS custom properties using oklch color space
- Theme switching MUST use a `.dark` class on the root element
- App theme preference MUST persist in localStorage under key `theme`
- All shadcn/ui components MUST use the theme CSS variables
- Default app theme MUST be dark (IDE convention)
- Third-party rendering libraries with their own theme systems (e.g., mermaid) MUST consume `useTheme()` and map app theme values to their native theme tokens — **except** for the terminal (xterm.js), which is user-controlled (see below)
- Excalidraw (`@excalidraw/excalidraw`) MUST receive `theme="dark"` when app theme is `"dark"` and `theme="light"` when app theme is `"light"`
- Terminal color themes MUST be user-selectable from a predefined palette of 13 named themes
- Terminal theme selection MUST persist independently in localStorage under key `devdeck-terminal-theme`
- Terminal theme changes MUST apply at runtime via `terminal.options.theme` without terminal reconnection or re-instantiation
- The default terminal theme MUST be `catppuccin` (Catppuccin Mocha) to preserve existing behavior
- Terminal theme selection MUST be independent of the app dark/light theme toggle; no mapping between them is required
- Decision #57 (require third-party renderers to consume `useTheme()`) does NOT apply to the terminal (xterm.js) — terminal themes are user-controlled via the terminal theme palette

### Interfaces
- **CSS variables:** Standard shadcn/ui variable names (`--background`, `--foreground`, `--card`, `--accent`, etc.)
- **Theme hook (app):** `useTheme()` — returns `{ theme, setTheme, toggleTheme }`
- **ThemeProvider:** Wraps the app, manages `.dark` class and localStorage sync
- **Terminal theme hook:** `useTerminalTheme()` — returns `{ themeId, theme, setThemeId, themes }` where `themeId` is the string key, `theme` is the resolved `ITheme` object, `setThemeId` switches and persists, and `themes` is the full palette array
- **Terminal theme data:** `TERMINAL_THEMES` — array of `{ id: string; label: string; colors: ITheme }` objects for all 13 themes

### Expectations
- Theme transitions SHOULD be smooth (CSS transition on background-color) for app theme
- All foreground/background pairings MUST meet WCAG AA contrast requirements (4.5:1 minimum) for app theme
- Terminal theme changes MUST be visually immediate (no flash, no reconnect)
- The terminal panel background (`bg-[...]`) MUST dynamically match the active terminal theme's `background` color

## Rationale

Using CSS custom properties with oklch provides perceptually uniform color manipulation. The `.dark` class pattern is standard for Tailwind CSS v4 and shadcn/ui. localStorage persistence is the simplest and most reliable client-side storage for theme preference.

## Usage Examples

```css
:root {
  --background: oklch(0.98 0.01 250);
  --foreground: oklch(0.15 0.01 250);
  --accent: oklch(0.65 0.15 195);
}

.dark {
  --background: oklch(0.14 0.02 250);
  --foreground: oklch(0.85 0.01 250);
  --accent: oklch(0.70 0.15 195);
}
```

```typescript
// App theme toggle
const { theme, toggleTheme } = useTheme();
<Button onClick={toggleTheme}>
  {theme === 'dark' ? <Sun /> : <Moon />}
</Button>
```

```typescript
// Terminal theme selection
import { useTerminalTheme } from '@/hooks/use-terminal-theme';

const { themeId, theme, setThemeId, themes } = useTerminalTheme();

// Switch terminal theme at runtime (persists to localStorage)
setThemeId('dracula');

// Pass to useTerminal
const terminal = useTerminal({ slug, theme: theme.colors });
```

## Integration Guidelines

- ThemeProvider should wrap the root layout in `src/app/layout.tsx`
- Theme CSS variables should be defined in `src/app/globals.css`
- Terminal theme MUST be managed by `useTerminalTheme()` in `src/hooks/use-terminal-theme.ts`, NOT derived from CSS custom properties
- `useTerminal()` in `src/hooks/use-terminal.ts` MUST accept an optional `theme?: ITheme` parameter and apply it to the Terminal constructor; a separate `useEffect` MUST update `terminal.options.theme` at runtime when the theme changes
- Terminal panel background MUST use inline styles from the active terminal theme's `background` color instead of hardcoded Tailwind classes
- Use `next-themes` or a custom provider for SSR-safe app theme management
- Third-party renderers (except terminal): map `theme === 'dark'` to the library's dark theme token and `theme === 'light'` to the library's default/light theme token. For mermaid: `dark` → `'dark'`, `light` → `'default'`
- For Excalidraw: `dark` → `'dark'`, `light` → `'light'`. Note: unlike Mermaid, the light theme maps to `'light'` (not `'default'`)

## Exceptions

- Print stylesheets may use a fixed light theme regardless of user preference

## Enforcement

- [x] Automated checks: Visual regression tests for both themes
- [x] Code review checklist: New components must use theme CSS variables, not hardcoded colors
- [x] Test coverage requirements: Theme toggle functionality must be tested

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md)
