# Test Plan — Issue #11

## Test TP-01: Auth utility — correct token validates

- **Type:** Unit
- **Task:** T2, T7
- **Priority:** Critical

### Setup
- Import `initToken`, `getToken`, `validateToken` from `src/lib/auth.ts`
- Call `initToken()` to initialize

### Steps
1. Call `getToken()` to obtain the current token
2. Call `validateToken(token)` with the obtained token

### Expected Result
- `validateToken` returns `true`

---

## Test TP-02: Auth utility — wrong token rejected

- **Type:** Unit
- **Task:** T2, T7
- **Priority:** Critical

### Setup
- Import and initialize auth module

### Steps
1. Call `validateToken("definitely-not-the-right-token")`

### Expected Result
- Returns `false`

---

## Test TP-03: Auth utility — empty and undefined rejected

- **Type:** Unit
- **Task:** T2, T7
- **Priority:** High

### Setup
- Import and initialize auth module

### Steps
1. Call `validateToken("")`
2. Call `validateToken(undefined as any)`

### Expected Result
- Both return `false`

---

## Test TP-04: Auth utility — DEVDECK_TOKEN env var override

- **Type:** Unit
- **Task:** T2, T7
- **Priority:** High

### Setup
- Set `process.env.DEVDECK_TOKEN = "my-custom-token"`
- Re-initialize auth module

### Steps
1. Call `getToken()`
2. Call `validateToken("my-custom-token")`

### Expected Result
- `getToken()` returns `"my-custom-token"`
- `validateToken` returns `true`

---

## Test TP-05: Auth utility — different length token rejected safely

- **Type:** Unit
- **Task:** T2, T7
- **Priority:** Medium

### Setup
- Import and initialize auth module

### Steps
1. Call `validateToken("short")`
2. Call `validateToken("a".repeat(1000))`

### Expected Result
- Both return `false` without throwing

---

## Test TP-06: Auth utility — auto-generated token is valid UUID

- **Type:** Unit
- **Task:** T2, T7
- **Priority:** Medium

### Setup
- Ensure `DEVDECK_TOKEN` is not set
- Initialize auth module

### Steps
1. Call `getToken()`
2. Validate result matches UUID v4 pattern

### Expected Result
- Token matches `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`

---

## Test TP-07: Terminal server — missing token rejects with 4401

- **Type:** Unit
- **Task:** T3, T7
- **Priority:** Critical

### Setup
- Create terminal server with known token via options
- Connect WebSocket client WITHOUT token query param

### Steps
1. Open WebSocket to `ws://127.0.0.1:<port>/`
2. Wait for close event

### Expected Result
- WebSocket receives close code `4401`
- Close reason is `"Unauthorized"`
- No PTY process is spawned (`spawn` not called)

---

## Test TP-08: Terminal server — invalid token rejects with 4401

- **Type:** Unit
- **Task:** T3, T7
- **Priority:** Critical

### Setup
- Create terminal server with known token
- Connect WebSocket client with `?token=wrong-token`

### Steps
1. Open WebSocket to `ws://127.0.0.1:<port>/?token=wrong-token`
2. Wait for close event

### Expected Result
- Close code `4401`, reason `"Unauthorized"`
- No PTY spawned

---

## Test TP-09: Terminal server — valid token spawns PTY

- **Type:** Unit
- **Task:** T3, T7
- **Priority:** Critical

### Setup
- Create terminal server with known token `test-token`
- Connect WebSocket client with `?token=test-token`

### Steps
1. Open WebSocket to `ws://127.0.0.1:<port>/?token=test-token`
2. Wait for open event
3. Send binary message

### Expected Result
- Connection stays open
- PTY `spawn` is called
- PTY `write` receives the sent data

---

## Test TP-10: Terminal server — default cwd is os.homedir()

- **Type:** Unit
- **Task:** T6, T7
- **Priority:** High

### Setup
- Create terminal server with valid token, no `cwd` option, `DEVDECK_WORKSPACE_ROOT` unset
- Connect client with valid token

### Steps
1. Inspect `node-pty.spawn` call arguments

### Expected Result
- Third argument's `cwd` property equals `os.homedir()`

---

## Test TP-11: Terminal server — login shell flag

- **Type:** Unit
- **Task:** T6, T7
- **Priority:** High

### Setup
- Create terminal server, connect with valid token

### Steps
1. Inspect `node-pty.spawn` second argument (args array)

