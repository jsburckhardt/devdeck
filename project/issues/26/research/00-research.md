# Research Brief — Issue #26

## Summary

Terminal sessions restart when toggling File Preview or Terminal panels because `workspace-layout.tsx` uses a dynamic `key` on the `<Group>` component and conditional rendering (`{showTerminal && ...}`) for panel content. Both patterns cause React to unmount and remount the panel subtree, triggering the `useTerminal` hook cleanup which closes the WebSocket and destroys the xterm.js instance.

## Scope Type

`issue` — bug fix with a CORE-COMPONENT-0007 update (no new ADR needed).

## Root Cause

1. **`layoutKey` on `<Group>`** (`workspace-layout.tsx:83-85,155-156`): Changes the React key when panel visibility toggles, forcing a full subtree remount.
2. **Conditional `{showTerminal && ...}`** (`workspace-layout.tsx:179-188`): Unmounts `TerminalPanel` when hidden, triggering cleanup in `use-terminal.ts:304-326` (WebSocket close + xterm dispose).

## Affected Files

| File | Role |
|------|------|
| `src/components/workspace-layout.tsx` | Root cause — `layoutKey` and conditional rendering |
| `src/hooks/use-terminal.ts` | Minor guard needed for zero-dimension `fit()` |
| `project/architecture/core-components/CORE-COMPONENT-0007-shell-layout.md` | Add lifecycle preservation rule |
| `project/architecture/ADR/DECISION-LOG.md` | Record new decision |

## Proposed Approach

1. Remove `layoutKey` — use no key on `<Group>`
2. Always mount all panels; use `react-resizable-panels` `collapsible`/`collapsedSize` with imperative `collapse()`/`expand()` via `PanelImperativeHandle` refs
3. Add zero-dimension guard in `use-terminal.ts` `ResizeObserver` callback
4. Update CORE-COMPONENT-0007 with lifecycle preservation rule
5. Add tests for panel lifecycle preservation

## ADR/Core-Component Changes

- **CORE-COMPONENT-0007** — Update: add rule about togglable panels preserving lifecycle
- **DECISION-LOG** — New decision #79
