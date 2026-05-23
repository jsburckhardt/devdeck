# Action Plan: fix: tmux attach failure when opening projects with shared devcontainer sessions

## Feature
- **ID:** 34
- **Research Brief:** project/issues/34/research/00-research.md

## ADRs Created
None — no new architectural decisions required. This is a bug fix extending an existing protocol.

## Core-Components Updated
- **CORE-COMPONENT-0003** (WebSocket Terminal Communication) — added `setup` message type rules, interface definition, and client-side handling obligations

## Implementation Tasks

### Overview
The fix adds a `{ type: "setup" }` JSON text frame to the WebSocket terminal protocol so the client knows which session mode is active (tmux vs shell) and whether a fallback occurred. This is a three-layer change:

1. **Server** (`src/server/terminal-server.mts`) — emit `setup` messages at two points: after initial PTY spawn and before wiring the fallback shell when tmux fails
2. **Hook** (`src/hooks/use-terminal.ts`) — handle `setup` messages, expose `terminalMode` and `isFallback` state, clear terminal buffer on fallback
3. **Component** (`src/components/terminal-panel.tsx`) — render session mode badge in header, show transient fallback notification

### Task Order
1. **Task 1** — Server: send `setup` message after PTY spawn and on tmux fallback
2. **Task 2** — Hook: handle `setup` messages, add `terminalMode`/`isFallback` state
3. **Task 3** — Component: render mode badge and fallback notification
4. **Task 4** — Server tests (T23–T25)
5. **Task 5** — Hook tests (H-T1–H-T3)
6. **Task 6** — Component tests for mode badge and fallback UI

### Dependencies
- Tasks 2 depends on Task 1 (needs to know the message shape)
- Task 3 depends on Task 2 (needs the hook's new exports)
- Tasks 4–6 can be written alongside or after their respective source tasks
