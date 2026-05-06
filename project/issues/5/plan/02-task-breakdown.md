# Task Breakdown — Issue #5: Implement WebSocket Terminal Backend

## Task 1: server-hardening

- **Status:** Not Started
- **Complexity:** High
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005

### Description

Refactor `src/server/terminal-server.mts` to comply with CORE-COMPONENT-0003 binary protocol and production-hardening requirements.

Key changes:
- Export a `createTerminalServer(options)` factory function returning `{ wss, cleanup }` for testability
- Keep `startTerminalServer()` as the CLI entrypoint (called when module is run directly via `tsx`)
- **Binary protocol outbound**: `pty.onData` emits strings; convert via `ws.send(Buffer.from(data, 'utf8'))` to produce binary WebSocket frames
- **Binary protocol inbound**: Use the `isBinary` argument in the ws `message` handler. If `isBinary === true`, write directly to PTY via `pty.write()`
- **Text frames**: Validate byte length ≤1KB before `JSON.parse`. Handle `resize` control messages
- **Resize validation**: Require finite integers, clamp cols to [1, 500] and rows to [1, 200]. Reject NaN/Infinity/negative/zero
- **Idempotent cleanup**: Add a `cleaned` guard flag to prevent double-kill on close+error race conditions
- **try/catch**: Wrap `pty.write()`, `pty.resize()`, and `ws.send()` in try/catch blocks
- **SIGTERM handler**: Register alongside existing SIGINT handler
- **CWD**: Use `process.env.DEVDECK_WORKSPACE_ROOT ?? process.cwd()` instead of `process.env.HOME`
- **Environment sanitization**: Filter out `undefined` values from `process.env` before passing to `node-pty`
- **Structured error on spawn failure**: Send `JSON.stringify({ type: "error", message: "..." })` before closing the WebSocket

### Acceptance Criteria

- [ ] `createTerminalServer(options)` is exported and returns `{ wss, cleanup }`
- [ ] `startTerminalServer()` is exported and calls `createTerminalServer` with defaults
- [ ] PTY output is sent as binary WebSocket frames (Buffer)
- [ ] Binary incoming messages (isBinary=true) are written to PTY
- [ ] Text incoming messages are validated ≤1KB, parsed as JSON, and routed to resize handler
- [ ] Resize dimensions are validated as finite integers, clamped to [1,500]×[1,200]
- [ ] PTY cleanup is idempotent (guard flag prevents double-kill)
- [ ] try/catch wraps pty.write(), pty.resize(), ws.send()
- [ ] SIGTERM handler registered alongside SIGINT
- [ ] CWD uses DEVDECK_WORKSPACE_ROOT env or process.cwd()
- [ ] Spawn failure sends structured JSON error message to client
- [ ] Environment values passed to node-pty have no undefined entries

### Test Coverage

- Unit tests in Task 4 cover all message routing, lifecycle, and error paths
- Factory pattern enables testing without binding to a real port

---

## Task 2: use-terminal-hook

- **Status:** Not Started
- **Complexity:** High
- **Dependencies:** Task 1 (must know the binary protocol contract)
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005

### Description

Create `src/hooks/use-terminal.ts` — a custom React hook extracted from the inline logic in `terminal-panel.tsx`.

Key responsibilities:
- **Dynamic imports**: Load `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/addon-unicode11`, and `@xterm/xterm/css/xterm.css` asynchronously
- **Unicode11**: After loading the addon, set `term.unicode.activeVersion = "11"`
- **Binary protocol outbound**: Encode terminal input as `new TextEncoder().encode(data)` and send as ArrayBuffer
- **Binary protocol inbound**: Set `ws.binaryType = "arraybuffer"`, decode incoming binary via `new TextDecoder().decode(event.data)`
- **JSON control messages**: Send resize as `JSON.stringify({ type: "resize", cols, rows })`
- **ResizeObserver**: Observe the container div, call `FitAddon.fit()` on resize
- **Generation guard**: Increment a generation counter before async imports; abort if generation has changed when imports resolve (handles StrictMode double-mount and fast unmount)
- **Auto-reconnection**: On unexpected WS close, reconnect with exponential backoff (1s, 2s, 4s), max 3 retries, cancel all timers on unmount
- **`intentionalCloseRef`**: Track intentional close (unmount or manual) to prevent triggering reconnect
- **Return value**: `{ containerRef, status, isConnected, error, reconnectAttempt, maxReconnectAttempts, retry }`
- **`TerminalStatus` type**: `"disconnected" | "connecting" | "connected" | "reconnecting" | "failed"`
- **Full cleanup on unmount**: Dispose terminal, close WebSocket, disconnect ResizeObserver, clear all timeouts, remove all event listeners

