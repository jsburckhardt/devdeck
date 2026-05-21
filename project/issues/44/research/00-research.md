# Research Brief: Issue #44 — Add Selectable Terminal Color Themes

## GitHub Issue

- **Issue:** #44
- **Title:** feat(terminal): add selectable terminal color themes with palette picker
- **Description:** Add selectable terminal color themes (Dracula, Solarized, Monokai, Gruvbox, Nord, One Dark, Tokyo Night, GitHub, Ayu, Material, …) with a palette picker over the terminal panel.

---

## Scope Classification

- **scope_type:** `issue`
- **Rationale:** This is a self-contained UI and state-management feature within the existing terminal panel. The tech stack (Next.js, xterm.js, TypeScript, Tailwind, shadcn/ui, vitest) is fully established by ADR-0002. No new framework, storage system, or platform architecture is introduced. The feature extends the existing theming system governed by CORE-COMPONENT-0004, which must be **updated** (not replaced) to accommodate independent terminal theme selection. No new ADR is required.

---

## ADRs and Core-Components

- **New ADR required:** No.
- **Existing ADR affected:** None directly — stays within ADR-0002 tech-stack boundaries.
- **Core-component update required:** **Yes — CORE-COMPONENT-0004 (Theming)** must be amended.

### Why CORE-COMPONENT-0004 Must Be Updated

Current rules in CORE-COMPONENT-0004 state:

> "The terminal (xterm.js) MUST respect the current theme"
> "Terminal theme: Derived from CSS variables, passed to xterm.js ITheme"

And in Integration Guidelines:

> "Terminal theme should be derived in `src/hooks/use-terminal.ts` by reading CSS custom property values"

These rules are inconsistent with the proposed independent terminal theme selection. Furthermore, the current implementation at `src/hooks/use-terminal.ts:30-51` does NOT derive the theme from CSS variables — it uses a hardcoded `CATPPUCCIN_THEME` constant. The rules need to be corrected and extended to allow user-controlled terminal themes independent of the app dark/light theme.

Decision #57 in DECISION-LOG.md states: "Require third-party rendering libraries to consume useTheme() and map app theme to their native theme tokens." This was written to cover mermaid diagrams and Excalidraw; the terminal should be explicitly carved out as a user-controlled independent preference.

The Planner must update CORE-COMPONENT-0004 and add new entries to DECISION-LOG.md before implementation begins.

---

## Problem Statement

