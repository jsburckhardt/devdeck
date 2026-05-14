# CORE-COMPONENT-0004: Theming

## Status

Adopted (updated)

## Purpose

Provide a consistent dark/light theme system across the entire application, including the terminal, file explorer, and all UI components. The theme must persist across sessions and match the professional, IDE-like aesthetic of the reference devhub application.

## Scope

- CSS custom properties for all color tokens
- Theme toggle component (dark/light)
- xterm.js theme configuration
- localStorage persistence
- System preference detection

## Definition

### Rules
- All colors MUST be defined as CSS custom properties using oklch color space
- Theme switching MUST use a `.dark` class on the root element
- Theme preference MUST persist in localStorage
- The terminal (xterm.js) MUST respect the current theme
- All shadcn/ui components MUST use the theme CSS variables
- Default theme MUST be dark (IDE convention)
- Third-party rendering libraries with their own theme systems (e.g., mermaid) MUST consume `useTheme()` and map app theme values to their native theme tokens
- Excalidraw (`@excalidraw/excalidraw`) MUST receive `theme="dark"` when app theme is `"dark"` and `theme="light"` when app theme is `"light"`

### Interfaces
- **CSS variables:** Standard shadcn/ui variable names (`--background`, `--foreground`, `--card`, `--accent`, etc.)
- **Theme hook:** `useTheme()` — returns `{ theme, setTheme, toggleTheme }`
- **ThemeProvider:** Wraps the app, manages `.dark` class and localStorage sync
- **Terminal theme:** Derived from CSS variables, passed to xterm.js `ITheme`

### Expectations
- Theme transitions SHOULD be smooth (CSS transition on background-color)
- All foreground/background pairings MUST meet WCAG AA contrast requirements (4.5:1 minimum)
- The theme MUST be consistent between the main UI and the terminal

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
// Theme toggle
const { theme, toggleTheme } = useTheme();
<Button onClick={toggleTheme}>
  {theme === 'dark' ? <Sun /> : <Moon />}
</Button>
```

## Integration Guidelines

- ThemeProvider should wrap the root layout in `src/app/layout.tsx`
- Theme CSS variables should be defined in `src/app/globals.css`
- Terminal theme should be derived in `src/hooks/use-terminal.ts` by reading CSS custom property values
- Use `next-themes` or a custom provider for SSR-safe theme management
- Third-party renderers: map `theme === 'dark'` to the library's dark theme token and `theme === 'light'` to the library's default/light theme token. For mermaid: `dark` → `'dark'`, `light` → `'default'`
- For Excalidraw: `dark` → `'dark'`, `light` → `'light'`. Note: unlike Mermaid, the light theme maps to `'light'` (not `'default'`)

## Exceptions

- Print stylesheets may use a fixed light theme regardless of user preference

## Enforcement

- [x] Automated checks: Visual regression tests for both themes
- [x] Code review checklist: New components must use theme CSS variables, not hardcoded colors
- [x] Test coverage requirements: Theme toggle functionality must be tested

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md)