### Acceptance Criteria

- [ ] Hook file exists at `src/hooks/use-terminal.ts`
- [ ] Dynamically imports xterm.js and all 3 addons
- [ ] Sets `term.unicode.activeVersion = "11"` after loading Unicode11Addon
- [ ] Sends terminal input as binary ArrayBuffer
- [ ] Sets `ws.binaryType = "arraybuffer"` and decodes binary messages
- [ ] Sends resize as JSON text frame
- [ ] ResizeObserver triggers FitAddon.fit()
- [ ] Generation guard prevents stale async import from attaching to DOM
- [ ] Auto-reconnect with 1s/2s/4s backoff, max 3 retries
- [ ] `intentionalCloseRef` prevents reconnect on unmount/manual close
- [ ] Returns `{ containerRef, status, isConnected, error, reconnectAttempt, maxReconnectAttempts, retry }`
- [ ] Exports `TerminalStatus` type
- [ ] Full cleanup on unmount (terminal, WS, observers, timers)

### Test Coverage

- Unit tests in Task 5 cover lifecycle, binary I/O, reconnection, and cleanup

---

## Task 3: terminal-panel-refactor

- **Status:** Not Started
- **Complexity:** Low
- **Dependencies:** Task 2 (consumes useTerminal hook)
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005, CORE-COMPONENT-0007

### Description

Simplify `src/components/terminal-panel.tsx` to consume the `useTerminal` hook. Remove all inline terminal logic.

Key changes:
- Import and call `useTerminal()` hook
- **Always render the container div** (`ref={containerRef}`) — never conditionally swap it with an error UI. This preserves xterm.js DOM state across reconnection attempts
- **Overlay connection status** on top of the terminal container using absolute positioning
- Show "Reconnecting… (attempt X/3)" when `status === "reconnecting"`
- Show "Connection lost" with retry button when `status === "failed"`
- Show "Connecting…" spinner when `status === "connecting"`
- Keep the header bar with connection indicator dot (green=connected, grey=other)

### Acceptance Criteria

- [ ] `TerminalPanel` imports and uses `useTerminal` hook
- [ ] Container div is always rendered (never conditionally swapped)
- [ ] Status overlay renders for "connecting", "reconnecting", and "failed" states
- [ ] "Reconnecting" overlay shows attempt count (e.g., "Attempt 2/3")
- [ ] "Failed" overlay shows retry button that calls `retry()`
- [ ] Connection indicator dot reflects current status
- [ ] All inline terminal logic removed (no direct xterm.js or WebSocket code)

### Test Coverage

- Covered by Task 6 (E2E test validates panel renders and terminal connects)
- Visual states can be verified by mocking hook return values in future snapshot tests

---

## Task 4: server-tests

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 1 (tests validate the refactored server)
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0006

### Description

Create `src/server/terminal-server.test.ts` with comprehensive unit tests for the terminal server.

Key setup:
- Add `// @vitest-environment node` pragma at the top of the file (overrides default jsdom)
- Mock `node-pty` via `vi.mock('node-pty')` with a fake IPty implementing: `onData`, `onExit`, `write`, `resize`, `kill`, `pid`
- Use the `createTerminalServer(options)` factory to create a server instance per test
- Use real `ws.WebSocket` client connecting to the test server

Test cases:
1. PTY spawned with correct shell, cwd, and sanitized env
2. Binary message (`isBinary=true`) is written to PTY via `pty.write()`
3. Text JSON resize message validates and clamps dimensions (e.g., `{ type: "resize", cols: 1000, rows: -5 }` → clamped to `cols: 500, rows: 1`)
4. Malformed JSON text message is ignored (no crash, no PTY write)
5. Oversized control message (>1KB) is ignored
6. PTY exit event closes the WebSocket connection
7. WebSocket close kills PTY (idempotent — second close does not throw)
8. WebSocket error kills PTY
9. PTY spawn failure sends structured JSON error `{ type: "error", message: "..." }` to client before closing
10. Resize with NaN/Infinity/negative/zero values are clamped to valid range