### Expected Result
- Spawn args include `"-l"` (i.e., `["-l"]`)

---

## Test TP-12: Terminal server — locale env vars set

- **Type:** Unit
- **Task:** T6, T7
- **Priority:** Medium

### Setup
- Unset `LANG` and `LC_ALL` from `process.env`
- Create terminal server, connect with valid token

### Steps
1. Inspect `node-pty.spawn` options `env` object

### Expected Result
- `env.LANG` is `"en_US.UTF-8"`
- `env.LC_ALL` is `"en_US.UTF-8"`

---

## Test TP-13: Middleware — valid cookie passes through

- **Type:** Unit
- **Task:** T4
- **Priority:** High

### Setup
- Mock `NextRequest` with `devdeck_token` cookie set to valid token

### Steps
1. Call middleware with the mocked request

### Expected Result
- Returns `NextResponse.next()` (not 401, not redirect)

---

## Test TP-14: Middleware — valid query param sets cookie and redirects

- **Type:** Unit
- **Task:** T4
- **Priority:** High

### Setup
- Mock `NextRequest` with `?token=<valid>` query parameter, no cookie

### Steps
1. Call middleware with the mocked request

### Expected Result
- Response is a redirect to the same URL without `?token=`
- Response includes `Set-Cookie: devdeck_token=<valid>` (httpOnly)

---

## Test TP-15: Middleware — no credentials returns 401

- **Type:** Unit
- **Task:** T4
- **Priority:** Critical

### Setup
- Mock `NextRequest` with no cookie, no header, no query param

### Steps
1. Call middleware with the mocked request

### Expected Result
- Response status is 401
- Response body contains `{ error: "Authentication required", code: "AUTH_REQUIRED" }`

---

## Test TP-16: Middleware — static assets bypass auth

- **Type:** Unit
- **Task:** T4
- **Priority:** Medium

### Setup
- Mock `NextRequest` for `/_next/static/chunk.js` with no credentials

### Steps
1. Verify the middleware matcher config excludes static paths

### Expected Result
- Middleware config matcher excludes `_next/static`, `_next/image`, `favicon.ico`

---

## Test TP-17: Frontend — WebSocket URL includes token

- **Type:** Unit
- **Task:** T5
- **Priority:** High

### Setup
- Mock `document.cookie` with `devdeck_token=test-token`
- Import `buildWsUrl` (or test via hook behavior)

### Steps
1. Call the URL builder or inspect the WebSocket URL used by the hook

### Expected Result
- URL contains `?token=test-token`

---

## Test TP-18: Frontend — close code 4401 prevents reconnection

- **Type:** Unit
- **Task:** T5
- **Priority:** Critical

### Setup
- Render terminal hook with mock WebSocket
- Simulate WebSocket close with code 4401

### Steps
1. Trigger `ws.onclose` event with `code: 4401`
2. Check hook status and reconnect behavior

### Expected Result
- Status is `"failed"`
- Error message contains "Unauthorized"
- No reconnection timer is set
- `reconnectAttempt` stays at 0

---

## Test TP-19: E2E — terminal connects with token auth

- **Type:** E2E (Playwright)
- **Task:** T8
- **Priority:** Critical

### Setup
- `DEVDECK_TOKEN` set in playwright config env
- Browser has token cookie set via page context

### Steps
1. Navigate to home page
2. Click first project card
3. Wait for terminal panel
4. Wait for "Connected" status
5. Type `echo hello-devdeck` and press Enter
6. Wait for output

### Expected Result
- Terminal shows "Connected"
- Output contains "hello-devdeck"

---

## Test TP-20: E2E — terminal starts in home directory

- **Type:** E2E (Playwright)
- **Task:** T8
- **Priority:** Medium

### Setup
- Same as TP-19

### Steps
1. Connect to terminal
2. Type `pwd` and press Enter

### Expected Result
- Output contains the home directory path

---

## Test TP-21: Dev startup — both servers start with just dev

- **Type:** Manual / Integration
- **Task:** T1
- **Priority:** High

### Setup
- Clean environment, dependencies installed

### Steps
1. Run `just dev`
2. Wait for both servers to report ready
3. Open browser to `http://localhost:8070`
4. Check terminal connectivity

### Expected Result
- Next.js server starts on port 8070
- Terminal WebSocket server starts on port 3100
- Both processes terminate on Ctrl+C
