# Research Brief — Issue #5: feat: Implement WebSocket terminal backend (xterm.js + node-pty)

## 1. Scope Classification

**Type:** `issue`

This is a concrete feature-implementation task implementing the backend and frontend integration defined in CORE-COMPONENT-0003 (WebSocket Terminal Communication) and CORE-COMPONENT-0005 (Error Handling). No new ADR is needed. CORE-COMPONENT-0003 requires a minor correction (server file path discrepancy) — documented in §8.

---

## 2. Problem Statement

Issue #5 closes the gap between the scaffolded terminal components and a production-ready WebSocket terminal. Two partial implementations exist:

- **Backend** (`src/server/terminal-server.mts`): Spawns a PTY per connection and routes JSON messages, but uses JSON for all I/O (should be binary), lacks SIGTERM handling, missing input size guards, missing try/catch on `pty.write()`/`ws.send()`, and sends error messages as raw strings rather than structured JSON.
- **Frontend** (`src/components/terminal-panel.tsx`): Renders xterm.js and connects via WebSocket, but sends terminal input as JSON text (should be binary ArrayBuffer), does not load the unicode11 addon, has no auto-reconnection, and embeds all terminal logic inline (no `useTerminal` hook).

Neither component has any tests. The `src/hooks/` directory does not exist.

What must be delivered:
1. Production-hardened `src/server/terminal-server.mts` with binary protocol, SIGTERM, size guards, structured error messages, and safe try/catch.
2. `src/hooks/use-terminal.ts` hook extracted from `terminal-panel.tsx`, managing xterm.js lifecycle, binary WebSocket I/O, all three addons (fit, web-links, unicode11), ResizeObserver, and auto-reconnect (3 retries, 1s/2s/4s backoff).
3. Refactored `src/components/terminal-panel.tsx` consuming the new hook.
4. Unit tests for both the hook and the server handler.
5. A correction to CORE-COMPONENT-0003 (server file path).

---

## 3. Current State Analysis

### 3.1 Backend — `src/server/terminal-server.mts` (lines 1–97)

The server is launched via `npm run terminal` (`npx tsx src/server/terminal-server.mts`) and binds to `127.0.0.1:3100`. Next.js rewrites `/api/terminal` to `http://127.0.0.1:3100`.

**What works:**
- Spawns a real PTY via `node-pty` per WebSocket connection (`terminal-server.mts:20-26`)
- Tracks active PTYs in a `Set<IPty>` and kills all on `SIGINT` (`terminal-server.mts:88-96`)
- Kills the PTY and nullifies the reference on `ws.on("close")` (`terminal-server.mts:62-69`)
- Handles PTY exit by closing the WebSocket (`terminal-server.mts:36-41`)
- Validates resize dimensions (clamps cols to [1,500], rows to [1,200]) (`terminal-server.mts:49-52`)
- Falls through to raw-string input if JSON parse fails (`terminal-server.mts:54-58`)

**What is broken / missing:**
- **Binary protocol**: `pty.onData` emits strings; `ws.send(data)` sends as text frame — must be `ws.send(Buffer.from(data, 'utf8'))` (`terminal-server.mts:30-33`)
- **Input discrimination**: All `ws.on("message")` data is JSON-parsed; binary frames from the browser are not detected (`terminal-server.mts:43-59`)
- **SIGTERM**: Only `SIGINT` is handled (`terminal-server.mts:88`); SIGTERM must also be registered
- **Control message size limit**: No 1 KB cap on incoming JSON messages
- **Structured error on spawn failure**: Sends raw string ``Failed to start terminal: ${err}`` (`terminal-server.mts:83`); must be `JSON.stringify({ type: "error", message: ... })`
- **try/catch on `pty.write()`**: No guard (`terminal-server.mts:48`)
- **try/catch on `ws.send()`**: No guard (`terminal-server.mts:31`)
- **`DEVDECK_WORKSPACE_ROOT` env var**: CWD uses `process.env.HOME` only (`terminal-server.mts:24`)

