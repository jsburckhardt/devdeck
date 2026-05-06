# Action Plan: Implement WebSocket Terminal Backend (xterm.js + node-pty)

## Feature
- **ID:** 5
- **Research Brief:** project/issues/5/research/00-research.md

## ADRs Created
- None — existing ADR-0002 covers the tech stack decisions.

## Core-Components Updated
- **CORE-COMPONENT-0003** (WebSocket Terminal Communication) — corrected server file path to `src/server/terminal-server.mts`; added binary framing note for `node-pty` string→Buffer conversion and frontend `binaryType = "arraybuffer"` requirement.

## Approach

Refactor the existing scaffolded server and terminal panel to fully comply with CORE-COMPONENT-0003 (WebSocket Terminal Communication) and CORE-COMPONENT-0005 (Error Handling). Extract a `useTerminal` hook from `terminal-panel.tsx` and harden the server for production use.

### Architecture

- **Standalone WS server** on port 3100 (`src/server/terminal-server.mts`), proxied by Next.js rewrite at `/api/terminal`
- **Binary protocol** for terminal I/O: server sends PTY output as binary frames (`Buffer.from(data, 'utf8')`), frontend sends input as `ArrayBuffer` (`TextEncoder.encode()`)
- **JSON text frames** for control messages (resize only), validated ≤1KB before parsing
- **`useTerminal` hook** (`src/hooks/use-terminal.ts`) owns the full terminal lifecycle: xterm.js, addons, WebSocket, ResizeObserver, auto-reconnect

### Key Design Decisions

1. **Hook returns `TerminalStatus` enum** — `"disconnected" | "connecting" | "connected" | "reconnecting" | "failed"` plus `reconnectAttempt` and `maxReconnectAttempts` for UI rendering
2. **Server uses `isBinary` arg** from ws `message` handler to distinguish binary terminal I/O from JSON control messages — no ambiguous parsing
3. **Server exports `createTerminalServer(options)` factory** returning `{ wss, cleanup }` for testability; `startTerminalServer()` remains as the CLI entrypoint
4. **Idempotent PTY cleanup** with a `cleaned` guard flag preventing double-kill on close+error race
5. **Generation guard** for async dynamic imports to handle React StrictMode double-mount and fast unmount races
6. **Always render terminal container div** — overlay error/status UI on top rather than conditionally swapping, preserving xterm.js DOM state
7. **Control message size validation** — reject text frames >1KB before `JSON.parse` to prevent DoS
8. **Unicode11Addon activated** with `term.unicode.activeVersion = "11"` after loading

## Implementation Tasks

1. **Task 1: server-hardening** — Refactor `src/server/terminal-server.mts` with factory pattern, binary protocol, validation, and cleanup hardening
2. **Task 2: use-terminal-hook** — Create `src/hooks/use-terminal.ts` with binary I/O, auto-reconnect, generation guard, full lifecycle management
3. **Task 3: terminal-panel-refactor** — Simplify `src/components/terminal-panel.tsx` to consume the `useTerminal` hook with overlay status UI
4. **Task 4: server-tests** — Create `src/server/terminal-server.test.ts` with mocked node-pty
5. **Task 5: hook-tests** — Create `src/hooks/use-terminal.test.ts` with mocked xterm.js and WebSocket
6. **Task 6: playwright-e2e** — End-to-end test verifying terminal connects and executes commands