### Acceptance Criteria

- [ ] Test file exists at `src/server/terminal-server.test.ts`
- [ ] `// @vitest-environment node` pragma present at top
- [ ] `node-pty` is mocked (no real PTY processes spawned in tests)
- [ ] All 10 test cases pass
- [ ] Tests use `createTerminalServer` factory (no global server state)
- [ ] Tests clean up server instances after each test (no port leaks)

### Test Coverage

- This task IS the test coverage for Task 1
- Covers: message routing (binary vs text), resize validation, lifecycle (spawn, close, error, exit), spawn failure, idempotent cleanup

---

## Task 5: hook-tests

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 2 (tests validate the hook)
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005, CORE-COMPONENT-0006

### Description

Create `src/hooks/use-terminal.test.ts` with comprehensive unit tests for the `useTerminal` hook.

Key setup:
- Mock `@xterm/xterm` dynamic import with a fake Terminal class (tracks `open`, `write`, `dispose`, `onData`, `onResize`, `loadAddon` calls)
- Mock `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/addon-unicode11` dynamic imports
- Mock global `WebSocket` class with controllable `onopen`, `onclose`, `onmessage`, `onerror`, `send`, `close`
- Mock global `ResizeObserver`
- Use `vi.useFakeTimers()` for reconnection backoff tests
- Use `renderHook` from `@testing-library/react` for hook rendering

Test cases:
1. Hook returns expected initial state (`status: "disconnected"`, `isConnected: false`, etc.)
2. After WebSocket `onopen` fires, status becomes `"connected"` and `isConnected` is `true`
3. Terminal `onData` callback sends binary data to WebSocket (ArrayBuffer)
4. Container resize triggers JSON control message via WebSocket
5. Unexpected WebSocket close triggers reconnection (`status: "reconnecting"`, `reconnectAttempt` increments)
6. After 3 failed retries, status becomes `"failed"`
7. Manual `retry()` resets reconnect counter and initiates new connection
8. Unmount disposes terminal, closes WebSocket, cancels pending reconnect timers
9. Intentional close (unmount) does not trigger reconnect logic

### Acceptance Criteria

- [ ] Test file exists at `src/hooks/use-terminal.test.ts`
- [ ] xterm.js and all addons are mocked (no real DOM rendering)
- [ ] WebSocket is mocked (no real network connections)
- [ ] ResizeObserver is mocked
- [ ] All 9 test cases pass
- [ ] Fake timers used for reconnection backoff verification
- [ ] No timer leaks (all timers cleaned up)

### Test Coverage

- This task IS the test coverage for Task 2
- Covers: lifecycle (init, connect, disconnect, dispose), binary I/O, reconnection (backoff, max retries, manual retry), cleanup (unmount, intentional close)

---

## Task 6: playwright-e2e

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 1, Task 3 (needs both server and panel working)
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005

### Description

Create a Playwright E2E test that verifies the terminal connects and can execute commands.

Key setup:
- Start the terminal server (`npm run terminal`) and Next.js dev server (`npm run dev`) before tests
- Navigate to a project workspace page (e.g., `/workspace/test-project`)
- Toggle the terminal panel on if not already visible

Test steps:
1. Navigate to a workspace page
2. Open the terminal panel
3. Verify the connection indicator shows "Connected" (green dot)
4. Type a test command: `echo hello-devdeck`
5. Verify the output `hello-devdeck` appears in the terminal
6. Tear down servers after test

### Acceptance Criteria

- [ ] E2E test file exists (e.g., `e2e/terminal.spec.ts` or `src/e2e/terminal.spec.ts`)
- [ ] Test starts both terminal server and Next.js dev server
- [ ] Test verifies terminal connects (connection indicator green)
- [ ] Test verifies command execution and output
- [ ] Test cleans up server processes

### Test Coverage

- This task IS the E2E integration test for the entire terminal feature
- Validates the full stack: Next.js → WS proxy → terminal server → node-pty → shell → output → xterm.js