### 3.2 Frontend — `src/components/terminal-panel.tsx` (lines 1–184)

**What works:**
- xterm.js Terminal instance created and opened dynamically (`terminal-panel.tsx:28-75`)
- FitAddon and WebLinksAddon loaded and applied (`terminal-panel.tsx:29-31, 68-75`)
- ResizeObserver triggers `FitAddon.fit()` on container resize (`terminal-panel.tsx:138-153`)
- Connection status indicator (green dot / grey dot) (`terminal-panel.tsx:159-165`)
- Error/retry UI with descriptive message (`terminal-panel.tsx:168-182`)
- WebSocket opened from `TERMINAL_WS_URL` derived from `window.location` (`terminal-panel.tsx:6-9`)
- Sends resize events as JSON control messages (`terminal-panel.tsx:111-115`)
- Cleans up WebSocket and terminal on unmount (`terminal-panel.tsx:125-134`)

**What is broken / missing:**
- **No `useTerminal` hook**: All logic inline; CORE-COMPONENT-0003 requires `src/hooks/use-terminal.ts`
- **JSON input instead of binary**: `ws.send(JSON.stringify({ type: "input", data }))` (`terminal-panel.tsx:106-108`) — must be `Uint8Array`
- **`binaryType` not set**: `ws.binaryType = "arraybuffer"` not set; required to receive binary from server
- **`onmessage` not binary-aware**: `term.write(event.data)` works for strings accidentally; must handle `ArrayBuffer`
- **unicode11 addon not loaded**: `@xterm/addon-unicode11` installed but never imported or applied
- **No auto-reconnection**: `ws.onclose` only sets `connected = false` (`terminal-panel.tsx:96-98`)
- **No "Reconnecting…" state**: CORE-COMPONENT-0005 requires showing attempt count and progress
- **No reconnect timer cleanup**: Non-existent, but must be implemented with cancel on unmount

### 3.3 `src/hooks/` Directory

Does **not exist**. Must be created.

### 3.4 Existing Tests

| File | Tests |
|------|-------|
| `src/components/error-boundary.test.tsx` | 3 tests — ErrorBoundary render, catch, retry |
| `src/components/theme-provider.test.tsx` | 3 tests — theme default, toggle, localStorage |
| `src/app/page.test.tsx` | 3 tests — home page smoke tests |
| `src/hooks/use-terminal.test.ts` | ❌ Does not exist |
| `src/server/terminal-server.test.ts` | ❌ Does not exist |

### 3.5 Integration Points

- `workspace-layout.tsx:162-170`: `TerminalPanel` rendered inside a `Panel` with `ErrorBoundary` wrapping
- `workspace-context.tsx:33, 70-72`: `showTerminal` boolean and `toggleTerminal` callback
- `next.config.ts:4-12`: `serverExternalPackages: ["node-pty"]` and `/api/terminal` → `http://127.0.0.1:3100` rewrite
- `package.json:9-10`: `"terminal"` and `"dev:all"` scripts already configured
- `.github/soft-factory/verification.yml:1-20`: Verification pipeline runs lint, format:check, build, test

---

## 4. Gap Analysis vs. CORE-COMPONENT-0003

| Spec Requirement | Status | Detail |
|-----------------|--------|--------|
| Every session backed by real PTY (node-pty) | ✅ Done | `terminal-server.mts:20-26` |
| WebSocket (ws) for communication | ✅ Done | Both sides use WS |
| Cleanup PTY on disconnect | ✅ Done | `terminal-server.mts:62-69` |
| Resize events propagated frontend → backend | ✅ Done | JSON `{ type: "resize" }` messages |
| `useTerminal(ref)` hook at `src/hooks/use-terminal.ts` | ❌ Missing | Hook does not exist; logic is inline |
| Binary (ArrayBuffer/Buffer) for terminal I/O | ❌ Missing | Both sides use JSON/strings |
| JSON for control messages (resize, ping) | ✅ Done for resize | Implemented |
| Latency < 50ms on localhost | ✅ Likely | Architecture supports it when protocol fixed |
| PTY killed when client disconnects | ✅ Done | `terminal-server.mts:62-69` |
| Resize support end-to-end | ✅ Done | FitAddon → JSON → node-pty.resize |
| Connection loss → visible error state | ✅ Done | Error UI in terminal-panel |
| Auto-reconnect (3 retries, 1s/2s/4s) | ❌ Missing | CORE-COMPONENT-0005 requirement |
| Server path: `src/server/terminal.ts` | ❌ Mismatch | Actual: `src/server/terminal-server.mts` |
| Frontend hook at `src/hooks/use-terminal.ts` | ❌ Missing | Directory doesn't exist |
| Unit tests for hook and WS handler | ❌ Missing | Zero terminal tests |

