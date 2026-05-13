# Implementation Notes: Issue #29

## Summary

Implemented and verified tmux fallback behavior for project terminals:

- Missing .devcontainer/.tmux-shared now selects system-default tmux with tmux new-session -A -s <sanitizedSlug> in the resolved project cwd.
- Existing shared-socket attach behavior remains unchanged.
- Empty sanitized slugs skip project tmux resolution and fall back to the configured default cwd shell.
- Tmux spawn-time failures now attempt a regular shell fallback in the resolved project cwd before closing the WebSocket.
- Fallback PTYs are wired through the same message flush and WebSocket close/error cleanup path, preventing PTY leaks on client close.

## Files Changed

- src/server/terminal-server.mts
- src/server/terminal-server.test.ts
- project/architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md
- project/architecture/ADR/DECISION-LOG.md
- project/issues/29/implementation/README.md

## Validation

- npm run test -- src/server/terminal-server.test.ts: passed, 26 tests.
- npm run lint: passed with one existing warning in src/server/terminal-server.test.ts for unused mock parameter _p.
- npm run format:check: passed.
- npm run build: passed with existing Next.js workspace-root/middleware/NFT warnings.
- npm run test: passed.

## Task Status

- T1: Complete.
- T2: Complete.
- T3: Complete.
- T4: Complete.
