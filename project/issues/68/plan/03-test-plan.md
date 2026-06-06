# Test Plan: Mobile Keyboard Helper for Terminal Panel

## Test TP1: Architecture documentation amendment

- **Type:** Documentation
- **Task:** T1
- **Priority:** High

### Setup

Review `CORE-COMPONENT-0003` and `DECISION-LOG.md`.

### Steps

1. Confirm helper input API rules exist in `CORE-COMPONENT-0003`.
2. Confirm the `CORE-COMPONENT-0003` decision-log row date is `2026-06-06`.
3. Confirm new decision records exist for `sendInput`, binary frame routing, disconnected no-op behavior, and `focusTerminal`.

### Expected Result

The terminal helper input contract is documented only in the global core-component and reflected in the decision log.

## Test TP2: sendInput sends binary frames when connected

- **Type:** Hook unit
- **Task:** T2
- **Priority:** High

### Setup

Use the existing mocked WebSocket and mocked xterm setup in `src/hooks/use-terminal.test.ts`.

### Steps

1. Render `useTerminal`.
2. Open the mock WebSocket.
3. Call `result.current.sendInput("hello")`.
4. Inspect WebSocket `send` calls.

### Expected Result

`sendInput` returns `true` and sends a `Uint8Array` matching `new TextEncoder().encode("hello")`.

## Test TP3: sendInput no-ops when unavailable

- **Type:** Hook unit
- **Task:** T2
- **Priority:** High

### Setup

Use mocked WebSocket states for connecting, closed, failed, unauthorized, and unmounted cases.

### Steps

1. Render `useTerminal`.
2. Exercise `sendInput` before open, after close, during reconnect, after unauthorized close, and after unmount.
3. Inspect WebSocket `send` calls.

### Expected Result

`sendInput` returns `false`, sends no bytes, queues no input, and throws no errors.

## Test TP4: Helper key mapping sequences

- **Type:** Component/unit
- **Task:** T3
- **Priority:** High

### Setup

Mock `useTerminal` in `src/components/terminal-panel.test.tsx` with `sendInput` and `focusTerminal`.

### Steps

1. Open the helper.
2. Press `Tab`, `Up`, and `Right`.
3. Activate Ctrl and press `Tab`, `Up`, and `Right`.

### Expected Result

Plain keys send `\x09`, `\x1b[A`, and `\x1b[C`; Ctrl chords send `\x1b[27;5;9~`, `\x1b[1;5A`, and `\x1b[1;5C`.

## Test TP5: Ctrl sticky one-shot accessibility

- **Type:** Component
- **Task:** T3, T4
- **Priority:** High

### Setup

Render `TerminalPanel` with connected mock terminal state.

### Steps

1. Open the helper.
2. Press Ctrl.
3. Assert Ctrl has `aria-pressed="true"`.
4. Press Ctrl again.
5. Press Ctrl, then press Up.

### Expected Result

First Ctrl tap activates sticky state, second tap cancels without sending input, and Ctrl clears after sending `Ctrl+Up`.

## Test TP6: Helper disconnected behavior

- **Type:** Component
- **Task:** T4
- **Priority:** High

### Setup

Render `TerminalPanel` with `isConnected: false` and failed/disconnected statuses.

### Steps

1. Open or render the helper state.
2. Inspect helper buttons.
3. Click/tap helper buttons.

### Expected Result

Buttons expose `aria-disabled="true"` and `tabIndex={-1}`, `sendInput` is not called, and no errors are thrown.

## Test TP7: Helper close and context reset

- **Type:** Component
- **Task:** T4
- **Priority:** Medium

### Setup

Render `TerminalPanel` with connected state and mutable props for `slug` and `worktree`.

### Steps

1. Open helper and activate Ctrl.
2. Close helper.
3. Reopen helper.
4. Activate Ctrl again and rerender with changed `slug` or `worktree`.
5. Rerender with disconnected state.

### Expected Result

Ctrl clears after helper close, project/worktree change, and disconnect. Helper open state resets on project/worktree change and disconnect.

## Test TP8: Terminal container remains mounted

- **Type:** Component
- **Task:** T4
- **Priority:** High

### Setup

Render `TerminalPanel`.

### Steps

1. Capture `data-testid="terminal-container"`.
2. Open the helper.
3. Close the helper.
4. Query the terminal container after each transition.

### Expected Result

The same terminal container remains present; helper open/close does not remount or reconnect the terminal.

## Test TP9: Focus restoration after helper input

- **Type:** Component/hook unit
- **Task:** T2, T4
- **Priority:** Medium

### Setup

Mock `focusTerminal` from `useTerminal`.

### Steps

1. Open helper.
2. Press Tab, Up, Right, and one Ctrl chord.
3. Inspect `focusTerminal` calls.

### Expected Result

Every helper input activation calls `focusTerminal` after attempting to send input.

## Test TP10: Mobile/touch E2E helper smoke

- **Type:** E2E
- **Task:** T5
- **Priority:** Medium

### Setup

Use the existing Playwright terminal setup with authenticated project navigation and a mobile viewport.

### Steps

1. Open the first project terminal.
2. Set a mobile viewport.
3. Open the keyboard helper.
4. Send a deterministic helper arrow action, such as Up after entering a command.
5. Confirm the terminal remains connected.

### Expected Result

The helper is reachable on mobile viewport, sends input to the real terminal, and does not disconnect/remount the terminal.

## Test TP11: Manual iOS/iPadOS verification

- **Type:** Manual
- **Task:** T5
- **Priority:** Medium

### Setup

Open DevDeck on iPhone/iPad Safari or equivalent responsive device testing.

### Steps

1. Open terminal helper in portrait and landscape.
2. Verify Tab completion.
3. Verify Up history navigation.
4. Verify Right cursor movement.
5. Verify Ctrl+Tab, Ctrl+Up, and Ctrl+Right send documented sequences.
6. Resize/collapse adjacent panels.

### Expected Result

The helper remains reachable, does not obscure the active prompt, preserves terminal connection, and keeps terminal input usable after helper taps.

## Test TP12: Full verification commands

- **Type:** Verification
- **Task:** T5
- **Priority:** High

### Setup

Use repository root.

### Steps

1. Run `npm run lint`.
2. Run `npm run format:check`.
3. Run `npm run build`.
4. Run `npm run test`.
5. Run terminal E2E tests where configured/available.

### Expected Result

All required checks pass before verification/PR.