---

## 5. Gap Analysis vs. CORE-COMPONENT-0005

| Spec Requirement | Status | Detail |
|-----------------|--------|--------|
| WS disconnect → auto-reconnect (max 3, exponential backoff) | ❌ Missing | Not implemented |
| After max retries → "Connection lost" UI + manual retry | ⚠️ Partial | Manual retry exists; no backoff state |
| ErrorBoundary wraps terminal panel | ✅ Done | `workspace-layout.tsx:163-170` |
| PTY crash allows new terminal without page reload | ✅ Partial | Error UI + retry button exists |
| `useWebSocketReconnect` hook (or equivalent in `useTerminal`) | ❌ Missing | No reconnect hook exists |

---

## 6. Dependencies

All required packages are already installed. **No new dependencies needed.**

| Package | Version | Role |
|---------|---------|------|
| `@xterm/xterm` | ^6.0.0 | Browser terminal emulator |
| `@xterm/addon-fit` | ^0.11.0 | Container resize → terminal fit |
| `@xterm/addon-web-links` | ^0.12.0 | Clickable hyperlinks |
| `@xterm/addon-unicode11` | ^0.9.0 | Unicode 11 character width (loaded but unused) |
| `node-pty` | ^1.1.0 | PTY process spawning |
| `ws` | ^8.20.0 | WebSocket server |
| `@types/ws` | ^8.18.1 | TypeScript types for ws |
| `sonner` | ^2.0.7 | Toast notifications for errors |

---

## 7. Risks and Concerns

### R1 — Next.js Rewrite WebSocket Upgrade (High Risk)
`next.config.ts` rewrites `/api/terminal` to `http://127.0.0.1:3100`. HTTP rewrites do not automatically pass through WebSocket upgrade headers. With Turbopack (`npm run dev`), the upgrade may be silently dropped, causing the terminal to show "Connection refused." If confirmed broken, the frontend must fall back to connecting directly to `ws://127.0.0.1:3100`, and CORE-COMPONENT-0003 must document this as an accepted exception for the dev architecture.

### R2 — Binary Protocol: node-pty Emits Strings (Medium Risk)
`node-pty`'s `onData` callback delivers `string`, not `Buffer`. To send a binary WebSocket frame, the server must explicitly call `ws.send(Buffer.from(data, 'utf8'))`. If passed a string, `ws` sends a text frame, and the browser `onmessage` event receives a string — which xterm.js accepts, masking the protocol violation. The fix is straightforward but easy to miss in review.

### R3 — xterm.js in jsdom Test Environment (Medium Risk)
xterm.js calls `document.createElement('canvas')` and uses `MutationObserver`. jsdom supports these partially but xterm.js rendering will fail. The `useTerminal` hook tests must mock `@xterm/xterm` entirely using `vi.mock`. A factory function pattern returning a fake `Terminal` object with tracked method calls (`open`, `write`, `dispose`, `onData`, `onResize`) is required.

### R4 — node-pty in Tests (Medium Risk)
Tests for `terminal-server.mts` must mock `node-pty` via `vi.mock('node-pty')`. The mock must expose an `EventEmitter`-compatible `IPty` with `onData`, `onExit`, `write`, `resize`, and `kill` methods. Timing between PTY events and WebSocket state must be carefully controlled with `vi.useFakeTimers()` where needed.

