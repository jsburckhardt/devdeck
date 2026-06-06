# Research Brief: Mobile Keyboard Helper for Terminal Panel

## Meta

| Field | Value |
|---|---|
| Issue | GitHub Issue #68 |
| Issue URL | https://github.com/jsburckhardt/devdeck/issues/68 |
| scope_type | `issue` |
| ADRs required | No |
| Core-components required | No new core-component; CORE-COMPONENT-0003 amendment recommended if `useTerminal` exposes a formal helper input API |
| Date | 2026-06-06 |

## Problem Statement

DevDeck's browser terminal is difficult to use on iPad and iPhone software keyboards because terminal-critical keys such as Tab, arrow keys, and Ctrl chords are missing or cumbersome. Issue #68 requests a compact touch/mobile helper for the terminal with initial keys `Ctrl`, `Tab`, `Up`, and `Right`.

The helper must send input to the active PTY through the existing authenticated terminal WebSocket binary input path. It must not add HTTP endpoints, introduce a second unauthenticated channel, synthesize browser `KeyboardEvent`s as the primary implementation, or remount/reconnect the terminal when opened or closed.

## Scope Classification

`issue`

The requested work is a self-contained terminal UI enhancement implemented within the existing terminal panel and hook contracts. Existing architectural decisions already cover the transport, lifecycle, accessibility, and styling constraints.

## Existing Context

### Relevant Source Files

| Path | Relevance |
|---|---|
| `src/components/terminal-panel.tsx` | Renders terminal chrome, status overlays, theme picker, fallback notice, and xterm host. The helper UI should live here. |
| `src/hooks/use-terminal.ts` | Manages xterm.js lifecycle, WebSocket connection, addons, resize, and terminal input. A small imperative send API can reuse the existing binary send path. |
| `src/components/terminal-panel.test.tsx` | Component tests already mock `useTerminal`; extend these for helper rendering, accessibility, and button behavior. |
| `src/hooks/use-terminal.test.ts` | Hook tests already verify terminal binary input; extend these for the new helper send API and disconnected no-op behavior. |
| `src/components/workspace-layout.tsx` | Renders `TerminalPanel` inside persistent shell panels; expected to remain read-only for this feature. |
| `e2e/terminal.spec.ts` | Existing terminal E2E coverage; extend with a mobile/touch helper scenario if practical. |

### Existing Binary Input Path

`useTerminal` already sends xterm input to the terminal WebSocket by encoding strings as binary frames:

```typescript
term.onData((data: string) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(encoder.encode(data));
  }
});
```

The helper should expose and call a hook API such as `sendInput(data: string)` that uses the same `ws.send(encoder.encode(data))` path and no-ops when the active WebSocket is not open.

### Relevant Architecture Contracts

| Source | Constraint |
|---|---|
| ADR-0002 | Next.js App Router, React, TypeScript strict mode, Tailwind CSS, xterm.js, node-pty, and Vitest are the selected stack. |
| CORE-COMPONENT-0003 | Terminal I/O uses the authenticated `/api/terminal` WebSocket and binary frames; frontend uses `ws.binaryType = "arraybuffer"` and `screenReaderMode: true`. |
| CORE-COMPONENT-0005 | Terminal errors and disconnected states are surfaced through existing error/status UI; helper buttons should avoid throwing on disconnected states. |
| CORE-COMPONENT-0007 | Persistent-resource panels must remain mounted; controls require accessible labels and pressed/disabled state semantics. |
| CORE-COMPONENT-0006 | Tests are co-located as `*.test.ts(x)` and should use existing Vitest/testing-library patterns. |

## Helper Key Semantics

| Helper key | Expected sequence / behavior |
|---|---|
| `Tab` | Send `\x09` / `\t` for shell completion. |
| `Up` | Send `\x1b[A` for readline/shell history navigation. |
| `Right` | Send `\x1b[C` for cursor-right movement. |
| `Ctrl` | Implement explicitly as a one-shot/sticky modifier or as a clearly scoped supported Ctrl action. It must not send an ambiguous standalone byte. |

