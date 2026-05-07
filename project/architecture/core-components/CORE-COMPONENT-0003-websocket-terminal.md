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
- The WebSocket upgrade request MUST include a valid bearer token as a `token` query parameter
- The server MUST validate the token BEFORE spawning a PTY process
- Invalid or missing tokens MUST result in WebSocket close code 4401 ("Unauthorized") with no PTY spawned
- The frontend MUST detect close code 4401 and surface an "Unauthorized" error without reconnecting
- The client MAY pass `slug=<project-slug>` as a query parameter on the WebSocket upgrade URL to request a project-specific terminal session
- The server MUST resolve the CWD server-side using `resolveProjectPath(slug)` — the filesystem path MUST NOT be exposed to the client in any WebSocket message
- The server MUST sanitize the slug before passing it to `resolveProjectPath` or using it as a tmux session name
- If `<resolvedCwd>/.devcontainer/.tmux-shared` exists, the server SHOULD spawn `tmux -S <socketPath> attach-session -t <sanitizedSlug>` instead of a login shell
- If tmux attach fails (session not found or tmux not installed), the server MUST fall back to a regular shell in the project directory
- If no slug is provided, the server MUST fall back to `os.homedir()` as CWD

### Interfaces
- **WebSocket endpoint:** `/api/terminal?token=<bearer>&slug=<project-slug>` — accepts WebSocket upgrade requests with valid token; `slug` is optional and selects per-project CWD and tmux session
- **Token handshake:** On upgrade, server extracts `token` from query string, validates via `crypto.timingSafeEqual`, rejects with close code 4401 if invalid
- **Frontend hook:** `useTerminal(ref)` — manages xterm.js instance, WebSocket connection, token injection, and addon lifecycle
- **Message format:** Raw binary data (ArrayBuffer) for terminal I/O; JSON for control messages (resize, ping)

### Expectations
- Terminal input/output latency MUST be under 50ms on localhost
- PTY processes MUST be killed when the client disconnects
- The terminal MUST support resize (xterm.js addon-fit → resize message → node-pty.resize)
- Connection loss MUST show a visible error state in the terminal UI

## Rationale

Raw WebSocket with binary data provides the lowest latency for terminal I/O. xterm.js natively supports binary attachments. node-pty is the standard Node.js PTY library used by VS Code's terminal. This combination is battle-tested and well-documented.

## Usage Examples

```typescript
// Frontend: useTerminal hook (with token)
const terminalRef = useRef<HTMLDivElement>(null);
const { terminal, isConnected } = useTerminal(terminalRef);

// Backend: WebSocket handler (with token validation)
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
  const shell = pty.spawn('bash', ['-l'], { cols: 80, rows: 24, cwd: os.homedir() });
  ws.on('message', (data) => shell.write(data));
  shell.onData((data) => ws.send(data));
});
```

## Integration Guidelines

- The WebSocket server setup should be in `src/server/terminal-server.mts` (`.mts` extension required for ESM interop with `tsx` runner)
- The frontend hook should be in `src/hooks/use-terminal.ts`
- xterm.js addons (fit, web-links, unicode11) should be loaded in the hook
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
