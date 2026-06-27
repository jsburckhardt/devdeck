# Issue #101 Implementation Notes

## Summary
- Implemented launch-cwd-aware workspace-root resolution in `loadConfig` and forwarded the launch cwd into startup config loading so the default terminal now derives its root from the DevDeck launch context unless `DEVDECK_WORKSPACE_ROOT` or config `workspaceRoot` is explicitly set.
- Simplified the default terminal WebSocket server to a shell-only host terminal that authenticates first, rejects unsupported `slug`/`worktree` requests with the required 1008 error frame before any PTY spawn, and uses cwd precedence `TerminalServerOptions.cwd` → `DEVDECK_WORKSPACE_ROOT` → `process.cwd()`.
- Removed default-terminal project/worktree coupling from the React client so `WorkspaceLayout` renders the terminal without project props, `useTerminal` omits slug/worktree from the WebSocket URL, and close code `1008` becomes a failed unsupported-context state with no reconnect loop.
- Added/updated unit, component, and E2E coverage for config precedence, startup output, terminal-server behavior, and the default terminal contract.

## Files changed
- `src/lib/config.ts`
- `src/server/start-dev.mts`
- `src/server/terminal-server.mts`
- `src/hooks/use-terminal.ts`
- `src/components/terminal-panel.tsx`
- `src/components/workspace-layout.tsx`
- `src/lib/config.test.ts`
- `src/server/start-dev.test.ts`
- `src/server/terminal-server.test.ts`
- `src/hooks/use-terminal.test.ts`
- `src/components/workspace-layout.test.tsx`
- `src/components/terminal-panel.test.tsx`
- `README.md`
- `LLM.txt`
- `e2e/terminal.spec.ts`

## Verification
- `./harness test -- src/lib/config.test.ts src/server/start-dev.test.ts src/server/terminal-server.test.ts src/hooks/use-terminal.test.ts src/components/workspace-layout.test.tsx src/components/terminal-panel.test.tsx` → passed (17 tests).
- `./harness verify` → passed (lint, format check, build, test, and smoke all passed).
- `npx playwright test e2e/terminal.spec.ts` → passed (7 tests).

## Deviations / Notes
- No architectural deviations from the amended ADR/core-component plan were required.
- The harness does not expose a Playwright verb, so the E2E verification was executed with a raw Playwright command.

## Friction answer
What did the agent have to infer that the harness should have proved?
- The agent had to infer that the raw Playwright E2E verification path was required because the harness exposes no Playwright verb; the harness should have provided a direct Playwright verification surface for the E2E suite.