The issue body prefers a one-shot/sticky `Ctrl` modifier state with `aria-pressed`, second-tap cancellation, and reset after a supported chord or close/disconnect. If v1 does not support `Ctrl+Tab`, `Ctrl+Up`, or `Ctrl+Right`, the UI must make that scope clear and avoid misleading input.

## Proposed ADRs

None required.

## Proposed Core-Component Changes

Amend CORE-COMPONENT-0003 if the implementation adds a formal `sendInput`/helper input API to `UseTerminalReturn`.

Recommended decision record:

> Require `useTerminal` to expose a stable helper input API that sends raw terminal input through the existing binary WebSocket frame path and no-ops when the active WebSocket is not open.

This is an amendment to an existing terminal communication contract, not a new core-component.

## Risks and Open Questions

| Risk / Question | Notes |
|---|---|
| Ctrl semantics | One-shot/sticky modifier must have explicit supported chords and clear reset behavior. |
| Disconnected states | Helper sends must not enqueue stale input or throw when connecting, reconnecting, failed, disconnected, or unauthorized. |
| Focus retention | Touch/clicking helper controls should restore focus to xterm so software-keyboard typing remains usable. |
| Layout overlap | Floating/docked helper must avoid obscuring the active prompt; temporary bottom padding or in-panel docking may be needed. |
| iOS viewport/safe area | Use safe-area-aware bottom spacing if the helper is floated near the bottom of the terminal. |
| Resize behavior | Opening/closing the helper may change terminal host height; existing resize observer/fit logic should be verified. |
| Reconnect and replacement | Ctrl state and helper open state should reset on terminal disconnect, project/worktree replacement, and unmount. |

## Testing Recommendations

### Hook Tests

- `sendInput` sends `Uint8Array` encoded bytes through the active WebSocket when open.
- `sendInput` no-ops when the WebSocket is absent or not `OPEN`.
- Helper key mappings cover `Tab`, `Up`, `Right`, and supported `Ctrl` semantics.
- Reconnect/project/worktree changes do not send to stale WebSocket instances.

### Component Tests

- Keyboard icon has `aria-label` and `title`.
- Tapping the icon toggles the helper panel.
- Helper panel renders `Ctrl`, `Tab`, `Up`, and `Right`.
- `Ctrl` uses `aria-pressed` and clears on second tap, helper close, and disconnect.
- Unavailable buttons expose `aria-disabled` and `tabIndex={-1}`.
- Pressing helper keys calls the hook input API with the expected sequence and restores terminal focus.
- Opening/closing the helper does not remove `data-testid="terminal-container"` from the DOM.

### E2E / Manual Verification

- Mobile/touch viewport can open the helper and send at least Tab and one arrow key to a real terminal.
- iPhone/iPad portrait and landscape layouts keep the helper reachable and non-overlapping.
- Collapsing/resizing adjacent panels does not remount or reconnect the terminal.

## Plan Handoff

Recommended implementation:

1. Add a typed helper-key mapping and/or small utility for `Tab`, `Up`, and `Right` sequences plus explicit `Ctrl` state semantics.
2. Expose a stable `sendInput(data: string)` API from `useTerminal` that uses the active WebSocket ref and existing `TextEncoder` binary send path.
3. Render an icon-only keyboard toggle in `TerminalPanel` and a compact safe-area-aware helper panel docked near the terminal bottom.
4. Disable helper buttons when the terminal is not connected and reset helper/Ctrl state on disconnect, close, project/worktree replacement, and unmount.
5. Update CORE-COMPONENT-0003 and `DECISION-LOG.md` if the `useTerminal` input contract becomes formal.
6. Add hook, component, and mobile/e2e coverage using existing test patterns.
