# Implementation Notes — Issue #34: tmux attach failure fix

## Task 1: Server — Send `setup` message after PTY spawn and on tmux fallback

- **Status:** Complete
- **Files Changed:** `src/server/terminal-server.mts`
- **Tests Passed:** 25
- **Tests Failed:** 0

### Changes Summary
Added two `ws.send()` calls in `terminal-server.mts`:
1. After `wirePty()` call but before pending message flush: sends `{ type: "setup", mode: setup.mode }` as a JSON text frame.
2. In the tmux fallback branch (before `activePtys.delete`): sends `{ type: "setup", mode: "shell", fallback: true, reason: "tmux-attach-failed" }`.

Both wrapped in `try/catch` consistent with existing error send pattern.

---

## Task 2: Hook — Handle `setup` messages, expose `terminalMode` and `isFallback`

- **Status:** Complete
- **Files Changed:** `src/hooks/use-terminal.ts`
- **Tests Passed:** 20
- **Tests Failed:** 0

### Changes Summary
- Added `TerminalMode` type export and `terminalMode`/`isFallback` state variables.
- Reset both values at start of `connect()`.
- Extended `ws.onmessage` handler to parse `setup` messages, update state, and call `term.clear()` on fallback.
- Extended `UseTerminalReturn` interface and return value with new fields.

---

## Task 3: Component — Mode badge and fallback notification

- **Status:** Complete
- **Files Changed:** `src/components/terminal-panel.tsx`
- **Tests Passed:** 4
- **Tests Failed:** 0

### Changes Summary
- Destructured `terminalMode` and `isFallback` from `useTerminal`.
- Added mode badge span (conditionally rendered when mode is known).
- Added fallback notification overlay with 3-second auto-dismiss via `useEffect` + `setTimeout`.
- Added `eslint-disable` comment for `react-hooks/set-state-in-effect` rule on the `setShowFallbackNotice(true)` call inside the effect.

---

## Task 4: Server tests — T23, T24, T25

- **Status:** Complete
- **Files Changed:** `src/server/terminal-server.test.ts`
- **Tests Passed:** 25
- **Tests Failed:** 0

### Changes Summary
Added three tests:
- **T23:** Shell connection receives `{ type: "setup", mode: "shell" }`.
- **T24:** Tmux connection receives `{ type: "setup", mode: "tmux" }`.
- **T25:** Tmux exit code 1 sends fallback setup message with `fallback: true` and `reason: "tmux-attach-failed"`.

Note: T23 and T24 register the message listener before the WebSocket "open" event resolves to avoid a race condition where the setup message arrives before the listener is attached.

---

## Task 5: Hook tests — H-T1, H-T2, H-T3

- **Status:** Complete
- **Files Changed:** `src/hooks/use-terminal.test.ts`
- **Tests Passed:** 20
- **Tests Failed:** 0

### Changes Summary
- Added `clear: vi.fn()` to `fakeTerminal` mock object and its reset in `beforeEach`.
- **H-T1:** Setup message with `mode: "tmux"` updates `terminalMode`.
- **H-T2:** Fallback setup message sets `isFallback` to `true` and calls `term.clear()`.
- **H-T3:** `terminalMode` resets to `"unknown"` on reconnect.

---

## Task 6: Component tests — C-T1, C-T2, C-T3, C-T4

- **Status:** Complete
- **Files Changed:** `src/components/terminal-panel.test.tsx` (new file)
- **Tests Passed:** 4
- **Tests Failed:** 0

### Changes Summary
Created `terminal-panel.test.tsx` with mocked `useTerminal` hook and phosphor icons:
- **C-T1:** Mode badge renders for `"shell"` and `"tmux"` modes.
- **C-T2:** Mode badge hidden when `terminalMode` is `"unknown"`.
- **C-T3:** Fallback notification appears when `isFallback` is `true`.
- **C-T4:** Fallback notification auto-dismisses after 3s (uses `vi.useFakeTimers()` + `act()`).

---

## Verification Summary

| Check | Result |
|-------|--------|
| `npx vitest run src/server/terminal-server.test.ts` | ✅ 25/25 passed |
| `npx vitest run src/hooks/use-terminal.test.ts` | ✅ 20/20 passed |
| `npx vitest run src/components/terminal-panel.test.tsx` | ✅ 4/4 passed |
| `npx vitest run` | ✅ 264/264 passed |
| `npm run lint` | ✅ 0 errors (2 pre-existing warnings) |
| `npm run build` | ✅ Success |
