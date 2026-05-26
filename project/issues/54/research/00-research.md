# Research Brief: fix(terminal): tmux pane borders render as dashed lines due to excessive lineHeight

## GitHub Issue
- **Issue:** #54
- **Title:** fix(terminal): tmux pane borders render as dashed lines due to excessive lineHeight

## Scope Classification
- **Scope Type:** issue

## Problem Statement

The xterm.js `Terminal` instance in `src/hooks/use-terminal.ts` is constructed with `lineHeight: 1.5`.
This 50% extra inter-row spacing introduces a vertical gap between adjacent character rows.
Box-drawing characters used by tmux to render pane borders (`─`, `│`, `┌`, `┐`, `└`, `┘`) rely on
pixel-perfect vertical adjacency to form continuous lines. When the row gap exceeds zero, the border
segments no longer connect and render as dashed or broken lines.

Two properties in the xterm.js `ITerminalOptions` interface address this:

1. **`lineHeight`** - must be `1.0` so row glyphs touch at their pixel boundaries.
2. **`customGlyphs`** - must be `true` to instruct xterm.js to render box-drawing and block-element
   characters using its own canvas drawing routines instead of relying only on the system/web font.

The required code change is confined to the `Terminal` constructor options object in
`src/hooks/use-terminal.ts`. No backend changes, WebSocket protocol changes, theme changes, or
layout changes are required.

### Root Cause Location

`src/hooks/use-terminal.ts` constructs the terminal with the defective spacing:

```typescript
const term = new Terminal({
  cursorBlink: true,
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  lineHeight: 1.5,
  theme: themeRef.current ?? DEFAULT_THEME,
  allowProposedApi: true,
  screenReaderMode: true,
});
```

### Required Fix

```typescript
const term = new Terminal({
  cursorBlink: true,
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  lineHeight: 1.0,
  customGlyphs: true,
  theme: themeRef.current ?? DEFAULT_THEME,
  allowProposedApi: true,
  screenReaderMode: true,
});
```

## Existing Context

### Source Files Inspected

| File | Relevance |
|------|-----------|
| `src/hooks/use-terminal.ts` | Contains the Terminal constructor with `lineHeight: 1.5`. |
| `src/hooks/use-terminal.test.ts` | Existing unit tests capture `terminalConstructorOptions` for assertions. |
| `src/components/terminal-panel.tsx` | Consumes `useTerminal` and passes `theme.colors`; unaffected by this fix. |
| `src/components/terminal-panel.test.tsx` | Panel-level rendering tests; unaffected by this fix. |
| `e2e/terminal.spec.ts` | Full-stack terminal smoke coverage; does not inspect constructor options. |

### Relevant Test Infrastructure

`use-terminal.test.ts` captures every option passed to the mocked `Terminal` constructor in the
module-level `terminalConstructorOptions` variable:

```typescript
vi.mock("@xterm/xterm", () => ({
  Terminal: function MockTerminal(opts: Record<string, unknown>) {
    terminalConstructorOptions = opts;
    return fakeTerminal;
  },
}));
```

Existing constructor-option tests already use this capture pattern, so the implementation can add a
focused assertion that verifies `lineHeight: 1.0` and `customGlyphs: true`.

### Existing Architecture

#### ADR-0002 - Next.js + xterm.js + node-pty Tech Stack

Decision #6 mandates xterm.js for browser terminal emulation. `lineHeight` and `customGlyphs` are
runtime configuration for the chosen library and do not constitute a new architectural decision.

#### CORE-COMPONENT-0003 - WebSocket Terminal Communication

Decision #56 requires `screenReaderMode: true` in the Terminal constructor. Decisions #54-56 govern
terminal sizing and constructor requirements around the frontend terminal. The Plan stage may choose
to amend CORE-COMPONENT-0003 to formally record `lineHeight: 1.0` and `customGlyphs: true` as
required constructor options, keeping the core-component authoritative.

#### CORE-COMPONENT-0004 - Theming

Decisions #74-78 govern terminal color themes. Runtime theme changes are applied via
`terminal.options.theme` without reconnection. The `lineHeight`/`customGlyphs` change does not touch
the theme subsystem.

#### CORE-COMPONENT-0007 - Shell Layout

Decisions #84 and #22 require the terminal panel to fill its container without outer scroll. Reducing
`lineHeight` from `1.5` to `1.0` increases the number of visible rows for the same container height.
The FitAddon dynamically calculates cols/rows from the container geometry, so no layout changes are
needed.

## Proposed ADRs

**ADRs are NOT required for this issue.**

The fix is a two-property change to xterm.js constructor options within the existing architectural
boundary established by ADR-0002 and CORE-COMPONENT-0003. No new technology, pattern, or trade-off
requires an ADR.

## Proposed Core-Components

**Core-component changes are NOT required for this issue.**

The Plan stage may optionally update CORE-COMPONENT-0003 with an enforceable constructor rule for
terminal glyph rendering, but no new core-component file is needed.

## Risks and Open Questions

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Reducing `lineHeight` from `1.5` to `1.0` increases row density. | Low | `lineHeight: 1.0` is the terminal rendering baseline and preserves glyph continuity. |
| `customGlyphs: true` depends on xterm.js custom glyph rendering. | Low | xterm.js v6 supports this option and the app already sets `allowProposedApi: true`. |
| New row density changes visible row count. | Low | Existing FitAddon resize flow recalculates cols/rows and sends resize messages. |

### Open Questions

1. Should `lineHeight: 1.0` and `customGlyphs: true` be formally added to CORE-COMPONENT-0003?
   The Plan stage must decide whether this bug fix warrants updating the existing core-component.
2. Are there accessibility implications of `customGlyphs: true`? No regression is expected because
   `customGlyphs` only affects visual glyph rendering; `screenReaderMode: true` remains unchanged.
3. Does the fix affect worktree terminals? No. Worktree terminals use the same `useTerminal` hook and
   the same constructor, so the fix applies uniformly.