The terminal in DevDeck currently renders with a hardcoded Catppuccin Mocha color scheme defined as `CATPPUCCIN_THEME` at `src/hooks/use-terminal.ts:30-51`. The panel background is hardcoded as `bg-[#1e1e2e]` (Catppuccin Mocha's background hex) at `src/components/terminal-panel.tsx:24` and `line 95`. There is no way for users to change this.

Developers using DevDeck have strong, established preferences for terminal color themes — Dracula, Solarized, Monokai, Gruvbox, Nord, One Dark, Tokyo Night, GitHub, Ayu, and Material are all widely used and immediately recognizable. Providing a palette picker in the terminal panel header bar delivers a high-impact UX improvement with minimal risk to the terminal communication layer.

---

## Architecture and Documentation Findings

| Artifact | Finding |
|---|---|
| `src/hooks/use-terminal.ts:30-51` | `CATPPUCCIN_THEME` is a module-level constant. `Terminal` is constructed with it at line 110. No runtime theme update path exists in current code. |
| `src/hooks/use-terminal.ts:105-113` | Terminal constructor options include `theme: CATPPUCCIN_THEME`. The xterm.js `ITerminalOptions.theme` field accepts an `ITheme` object. |
| `src/components/terminal-panel.tsx:24` | `bg-[#1e1e2e]` hardcodes Catppuccin Mocha background on the panel root div. |
| `src/components/terminal-panel.tsx:95` | `bg-[#1e1e2e]/80` hardcodes Catppuccin Mocha on `StatusOverlay`. Both must be made dynamic. |
| `src/components/theme-provider.tsx:1-53` | Provides dark/light app theme via `useTheme()`. Returns `{ theme, setTheme, toggleTheme }`. Terminal themes should be **independent** of this. |
| `src/app/globals.css:1-73` | CSS custom properties use oklch color space for app theme. xterm.js `ITheme` uses raw hex strings — separate systems, no conflict. |
| `CORE-COMPONENT-0004` | Current rules require terminal theme to be derived from CSS vars and respect app theme. This must be amended. |
| `CORE-COMPONENT-0004:74` | Integration guideline says "derive terminal theme in use-terminal.ts by reading CSS custom property values" — inconsistent with current code and proposed approach. |
| `CORE-COMPONENT-0008` | localStorage keys: `theme` (dark/light), `devdeck-open-projects` (slug array). Pattern: string values under flat keys. Terminal theme should follow this: `devdeck-terminal-theme`. |
| `ADR-0002` | Tech stack: Next.js App Router, TypeScript strict, xterm.js, Tailwind CSS v4, shadcn/ui, vitest. All remain unchanged. |
| `DECISION-LOG.md:87` | Decision #57: third-party renderers must consume `useTheme()` and map to native tokens. Terminal theme picker supersedes this for xterm.js, making it user-controlled rather than app-theme-mapped. |

---

## xterm.js ITheme Interface

The full `ITheme` interface has 26 optional properties. The existing `CATPPUCCIN_THEME` uses 20 of the 26 properties (omits `cursorAccent`, `selectionForeground`, `selectionInactiveBackground`, scrollbar colors, ruler border, and `extendedAnsi`). All new themes should use the same 20-property subset.

**Runtime update (no reconnect):** `terminal.options.theme = newTheme` applies immediately without re-instantiating or reconnecting the terminal. This is the critical fact that makes runtime theme switching seamless.

---

## Terminal Theme Palette — 13 Themes

All themes provide: `background`, `foreground`, `cursor`, `selectionBackground`, plus 16 ANSI colors (black, red, green, yellow, blue, magenta, cyan, white, and their bright variants).

1. **Catppuccin Mocha** (existing — keep as default)
2. **Dracula**
3. **Solarized Dark**
4. **Solarized Light**
5. **Monokai**
6. **Gruvbox Dark**
7. **Nord**
8. **One Dark**
9. **Tokyo Night**
10. **GitHub Dark**
11. **GitHub Light**
12. **Ayu Dark**
13. **Material Palenight**

---

## Terminal Theme Independence from App Theme

The terminal theme **must be independent** of the dark/light app theme toggle:

1. Terminal color schemes are developer identity/comfort preferences, not UI mode preferences.
2. Developers may want GitHub Light terminal with dark app UI.
3. The existing Catppuccin Mocha is already independent — it does not change when toggling dark/light.
4. The xterm.js canvas renders independently of CSS; it never inherits Tailwind CSS variables anyway.

---

## Proposed Implementation Surfaces

### 1. New: `src/hooks/use-terminal-theme.ts`
New hook and theme data module with `TerminalThemeDefinition` interface, `TERMINAL_THEMES` array, `useTerminalTheme()` hook, and localStorage persistence under `devdeck-terminal-theme`.

### 2. Updated: `src/hooks/use-terminal.ts`
Accept optional `theme?: ITheme` in options, apply it to the Terminal constructor, and add a separate runtime-update effect via `term.options.theme = newTheme`.

### 3. Updated: `src/components/terminal-panel.tsx`
Wire `useTerminalTheme`, pass theme to `useTerminal`, replace both hardcoded `bg-[#1e1e2e]` occurrences with dynamic inline styles, and add the `ThemePicker` dropdown in the header bar.

### 4. New: `ThemePicker` component
A shadcn/ui `DropdownMenu` triggered by a `Palette` icon from `@phosphor-icons/react`, rendering theme color swatches and labels.

---

## CORE-COMPONENT-0004 Update Requirements

**Rules to add/change:**
1. Terminal color themes MUST be user-selectable from a predefined palette of named themes.
2. Terminal theme selection MUST persist independently in localStorage under `devdeck-terminal-theme`.
3. Terminal theme changes MUST apply at runtime via `terminal.options.theme` without terminal reconnection.
4. The default terminal theme MUST be `catppuccin` to preserve existing behavior.
5. Terminal theme selection is independent of the app dark/light theme; no mapping between them is required.
6. Remove/amend the rule that "terminal theme must be derived from CSS custom properties."

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `bg-[#1e1e2e]` hardcoded in 2 places | Replace both with inline styles from `terminalTheme.colors.background` |
| Terminal reconnects on theme change | Use `term.options.theme = newTheme` effect — no reconnect needed |
| SSR hydration mismatch from localStorage read | Initialize with default theme server-side; hydrate in `useEffect` client-side |
| Light themes look wrong if picker uses terminal colors for its UI | Picker uses app CSS vars for its own chrome |
| Dropdown renders under xterm.js canvas (z-index) | Use shadcn `DropdownMenuContent` with portal |
| CORE-COMPONENT-0004 conflict if not amended first | Plan stage must update CC-0004 and DECISION-LOG.md before implementation |

---

## Plan-Stage Handoff

1. **Amend CORE-COMPONENT-0004** with new terminal theme independence rules and update DECISION-LOG.md.
2. **Create `src/hooks/use-terminal-theme.ts`** with all 13 theme definitions.
3. **Update `src/hooks/use-terminal.ts`** to accept dynamic theme.
4. **Update `src/components/terminal-panel.tsx`** with theme picker and dynamic backgrounds.
5. **Create ThemePicker component** using shadcn/ui DropdownMenu.
6. **Write tests:** `use-terminal-theme.test.ts` (new), extend `use-terminal.test.ts`, extend/create terminal-panel tests.
