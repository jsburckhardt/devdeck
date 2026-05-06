# Test Plan — Issue #5: Implement WebSocket Terminal Backend

## Environment Notes

- **Default vitest environment**: `jsdom` (configured in `vitest.config.ts`)
- **Server tests**: Must use `// @vitest-environment node` pragma to override jsdom (server code uses Node.js APIs)
- **Hook tests**: Use default jsdom environment with fully mocked xterm.js (xterm.js requires canvas/DOM APIs that jsdom partially supports — mock entirely)
- **E2E tests**: Playwright with real browser, real servers
- **All unit tests must pass**: `npm run test` (configured in `.github/soft-factory/verification.yml`)

---

## Test T1: PTY Spawn Configuration

- **Type:** Unit
- **Task:** Task 4 (server-tests)
- **Priority:** High

### Setup
- Mock `node-pty` with `vi.mock('node-pty')` returning a fake `spawn` function
- Create server via `createTerminalServer({ port: 0 })` (random port)
- Connect a `ws.WebSocket` client

### Steps
1. Connect WebSocket client to the test server
2. Inspect the arguments passed to `pty.spawn()`

### Expected Result
- Shell matches `process.env.SHELL` or falls back to `bash`
- CWD matches `process.env.DEVDECK_WORKSPACE_ROOT` or `process.cwd()`
- Environment object has no `undefined` values

---

## Test T2: Binary Message Routes to PTY

- **Type:** Unit
- **Task:** Task 4 (server-tests)
- **Priority:** High

### Setup
- Same as T1: mocked node-pty, test server, WS client

### Steps
1. Connect WebSocket client
2. Send a binary message: `Buffer.from("ls -la\n")`
3. Check that `pty.write()` was called with the binary data (as string)

### Expected Result
- `pty.write()` called with `"ls -la\n"`

---

## Test T3: Resize Message Validates and Clamps

- **Type:** Unit
- **Task:** Task 4 (server-tests)
- **Priority:** High

### Setup
- Same as T1

### Steps
1. Connect WebSocket client
2. Send text JSON: `{ "type": "resize", "cols": 1000, "rows": -5 }`
3. Check arguments to `pty.resize()`

### Expected Result
- `pty.resize(500, 1)` called (cols clamped to max 500, rows clamped to min 1)

---

## Test T4: Malformed JSON Ignored

- **Type:** Unit
- **Task:** Task 4 (server-tests)
- **Priority:** Medium

### Setup
- Same as T1

### Steps
1. Connect WebSocket client
2. Send text frame: `"not valid json {{{"`
3. Verify no crash, no `pty.write()` call

### Expected Result
- Server does not crash
- `pty.write()` NOT called (text frame that fails JSON parse is silently ignored)

---

## Test T5: Oversized Control Message Ignored

- **Type:** Unit
- **Task:** Task 4 (server-tests)
- **Priority:** Medium

### Setup
- Same as T1

### Steps
1. Connect WebSocket client
2. Send text frame larger than 1KB (e.g., `"x".repeat(2000)`)
3. Verify no `JSON.parse` attempt, no crash

### Expected Result
- Message is silently dropped
- No error thrown, no PTY interaction

---

## Test T6: PTY Exit Closes WebSocket

- **Type:** Unit
- **Task:** Task 4 (server-tests)
- **Priority:** High

### Setup
- Same as T1

### Steps
1. Connect WebSocket client
2. Trigger PTY `onExit` callback with `{ exitCode: 0, signal: 0 }`
3. Observe WebSocket client close event

### Expected Result
- WebSocket client receives close event

---

## Test T7: WebSocket Close Kills PTY (Idempotent)

- **Type:** Unit
- **Task:** Task 4 (server-tests)
- **Priority:** High

### Setup
- Same as T1

### Steps
1. Connect WebSocket client
2. Close WebSocket client
3. Verify `pty.kill()` called once
4. Trigger another close/error — verify `pty.kill()` NOT called again

### Expected Result
- `pty.kill()` called exactly once (idempotent guard)

---

## Test T8: PTY Spawn Failure Sends Structured Error

- **Type:** Unit
- **Task:** Task 4 (server-tests)
- **Priority:** High

### Setup
- Mock `node-pty.spawn` to throw an Error

### Steps
1. Connect WebSocket client
2. Wait for message from server

### Expected Result
- Client receives JSON text message: `{ "type": "error", "message": "..." }`
- WebSocket is closed by server

---

## Test T9: Resize with NaN/Infinity Clamped

- **Type:** Unit
- **Task:** Task 4 (server-tests)
- **Priority:** Medium

### Setup
- Same as T1

### Steps
1. Connect WebSocket client
2. Send `{ "type": "resize", "cols": NaN, "rows": Infinity }`

### Expected Result
- `pty.resize()` called with valid clamped values (e.g., cols=1, rows=1) or message is rejected
- No crash

---

## Test T10: Hook Returns Initial State

