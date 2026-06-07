# Task Breakdown: Mobile Keyboard Helper for Terminal Panel

## Task T1: Amend terminal communication contract

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** None
- **Related ADRs:** ADR-0002, ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0006

### Description

Amend `CORE-COMPONENT-0003` to document the `useTerminal` helper input API and update `DECISION-LOG.md`.

### Acceptance Criteria

- `CORE-COMPONENT-0003` documents `sendInput(data: string): boolean`.
- `sendInput` is defined as using the existing authenticated binary WebSocket terminal path.
- `sendInput` is defined as no-op/no-throw when no active WebSocket is open.
- `CORE-COMPONENT-0003` documents `focusTerminal(): boolean`.
- `DECISION-LOG.md` updates the `CORE-COMPONENT-0003` row date to `2026-06-06`.
- `DECISION-LOG.md` adds decision records for the helper input API.

### Test Coverage

- Documentation review confirms all new behavioral contracts are represented in decision records.
- Implementation tests for these contracts are covered by T2.

## Task T2: Expose hook-level helper input APIs

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1
- **Related ADRs:** ADR-0002, ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005, CORE-COMPONENT-0006

### Description

Update `src/hooks/use-terminal.ts` so `UseTerminalReturn` exposes `sendInput(data: string): boolean` and `focusTerminal(): boolean`.

### Acceptance Criteria

- `sendInput` sends `TextEncoder` bytes through the current open WebSocket.
- `sendInput` returns `true` only when bytes are sent.
- `sendInput` returns `false` and does not throw when disconnected, connecting, reconnecting, failed, unauthorized, or unmounted.
- `sendInput` does not send to stale WebSocket instances after reconnect/project/worktree changes.
- Existing xterm `onData` input uses the same binary send helper.
- `focusTerminal` calls xterm focus when available and no-ops otherwise.

### Test Coverage

- Extend `src/hooks/use-terminal.test.ts`.
- Assert `sendInput("...")` sends expected `Uint8Array` bytes when open.
- Assert `sendInput` no-ops for absent/non-open/stale WebSockets.
- Assert xterm `onData` still sends binary frames.
- Assert `focusTerminal` focuses the terminal when available and no-ops safely.

## Task T3: Add helper key mappings and Ctrl semantics

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0006, CORE-COMPONENT-0007

### Description

Add explicit helper key mapping logic for `Ctrl`, `Tab`, `Up`, and `Right`.

### Acceptance Criteria

- Plain `Tab` maps to `\x09`.
- Plain `Up` maps to `\x1b[A`.
- Plain `Right` maps to `\x1b[C`.
- `Ctrl+Tab` maps to `\x1b[27;5;9~`.
- `Ctrl+Up` maps to `\x1b[1;5A`.
- `Ctrl+Right` maps to `\x1b[1;5C`.
- Ctrl toggles sticky one-shot state and sends no standalone bytes.
- A second Ctrl tap cancels Ctrl.
- Ctrl clears after a supported chord.

### Test Coverage

- Add unit/component-level assertions for every plain and Ctrl sequence.
- Assert Ctrl standalone and second-tap cancel send no input.
- Assert Ctrl clears after each supported chord.

## Task T4: Render mobile keyboard helper in TerminalPanel

- **Status:** Planned
- **Complexity:** Large
- **Dependencies:** T2, T3
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0004, CORE-COMPONENT-0005, CORE-COMPONENT-0007

### Description

Add an accessible keyboard-helper toggle and compact helper bar to `src/components/terminal-panel.tsx`.

### Acceptance Criteria

- Header includes an icon-only keyboard helper toggle with `aria-label`, `title`, and `aria-pressed`.
- Tapping the toggle opens/closes the helper without remounting `data-testid="terminal-container"`.
- Helper renders `Ctrl`, `Tab`, `Up`, and `Right`.
- Ctrl button exposes `aria-pressed`.
- Helper buttons are disabled with `aria-disabled="true"` and `tabIndex={-1}` when terminal input is unavailable.
- Helper close clears Ctrl state.
- Disconnect/reconnect failure clears Ctrl state and closes the helper.
- Project/worktree prop changes reset helper open state and Ctrl state.
- Button activation calls `sendInput` with the mapped sequence and then calls `focusTerminal`.
- Layout is docked inside the terminal panel and does not require a second transport channel or browser `KeyboardEvent` synthesis.

### Test Coverage

- Extend `src/components/terminal-panel.test.tsx`.
- Assert toggle accessibility attributes and helper visibility.
- Assert helper buttons render and call mocked `sendInput` with expected sequences.
- Assert Ctrl `aria-pressed`, cancellation, and reset behavior.
- Assert disconnected buttons use `aria-disabled` and do not call `sendInput`.
- Assert terminal container remains mounted across helper open/close.
- Assert `focusTerminal` is called after helper key activation.

## Task T5: Extend E2E/manual coverage and verification

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T4
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0006, CORE-COMPONENT-0007

### Description

Add deterministic end-to-end coverage where practical and document manual mobile checks.

### Acceptance Criteria

- Add a Playwright mobile/touch viewport scenario if stable in the existing E2E harness.
- The scenario opens the terminal helper without disconnecting the terminal.
- The scenario sends at least one helper arrow key to a real terminal.
- Manual checks cover iPhone/iPad portrait and landscape, Tab completion, Right movement, Ctrl chords, and layout non-overlap.
- Verification commands are documented for implementer/verifier use.

### Test Coverage

- Extend `e2e/terminal.spec.ts` where deterministic.
- Run or document:
  - `npm run lint`
  - `npm run format:check`
  - `npm run build`
  - `npm run test`
  - Playwright terminal E2E where configured/available.
