# Test Plan — Issue #34: tmux attach failure fix

## Test T23: Server sends setup message for shell connection

- **Type:** Unit (vitest, node environment)
- **Task:** Task 1 / Task 4
- **Priority:** High

### Setup
- Use existing `createServer`, `connectClientWithSlug`, and `tick()` helpers
- No tmux socket mocks — default shell path

### Steps
1. Create server via `createServer()`
2. Connect a client (no slug, or slug without tmux socket)
3. Wait for messages via `tick()`
4. Collect all text-frame messages received by the client
5. Parse JSON from the first text frame

### Expected Result
- Client receives a text frame containing `{ type: "setup", mode: "shell" }`
- No `fallback` property present
- Client remains connected (readyState === OPEN)

---

## Test T24: Server sends setup message for tmux connection

- **Type:** Unit (vitest, node environment)
- **Task:** Task 1 / Task 4
- **Priority:** High

### Setup
- Mock `fs.stat` to return socket for `.devcontainer/.tmux-shared`
- Set `tmuxHasSessionResult = true`
- Use `createServer` and `connectClientWithSlug`

### Steps
1. Configure mocks for tmux socket detection at `/workspaces/<slug>/.devcontainer/.tmux-shared`
2. Create server and connect client with the matching slug
3. Wait via `tick()`
4. Collect text-frame messages

### Expected Result
- Client receives `{ type: "setup", mode: "tmux" }` as a text frame
- PTY was spawned with `tmux` command (verify via `spawn` mock)

---

## Test T25: Server sends fallback setup message when tmux exits non-zero

- **Type:** Unit (vitest, node environment)
- **Task:** Task 1 / Task 4
- **Priority:** High

### Setup
- Same tmux socket mocks as T24
- Prepare a `fallbackPty` via `createFakePty()` and `spawnFn.mockReturnValueOnce(fallbackPty)`

### Steps
1. Set up tmux socket mocks, create server, connect client
2. Wait for initial connection and setup message
3. Trigger `fakePty._emitExit(1, 0)` to simulate tmux attach failure
4. Wait via `tick()`
5. Collect all text-frame messages after the exit event

### Expected Result
- Client receives a second text frame: `{ type: "setup", mode: "shell", fallback: true, reason: "tmux-attach-failed" }`
- A fallback shell PTY was spawned (verify via `spawn` mock — last call is not `tmux`)
- Client remains connected (readyState === OPEN)

---

## Test H-T1: Hook updates terminalMode on setup message

- **Type:** Unit (vitest, jsdom environment)
- **Task:** Task 2 / Task 5
- **Priority:** High

### Setup
- Use existing `renderHook`, `MockWS`, `fakeTerminal` infrastructure
- Render `useTerminal()` hook

### Steps
1. `renderHook(() => useTerminal())`
2. Wait for WebSocket instance
3. Trigger `ws.onopen()`
4. Trigger `ws.onmessage({ data: JSON.stringify({ type: "setup", mode: "tmux" }) })`
5. Read `result.current.terminalMode`

### Expected Result
- `terminalMode` === `"tmux"`
- `isFallback` === `false`

---

## Test H-T2: Hook handles fallback setup — sets isFallback and clears terminal

- **Type:** Unit (vitest, jsdom environment)
- **Task:** Task 2 / Task 5
- **Priority:** High

### Setup
- Add `clear: vi.fn()` to `fakeTerminal` mock
- Render `useTerminal()` hook

### Steps
1. Render hook, wait for WS, trigger `onopen`
2. Trigger `ws.onmessage({ data: JSON.stringify({ type: "setup", mode: "shell", fallback: true, reason: "tmux-attach-failed" }) })`
3. Check `result.current.isFallback` and `fakeTerminal.clear`

### Expected Result
- `terminalMode` === `"shell"`
- `isFallback` === `true`
- `fakeTerminal.clear` was called exactly once

---

## Test H-T3: Hook resets terminalMode on reconnect

- **Type:** Unit (vitest, jsdom environment)
- **Task:** Task 2 / Task 5
- **Priority:** Medium

### Setup
- Render hook with `useTerminal()`

### Steps
1. Connect, trigger setup message with `mode: "tmux"` → assert `terminalMode === "tmux"`
2. Trigger `ws._triggerClose(1006)` (unexpected close) to initiate reconnect
3. Wait for reconnection timer and new WS instance
4. Check `result.current.terminalMode`

### Expected Result
- After reconnect begins, `terminalMode` resets to `"unknown"`
- `isFallback` resets to `false`

---

## Test C-T1: Mode badge renders for known terminal modes

- **Type:** Unit (vitest, jsdom environment)
- **Task:** Task 3 / Task 6
- **Priority:** Medium

### Setup
- Mock `useTerminal` to return `{ terminalMode: "shell", isFallback: false, status: "connected", ... }`
- Render `<TerminalPanel />`

### Steps
1. Render component with mock returning `terminalMode: "shell"`
2. Query for badge text
3. Re-render with `terminalMode: "tmux"`
4. Query for badge text

### Expected Result
- Badge with text "shell" is present in the DOM
- Badge with text "tmux" is present after re-render

---

## Test C-T2: Mode badge hidden when terminalMode is unknown

- **Type:** Unit (vitest, jsdom environment)
- **Task:** Task 3 / Task 6
- **Priority:** Medium

### Setup
- Mock `useTerminal` to return `{ terminalMode: "unknown", ... }`

### Steps
1. Render `<TerminalPanel />`
2. Query for any badge element

### Expected Result
- No mode badge element in the DOM

---

## Test C-T3: Fallback notification appears when isFallback is true

- **Type:** Unit (vitest, jsdom environment)
- **Task:** Task 3 / Task 6
- **Priority:** Medium

### Setup
- Mock `useTerminal` to return `{ isFallback: true, terminalMode: "shell", status: "connected", ... }`

### Steps
1. Render `<TerminalPanel />`
2. Query for text "tmux session unavailable"

### Expected Result
- Notification text is present in the DOM

---

## Test C-T4: Fallback notification auto-dismisses after timeout

- **Type:** Unit (vitest, jsdom environment, fake timers)
- **Task:** Task 3 / Task 6
- **Priority:** Low

### Setup
- Use `vi.useFakeTimers()`
- Mock `useTerminal` to return `{ isFallback: true, ... }`

### Steps
1. Render `<TerminalPanel />`
2. Assert notification is present
3. Advance timers by 3000ms via `vi.advanceTimersByTime(3000)`
4. Assert notification is no longer present

### Expected Result
- Notification visible initially, gone after 3s
