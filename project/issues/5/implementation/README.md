# Implementation Notes — Issue #5: WebSocket Terminal Backend Hardening

## Summary

Refactored the WebSocket terminal backend and frontend to implement binary framing, production hardening, proper hook extraction, and comprehensive test coverage.

## Tasks Completed

### Task 1: server-hardening

- **Status:** Complete
- **Files Changed:** `src/server/terminal-server.mts`

Refactored the terminal server to export `createTerminalServer(options)` factory function and `startTerminalServer()` CLI entrypoint. Key changes:
- Binary outbound: PTY output sent as `Buffer.from(data, 'utf8')` (binary WebSocket frames)
- Binary inbound: Uses `isBinary` flag to route binary messages directly to PTY
- Text inbound: Validates byte length ≤1KB, parses JSON, handles resize control messages
- Resize validation: `Number.isFinite()` check, clamped to [1,500]×[1,200]
- Idempotent cleanup: `cleaned` guard flag prevents double-kill
- try/catch on `pty.write()`, `pty.resize()`, `ws.send()`
- SIGTERM + SIGINT handlers (only in `startTerminalServer`)
- CWD: `options.cwd ?? process.env.DEVDECK_WORKSPACE_ROOT ?? process.cwd()`
- Environment sanitization: filters out `undefined` values from `process.env`
- Structured error on spawn failure: sends `{ type: "error", message }` JSON then closes

### Task 2: use-terminal-hook

- **Status:** Complete
- **Files Changed:** `src/hooks/use-terminal.ts`

Created `useTerminal` custom React hook extracted from inline terminal-panel logic:
- Dynamic imports of xterm.js and all 3 addons (fit, web-links, unicode11)
- Sets `term.unicode.activeVersion = "11"` after loading Unicode11Addon
- Binary protocol: `TextEncoder.encode()` for outbound, `TextDecoder.decode()` for inbound
- `ws.binaryType = "arraybuffer"` for binary terminal I/O
- ResizeObserver on container → `fitAddon.fit()`
- Generation guard prevents stale async import from attaching to DOM
- Auto-reconnect with exponential backoff (1s, 2s, 4s), max 3 retries
- `intentionalCloseRef` prevents reconnect on unmount/manual close
- Returns `{ containerRef, status, isConnected, error, reconnectAttempt, maxReconnectAttempts, retry }`
- Exports `TerminalStatus` type

### Task 3: terminal-panel-refactor

- **Status:** Complete
- **Files Changed:** `src/components/terminal-panel.tsx`, `src/components/project-card.tsx`

Simplified `TerminalPanel` to consume `useTerminal` hook:
- All inline terminal logic removed
- Container div always rendered (never conditionally swapped)
- Status overlay for connecting, reconnecting, and failed states
- Connection indicator dot (green=connected, yellow=reconnecting, grey=other)
- Added `data-testid` attributes for E2E testing
- Added `data-testid="project-card"` to `ProjectCard`

### Task 4: server-tests

- **Status:** Complete
- **Files Changed:** `src/server/terminal-server.test.ts`
- **Tests:** 9 tests, all passing

Tests cover:
- T1: PTY spawn configuration (shell, cwd, sanitized env)
- T2: Binary message routes to PTY
- T3: Resize message validates and clamps
- T4: Malformed JSON ignored
- T5: Oversized control message ignored
- T6: PTY exit closes WebSocket
- T7: WebSocket close kills PTY (idempotent)
- T8: PTY spawn failure sends structured error
- T9: Resize with NaN/null values clamped

### Task 5: hook-tests

- **Status:** Complete
- **Files Changed:** `src/hooks/use-terminal.test.ts`
- **Tests:** 9 tests, all passing

Tests cover:
- T10: Returns initial state
- T11: WebSocket open sets connected status
- T12: Terminal input sends binary
- T13: Resize sends JSON control message
- T14: Unexpected close triggers reconnection
- T15: Max retries sets failed status
- T16: Manual retry resets and reconnects
- T17: Unmount cleans up everything
- T18: Intentional close does not reconnect

### Task 6: playwright-e2e

- **Status:** Complete
- **Files Changed:** `e2e/terminal.spec.ts`, `playwright.config.ts`

Created Playwright E2E test that:
- Navigates to home page
- Clicks first project card
- Waits for terminal panel and "Connected" status
- Types `echo hello-devdeck` command
- Verifies output appears

## Verification Results

- **Lint:** ✅ Clean (`npm run lint`)
- **Format:** ✅ Clean (`npm run format:check`)
- **Build:** ✅ Success (`npm run build`)
- **Tests:** ✅ 27/27 passing across 5 test files (`npm run test`)

## Architecture Compliance

- Follows CORE-COMPONENT-0003 binary framing protocol
- Follows CORE-COMPONENT-0005 error handling (auto-reconnect, structured errors)
- Follows CORE-COMPONENT-0006 development standards (co-located tests, TypeScript strict)
- Follows ADR-0002 tech stack decisions
