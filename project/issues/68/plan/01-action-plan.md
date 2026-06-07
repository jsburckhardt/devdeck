# Action Plan: Mobile Keyboard Helper for Terminal Panel

## Feature

- **ID:** 68
- **Research Brief:** project/issues/68/research/00-research.md

## ADRs Created

- None.

## Core-Components Created

- None created.
- Update existing `CORE-COMPONENT-0003: WebSocket Terminal Communication` to formalize the `useTerminal.sendInput(data)` and `focusTerminal()` helper APIs.
- Update `project/architecture/ADR/DECISION-LOG.md` for the `CORE-COMPONENT-0003` amendment.

## Implementation Tasks

1. Amend `CORE-COMPONENT-0003` and `DECISION-LOG.md` for the helper input API.
2. Expose `sendInput(data: string): boolean` and `focusTerminal(): boolean` from `useTerminal`.
3. Add terminal helper key mappings and Ctrl v1 semantics.
4. Render the compact mobile keyboard helper in `TerminalPanel`.
5. Extend hook, component, E2E/manual, and verification coverage.

Ctrl v1 semantics:

- `Ctrl` is a sticky one-shot modifier with `aria-pressed`.
- First tap activates Ctrl; second tap cancels Ctrl without sending input.
- Ctrl alone sends no bytes.
- Ctrl clears after a supported chord, helper close, terminal disconnect, project/worktree change, or unmount.
- Plain keys:
  - `Tab` sends `\x09`.
  - `Up` sends `\x1b[A`.
  - `Right` sends `\x1b[C`.
- Supported Ctrl chords in v1:
  - `Ctrl+Tab` sends `\x1b[27;5;9~`.
  - `Ctrl+Up` sends `\x1b[1;5A`.
  - `Ctrl+Right` sends `\x1b[1;5C`.
- No other Ctrl chords are supported in v1; future helper keys must define an explicit Ctrl mapping before being enabled while Ctrl is active.
