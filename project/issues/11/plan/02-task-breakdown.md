# Task Breakdown — Issue #11

## Task T1: Add concurrently & fix dev startup

- **Status:** Not Started
- **Complexity:** Low
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006

### Description
Install `concurrently` as a dev dependency. Update the `dev:all` script in `package.json` to use `concurrently` instead of `&` backgrounding. Update the `just dev` recipe in `justfile` to run `npm run dev:all` so both Next.js and the terminal server start together.

### Acceptance Criteria
- [ ] `concurrently` is listed in `devDependencies`
- [ ] `dev:all` script uses `concurrently "npm:terminal" "npm:dev"` (or equivalent)
- [ ] `just dev` runs `npm run dev:all`
- [ ] Both servers start and are reachable when running `just dev`
- [ ] Ctrl+C kills both processes cleanly

### Test Coverage
- Manual verification: `just dev` starts both servers
- CI: existing E2E tests (Playwright config already starts both servers independently)

---

## Task T2: Create auth utilities

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005

### Description
Create `src/lib/auth.ts` with:
1. `initToken()` — reads `DEVDECK_TOKEN` env var or generates one via `crypto.randomUUID()`, stores in module-level variable
2. `getToken(): string` — returns the current token
3. `validateToken(candidate: string): boolean` — constant-time comparison using `crypto.timingSafeEqual` with UTF-8 encoded buffers; returns `false` for empty/undefined input

### Acceptance Criteria
- [ ] `getToken()` returns `DEVDECK_TOKEN` env var when set
- [ ] `getToken()` returns a valid UUID when env var is unset
- [ ] `validateToken()` returns `true` for correct token
- [ ] `validateToken()` returns `false` for incorrect token
- [ ] `validateToken()` returns `false` for empty string and `undefined`
- [ ] Token comparison uses `crypto.timingSafeEqual`
- [ ] Module exports are typed and documented with JSDoc

### Test Coverage
- Unit tests in `src/lib/auth.test.ts` covering all acceptance criteria
- Minimum 6 test cases: correct token, wrong token, empty string, different length, env var override, UUID format

---

## Task T3: Add token auth to terminal server

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** T2
- **Related ADRs:** ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
Modify `src/server/terminal-server.mts`:
1. Import and call `initToken()` in `startTerminalServer()` before starting the WSS
2. Print token and clickable URL to stdout on startup
3. In the `wss.on("connection")` handler, extract `token` from the upgrade request URL query params
4. Call `validateToken(token)` — if invalid, send close code 4401 with reason "Unauthorized" and return immediately (no PTY spawn)
5. Accept `TerminalServerOptions.token` for testing to override the module token

### Acceptance Criteria
- [ ] Connections without a token receive close code 4401
- [ ] Connections with an invalid token receive close code 4401
- [ ] Connections with a valid token proceed to PTY spawn
- [ ] No PTY process is spawned for rejected connections
- [ ] Token and URL are printed to stdout on startup
- [ ] `createTerminalServer` accepts an optional `token` parameter for testing

### Test Coverage
- Update `src/server/terminal-server.test.ts` with 3+ new tests: missing token rejection, invalid token rejection, valid token acceptance
- Verify `fakePty` spawn count is 0 for rejected connections

---

## Task T4: Add Next.js middleware for HTTP auth

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** T2
- **Related ADRs:** ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0005

### Description
Create `src/middleware.ts`:
1. Export a `middleware` function and a `config` matcher excluding `_next/static`, `_next/image`, `favicon.ico`
2. Check for authentication in order: `devdeck_token` cookie → `Authorization: Bearer <token>` header → `token` query parameter
3. If `?token=` query param is valid, set `devdeck_token` HTTP-only cookie and redirect to the same URL without the token param
4. If no valid credential found, return 401 JSON response `{ error: "Authentication required", code: "AUTH_REQUIRED" }`
5. Import `validateToken` from `src/lib/auth.ts`

### Acceptance Criteria
- [ ] Requests with valid cookie pass through
- [ ] Requests with valid `Authorization: Bearer` header pass through
- [ ] Requests with valid `?token=` param set cookie and redirect (stripping token from URL)
- [ ] Requests with no credentials return 401 + `AUTH_REQUIRED`
- [ ] Static assets (`_next/static`, `favicon.ico`) are excluded from auth
- [ ] `/api/terminal` WebSocket upgrade requests are excluded (handled by terminal server directly)

### Test Coverage
- Unit tests for middleware logic (mock `NextRequest` / `NextResponse`)
- Test each auth path: cookie, header, query param, missing credentials

---

## Task T5: Update frontend for token handling

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** T2, T3
- **Related ADRs:** ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005

### Description
Update `src/hooks/use-terminal.ts`:
1. Add a `getClientToken()` helper that reads the token from the `devdeck_token` cookie (via `document.cookie`) or falls back to `localStorage.getItem("devdeck_token")`
2. Append `?token=<token>` to the WebSocket URL in `buildWsUrl()`
3. In the `ws.onclose` handler, detect close code 4401 — set status to `"failed"`, set error to `"Unauthorized – invalid or missing token"`, and do NOT attempt reconnection