### R5 — Reconnect Timer Leaks (Low-Medium Risk)
Auto-reconnection uses `setTimeout`. If the component unmounts or the user navigates away during a backoff window, the timer callback will fire into an unmounted component (React state update on unmounted component warning, potential WS connection to a closed page). The hook cleanup must call `clearTimeout` on the pending reconnect handle.

### R6 — PTY Zombie Processes (Low Risk, Mitigated)
The current code kills the PTY on WebSocket close (`terminal-server.mts:62-69`) and on PTY exit it closes the WebSocket (`terminal-server.mts:36-40`). The SIGINT handler kills all tracked PTYs (`terminal-server.mts:88-96`). Adding SIGTERM and try/catch around `pty.kill()` will make this robust.

---

## 8. Architectural Impact

### CORE-COMPONENT-0003 — Minor Update Required

**Change 1 — Server file path correction:**
- Integration Guidelines currently states: `"The WebSocket server setup should be in src/server/terminal.ts"`
- Actual file: `src/server/terminal-server.mts` (`.mts` required for ESM interop with `tsx` runner)
- Correction: Update the Integration Guidelines path to `src/server/terminal-server.mts`

**Change 2 — Binary framing clarification (optional, recommended):**
- Add a note that `node-pty.onData` emits `string`; the server must call `ws.send(Buffer.from(data, 'utf8'))` to produce a binary frame.
- The frontend must set `ws.binaryType = "arraybuffer"` to receive binary and check `event.data instanceof ArrayBuffer`.

**No status change** (stays Adopted). No new ADR is required; this is implementation of existing decisions.

### No Other ADRs or Core-Components Need Changes

CORE-COMPONENT-0005 correctly specifies the reconnect pattern (`useWebSocketReconnect`, max 3 retries, 1s/2s/4s backoff). The `useTerminal` hook will implement this pattern inline (reconnect logic embedded in the hook) rather than as a separate `useWebSocketReconnect` hook — this is an acceptable simplification for a single-consumer pattern.

---

## 9. Proposed Core-Component Changes

| Document | Change Type | Title / Description |
|----------|------------|---------------------|
| `CORE-COMPONENT-0003-websocket-terminal.md` | Correction | Fix Integration Guidelines: `src/server/terminal.ts` → `src/server/terminal-server.mts`; add binary framing note |

---

## 10. File Locations for Implementation

| Artifact | Path | Action |
|----------|------|--------|
| WebSocket server | `src/server/terminal-server.mts` | Harden — binary protocol, SIGTERM, size guard, try/catch |
| Frontend hook | `src/hooks/use-terminal.ts` | Create — extract from terminal-panel, add binary+reconnect |
| Terminal panel | `src/components/terminal-panel.tsx` | Refactor — consume `useTerminal` hook |
| Hook tests | `src/hooks/use-terminal.test.ts` | Create — vi.mock xterm.js + WS |
| Server tests | `src/server/terminal-server.test.ts` | Create — vi.mock node-pty + ws |

---

## 11. References

| Document | Path |
|----------|------|
| GitHub Issue #5 | https://github.com/jsburckhardt/devdeck/issues/5 |
| Terminal server | `src/server/terminal-server.mts` |
| Terminal panel | `src/components/terminal-panel.tsx` |
| Workspace layout | `src/components/workspace-layout.tsx` |
| Workspace context | `src/lib/workspace-context.tsx` |
| Error boundary | `src/components/error-boundary.tsx` |
| Next.js config | `next.config.ts` |
| Package manifest | `package.json` |
| Verification config | `.github/soft-factory/verification.yml` |
| Vitest config | `vitest.config.ts` |
| CORE-COMPONENT-0003 | `project/architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md` |
| CORE-COMPONENT-0005 | `project/architecture/core-components/CORE-COMPONENT-0005-error-handling.md` |
| ADR-0002 | `project/architecture/ADR/ADR-0002-tech-stack.md` |
| Decision Log | `project/architecture/ADR/DECISION-LOG.md` |