- **Type:** Unit
- **Task:** Task 5 (hook-tests)
- **Priority:** High

### Setup
- Mock xterm.js dynamic imports, WebSocket, ResizeObserver
- Render hook via `renderHook(() => useTerminal())`

### Steps
1. Render the hook
2. Inspect initial return value

### Expected Result
- `status === "disconnected"` or `"connecting"` (initial transition)
- `isConnected === false`
- `error === null`
- `containerRef` is a React ref object

---

## Test T11: WebSocket Open Sets Connected Status

- **Type:** Unit
- **Task:** Task 5 (hook-tests)
- **Priority:** High

### Setup
- Same as T10

### Steps
1. Render hook
2. Wait for dynamic imports to resolve
3. Trigger mocked WebSocket `onopen`
4. Inspect hook return value

### Expected Result
- `status === "connected"`
- `isConnected === true`

---

## Test T12: Terminal Input Sends Binary

- **Type:** Unit
- **Task:** Task 5 (hook-tests)
- **Priority:** High

### Setup
- Same as T10

### Steps
1. Render hook, trigger WS `onopen`
2. Trigger the terminal `onData` callback with `"hello"`
3. Inspect `ws.send()` call

### Expected Result
- `ws.send()` called with an `ArrayBuffer` (or `Uint8Array`) containing the UTF-8 encoding of `"hello"`

---

## Test T13: Resize Sends JSON Control Message

- **Type:** Unit
- **Task:** Task 5 (hook-tests)
- **Priority:** Medium

### Setup
- Same as T10

### Steps
1. Render hook, trigger WS `onopen`
2. Trigger the ResizeObserver callback (simulating container resize)
3. Inspect `ws.send()` calls

### Expected Result
- `ws.send()` called with a string matching `JSON.stringify({ type: "resize", cols: <N>, rows: <N> })`

---

## Test T14: Unexpected Close Triggers Reconnection

- **Type:** Unit
- **Task:** Task 5 (hook-tests)
- **Priority:** High

### Setup
- Same as T10, with `vi.useFakeTimers()`

### Steps
1. Render hook, trigger WS `onopen` then `onclose` (unexpected)
2. Check status is `"reconnecting"` and `reconnectAttempt === 1`
3. Advance timer by 1000ms
4. Check that a new WebSocket was created

### Expected Result
- Status transitions: `connected → reconnecting`
- `reconnectAttempt` increments
- New WebSocket created after backoff delay

---

## Test T15: Max Retries Sets Failed Status

- **Type:** Unit
- **Task:** Task 5 (hook-tests)
- **Priority:** High

### Setup
- Same as T14

### Steps
1. Render hook, connect, then close unexpectedly
2. Advance timers through 3 reconnection attempts (1s + 2s + 4s), each failing
3. Check final status

### Expected Result
- `status === "failed"`
- `reconnectAttempt === 3`
- No further reconnection attempts scheduled

---

## Test T16: Manual Retry Resets and Reconnects

- **Type:** Unit
- **Task:** Task 5 (hook-tests)
- **Priority:** Medium

### Setup
- Same as T15 (reach "failed" state)

### Steps
1. Reach "failed" state
2. Call `result.current.retry()`
3. Check status

### Expected Result
- `status` transitions to `"connecting"`
- `reconnectAttempt` resets to 0
- New WebSocket created

---

## Test T17: Unmount Cleans Up Everything

- **Type:** Unit
- **Task:** Task 5 (hook-tests)
- **Priority:** High

### Setup
- Same as T10

### Steps
1. Render hook, connect successfully
2. Unmount the hook (`unmount()` from renderHook)
3. Check that terminal `dispose()` called, WS `close()` called, no pending timers

### Expected Result
- Terminal disposed
- WebSocket closed
- No pending reconnection timers
- No React state update warnings

---

## Test T18: Intentional Close Does Not Reconnect

- **Type:** Unit
- **Task:** Task 5 (hook-tests)
- **Priority:** Medium

### Setup
- Same as T10, with `vi.useFakeTimers()`

### Steps
1. Render hook, connect successfully
2. Unmount (intentional close)
3. Advance all timers
4. Verify no new WebSocket created

### Expected Result
- No reconnection attempted
- Status remains `"disconnected"` after unmount

---

## Test T19: E2E Terminal Connection and Command Execution

- **Type:** E2E (Playwright)
- **Task:** Task 6 (playwright-e2e)
- **Priority:** High

### Setup
- Start terminal server: `npm run terminal`
- Start Next.js dev server: `npm run dev`
- Navigate to workspace page in Playwright browser

### Steps
1. Open browser, navigate to a workspace URL
2. Click terminal toggle button (if terminal not visible)
3. Wait for connection indicator to show "Connected" (green dot)
4. Type `echo hello-devdeck` followed by Enter
5. Wait for output to appear

### Expected Result
- Connection indicator shows green dot with "Connected" text
- Terminal output contains `hello-devdeck`
- No error overlays visible