Update `src/components/terminal-panel.tsx`:
4. Add an "unauthorized" visual variant to the failed state overlay (e.g., lock icon, different message)

### Acceptance Criteria
- [ ] WebSocket URL includes `?token=` parameter
- [ ] Token is read from cookie or localStorage
- [ ] Close code 4401 sets status to "failed" with auth error message
- [ ] Close code 4401 does NOT trigger reconnection
- [ ] Terminal panel shows distinct "Unauthorized" message for auth failures

### Test Coverage
- Unit test for `buildWsUrl()` with token appended
- Unit test for close code 4401 handling (no reconnect)
- Visual test: terminal-panel renders auth error overlay

---

## Task T6: Fix shell defaults

- **Status:** Not Started
- **Complexity:** Low
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
Modify `src/server/terminal-server.mts`:
1. Change default `cwd` from `process.cwd()` to `os.homedir()` (keep `DEVDECK_WORKSPACE_ROOT` override)
2. Change shell spawn args from `[]` to `["-l"]` for login shell behavior (loads `.profile`, `.bashrc`, etc.)
3. Add locale environment variables to `sanitizedEnv`: `LANG=en_US.UTF-8`, `LC_ALL=en_US.UTF-8` (only if not already set)

Import `os` at the top of the file.

### Acceptance Criteria
- [ ] Default cwd is `os.homedir()` when `DEVDECK_WORKSPACE_ROOT` is not set
- [ ] `DEVDECK_WORKSPACE_ROOT` still overrides cwd when set
- [ ] Shell is spawned with `["-l"]` args
- [ ] `LANG` and `LC_ALL` default to `en_US.UTF-8` if not already in environment
- [ ] Existing `LANG`/`LC_ALL` values are preserved if already set

### Test Coverage
- Update `terminal-server.test.ts` T1 test to verify cwd defaults to `os.homedir()`
- Add test for `-l` flag in spawn args
- Add test for locale env vars in spawn options

---

## Task T7: Update unit tests

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** T2, T3, T6
- **Related ADRs:** ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005, CORE-COMPONENT-0006

### Description
1. Create `src/lib/auth.test.ts` — comprehensive unit tests for `initToken`, `getToken`, `validateToken`
2. Update `src/server/terminal-server.test.ts`:
   - Add tests for token-based WebSocket rejection (close code 4401)
   - Add tests for valid token acceptance
   - Update T1 test assertions for new cwd default (`os.homedir()`) and login shell args (`["-l"]`)
   - Add test for locale env vars
3. Update `connectClient` helper to accept optional token query param

### Acceptance Criteria
- [ ] `src/lib/auth.test.ts` exists with ≥6 test cases
- [ ] Terminal server tests cover auth rejection and acceptance
- [ ] Terminal server tests verify cwd = `os.homedir()` default
- [ ] Terminal server tests verify shell args = `["-l"]`
- [ ] All tests pass with `npm run test`

### Test Coverage
- Auth utilities: 100% branch coverage
- Terminal server auth: ≥3 new test cases
- Terminal server shell defaults: ≥3 new test cases

---

## Task T8: Update E2E tests

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** T1, T3, T5, T6
- **Related ADRs:** ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
1. Update `playwright.config.ts` to pass `DEVDECK_TOKEN` env var to both web server commands so E2E tests have a known token
2. Update `e2e/terminal.spec.ts`:
   - Set the token cookie or localStorage before navigating
   - Verify terminal still connects and executes commands with auth
   - Add test case: access without token shows 401 or auth error
3. Verify shell starts in `$HOME` directory

### Acceptance Criteria
- [ ] E2E tests pass with token authentication enabled
- [ ] Terminal connects successfully with valid token
- [ ] E2E config sets `DEVDECK_TOKEN` for deterministic testing
- [ ] At least one test verifies auth rejection without token

### Test Coverage
- E2E: terminal connects with token (happy path)
- E2E: auth rejection without token
- E2E: shell starts in home directory

---

## Task T9: Update documentation

- **Status:** Not Started
- **Complexity:** Low
- **Dependencies:** T1–T8
- **Related ADRs:** ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005

### Description
1. Update `LLM.txt` to document:
   - Token authentication flow (env var, auto-generation, query param, cookie)
   - New `src/lib/auth.ts` module
   - `src/middleware.ts` middleware
   - Updated `just dev` behavior
   - Shell defaults (cwd, login shell, locale)
2. Verify CORE-COMPONENT-0003 and CORE-COMPONENT-0005 updates (done during planning) are accurate

### Acceptance Criteria
- [ ] `LLM.txt` documents auth flow, new files, and shell defaults
- [ ] CORE-COMPONENT-0003 reflects token handshake rules
- [ ] CORE-COMPONENT-0005 reflects auth error patterns
- [ ] No stale references to unauthenticated `/api/terminal` in docs

### Test Coverage
- Manual review: documentation accuracy
- Grep for stale references to unauthenticated WebSocket endpoint
