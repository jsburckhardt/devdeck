# CORE-COMPONENT-0003: WebSocket Terminal Communication

## Status

Adopted (updated)

## Purpose

Establish the communication pattern between the browser-based terminal (xterm.js) and the server-side PTY process (node-pty). This is the core architectural concern that enables the real terminal experience in DevDeck.

## Scope

- Frontend: xterm.js terminal widget and WebSocket client
- Backend: WebSocket server, PTY process lifecycle management
- Communication protocol between frontend and backend

## Definition

### Rules
- Every terminal session MUST be backed by a real PTY process spawned via node-pty
- Communication between xterm.js and node-pty MUST use WebSocket (ws library)
- The backend MUST clean up PTY processes when the WebSocket connection closes
- Terminal resize events MUST be propagated from xterm.js to node-pty
- The WebSocket endpoint MUST be served from the Next.js backend (API route or custom server)
- The WebSocket upgrade request MUST include a valid bearer token as a `token` query parameter or via the `devdeck_token` HTTP cookie
- The server MUST validate the token BEFORE spawning a PTY process
- Invalid or missing tokens MUST result in WebSocket close code 4401 ("Unauthorized") with no PTY spawned
- The frontend MUST detect close code 4401 and surface an "Unauthorized" error without reconnecting
- The client MAY pass `slug=<project-slug>` as a query parameter on the WebSocket upgrade URL to request a project-specific terminal session
- The server MUST resolve the CWD server-side using `resolveProjectPath(slug)` — the filesystem path MUST NOT be exposed to the client in any WebSocket message
- The server MUST sanitize the slug before passing it to `resolveProjectPath` or using it as a tmux session name
- If `<resolvedCwd>/.devcontainer/.tmux-shared` exists, the server SHOULD spawn `tmux -S <socketPath> attach-session -t <sanitizedSlug>` instead of a login shell
- If tmux attach fails (session not found or tmux not installed), the server MUST fall back to a regular shell in the project directory
- If no slug is provided, the server MUST fall back to the configured default CWD (`DEVDECK_WORKSPACE_ROOT`, `options.cwd`, or `os.homedir()`)
- The client MUST pass initial terminal dimensions as `cols` and `rows` query parameters on the WebSocket upgrade URL so the server can spawn the PTY at the correct size before any resize message arrives
- The frontend MUST load `@xterm/addon-clipboard` (ClipboardAddon) to support OSC 52 clipboard escape sequences from programs like tmux and vim
- The frontend MUST set `screenReaderMode: true` in the Terminal constructor options to enable accessibility input methods (IME, voice-to-text)
- After the PTY is successfully spawned (and before flushing any pending input messages), the server MUST send a JSON text frame `{ type: "setup", mode: "tmux" | "shell" }` to the client to communicate the active session mode
- When tmux attach exits with a non-zero code and the server falls back to a regular shell, the server MUST send `{ type: "setup", mode: "shell", fallback: true, reason: "tmux-attach-failed" }` before wiring the fallback PTY
- The client MUST handle `setup` messages: update `terminalMode` state, and call `term.clear()` when `fallback: true` is received to erase any error output the failed tmux process may have written to the terminal buffer
- The client MUST reset `terminalMode` to `"unknown"` and `isFallback` to `false` at the start of each `connect()` attempt

### Interfaces
- **WebSocket endpoint:** `/api/terminal?token=<bearer>&slug=<project-slug>&cols=<N>&rows=<N>` — accepts WebSocket upgrade requests with valid token (via query param or cookie); `slug` is optional and selects per-project CWD and tmux session; `cols`/`rows` are optional initial dimensions (clamped server-side, defaults to 80×24)
- **Token handshake:** On upgrade, server extracts `token` from query string or `devdeck_token` cookie, validates via `crypto.timingSafeEqual`, rejects with close code 4401 if invalid
- **Frontend hook:** `useTerminal(ref)` — manages xterm.js instance, WebSocket connection, token injection, addon lifecycle, and exposes `terminalMode` and `isFallback` state
- **Message format:** Raw binary data (ArrayBuffer) for terminal I/O; JSON for control messages (resize, ping)
- **Setup message (server → client):** `{ type: "setup", mode: "tmux" | "shell", fallback?: true, reason?: string }` — sent as a JSON text frame immediately after PTY spawn and on any session mode transition (e.g., tmux fallback to shell)

### Expectations
- Terminal input/output latency MUST be under 50ms on localhost
- PTY processes MUST be killed when the client disconnects
- The terminal MUST support resize (xterm.js addon-fit → resize message → node-pty.resize)
- Connection loss MUST show a visible error state in the terminal UI

## Rationale

Raw WebSocket with binary data provides the lowest latency for terminal I/O. xterm.js natively supports binary attachments. node-pty is the standard Node.js PTY library used by VS Code's terminal. This combination is battle-tested and well-documented.

## Usage Examples

```typescript
// Frontend: useTerminal hook
const { containerRef, status, isConnected, error, retry } = useTerminal({
  wsUrl: "ws://localhost:3100/api/terminal",
});

// Backend: WebSocket handler (with token validation and initial dimensions)
import { WebSocketServer } from 'ws';
import * as pty from 'node-pty';
import { validateToken } from '../lib/auth';

wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (!token || !validateToken(token)) {
    ws.close(4401, 'Unauthorized');
    return;
  }
  const cols = Math.max(1, Math.min(500, Number(url.searchParams.get('cols')) || 80));
  const rows = Math.max(1, Math.min(200, Number(url.searchParams.get('rows')) || 24));
  const shell = pty.spawn('bash', ['-l'], { cols, rows, cwd: os.homedir() });
  ws.on('message', (data) => shell.write(data));
  shell.onData((data) => ws.send(data));
});
```

## Integration Guidelines

- The WebSocket server setup should be in `src/server/terminal-server.mts` (`.mts` extension required for ESM interop with `tsx` runner)
- The frontend hook should be in `src/hooks/use-terminal.ts`
- xterm.js addons (fit, web-links, unicode11, clipboard) should be loaded in the hook
- PTY shell selection should default to the user's `$SHELL` or fall back to `/bin/bash`
- **Binary framing note:** `node-pty`'s `onData` emits `string`; the server must call `ws.send(Buffer.from(data, 'utf8'))` to produce a binary WebSocket frame. The frontend must set `ws.binaryType = "arraybuffer"` and check `event.data instanceof ArrayBuffer` in `onmessage`.

## Exceptions

- In test environments, the WebSocket connection may be mocked
- In CI, terminal tests may use a stub PTY instead of real node-pty

## Enforcement

- [x] Automated checks: WebSocket connection tests
- [x] Code review checklist: Verify PTY cleanup on disconnect
- [x] Test coverage requirements: Terminal hook and WebSocket handler must have unit tests

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md)
- [ADR-0004-token-authentication](../ADR/ADR-0004-token-authentication.md)
