# CORE-COMPONENT-0003: WebSocket Terminal Communication

## Status

Adopted

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

### Interfaces
- **WebSocket endpoint:** `/api/terminal` — accepts WebSocket upgrade requests
- **Frontend hook:** `useTerminal(ref)` — manages xterm.js instance, WebSocket connection, and addon lifecycle
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
// Frontend: useTerminal hook
const terminalRef = useRef<HTMLDivElement>(null);
const { terminal, isConnected } = useTerminal(terminalRef);

// Backend: WebSocket handler
import { WebSocketServer } from 'ws';
import * as pty from 'node-pty';

const shell = pty.spawn('bash', [], { cols: 80, rows: 24 });
ws.on('message', (data) => shell.write(data));
shell.onData((data) => ws.send(data));
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
