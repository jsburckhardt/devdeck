# Test Plan: feat(terminal): decouple default terminal from selected project

## Test TEST-01: Workspace root precedence resolves from launch cwd

- **Type:** Unit
- **Task:** T1
- **Priority:** High

### Setup
- Use `src/lib/config.test.ts` with temporary config/data directories.
- Mock or inject env/config values and launch cwd values.

### Steps
1. Call `loadConfig` with env `DEVDECK_WORKSPACE_ROOT`, config `workspaceRoot`, and a different launch cwd.
2. Call `loadConfig` with config `workspaceRoot` and a different launch cwd but no env root.
3. Call `loadConfig` with no explicit root and a supplied launch cwd.
4. Call `loadConfig` with no explicit root and no launch cwd, controlling `process.cwd()` deterministically.
5. Run `./harness test -- src/lib/config.test.ts`.

### Expected Result
- Env root wins over config and launch cwd.
- Config root wins over launch cwd.
- Launch cwd is the default when no explicit root exists.
- `process.cwd()` is the fallback when no launch cwd exists.
- Source metadata and resolved paths match ADR-0006 decisions #251-#253.

## Test TEST-02: Startup forwards cwd into config and output

- **Type:** Unit
- **Task:** T1
- **Priority:** High

### Setup
- Use `src/server/start-dev.test.ts` with mocked `loadConfig`, child `spawn`, and log collection.

### Steps
1. Invoke `startDev({ cwd: "/repo", loadConfig: mockLoadConfig, ... })`.
2. Assert `mockLoadConfig` receives the base env, warning logger, and launch cwd.
3. Assert spawned child env includes the resolved `DEVDECK_WORKSPACE_ROOT`.
4. Assert startup logs include workspace root and source while preserving token redaction.
5. Run `./harness test -- src/server/start-dev.test.ts`.

### Expected Result
- Startup uses the same cwd for config defaulting and child process execution.
- Startup output proves the terminal cwd source without leaking secrets.

## Test TEST-03: Terminal server rejects unsupported project/worktree context

- **Type:** Integration
- **Task:** T2
- **Priority:** Critical

### Setup
- Use `src/server/terminal-server.test.ts` with mocked `node-pty.spawn`, filesystem/tmux helpers, and real local WebSocket clients.

### Steps
1. Connect without auth when a token is configured and include `slug`; capture close code and PTY spawn count.
2. Connect with valid auth and `slug`; capture text frames, close code, and PTY spawn count.
3. Connect with valid auth and `worktree`; capture text frames, close code, and PTY spawn count.
4. Connect with valid auth and both parameters; capture text frames, close code, and PTY spawn count.
5. Run `./harness test -- src/server/terminal-server.test.ts`.

### Expected Result
- Invalid auth closes `4401` before unsupported-context handling and spawns no PTY.
- Valid auth plus any `slug`/`worktree` closes `1008`, sends exactly the fixed error frame, and spawns no PTY.
- Frames, logs, and close reasons do not echo supplied parameter values.

## Test TEST-04: Terminal server spawns host shell with cwd precedence

- **Type:** Integration
- **Task:** T2
- **Priority:** Critical

### Setup
- Use `src/server/terminal-server.test.ts` with `node-pty.spawn` mocked.

### Steps
1. Start server with `TerminalServerOptions.cwd` and env `DEVDECK_WORKSPACE_ROOT`; connect without context.
2. Start server with only env `DEVDECK_WORKSPACE_ROOT`; connect without context.
3. Start server with neither option nor env; control expected `process.cwd()`; connect without context.
4. Assert command is the configured/default shell and not `tmux`.
5. Assert setup frame is `{ "type": "setup", "mode": "shell" }`.
6. Run `./harness test -- src/server/terminal-server.test.ts`.

### Expected Result
- Cwd precedence is options → env/resolved workspace root → `process.cwd()`.
- Supported default terminal sessions use shell mode only.
- Existing resize, binary frame, cleanup, and setup-message behavior remains intact.

## Test TEST-05: Client WebSocket URL and close handling match host-terminal contract

- **Type:** Unit
- **Task:** T3
- **Priority:** High

### Setup
- Use `src/hooks/use-terminal.test.ts` with mocked WebSocket, xterm, fit addon, timers, and terminal dimensions.

### Steps
1. Render `useTerminal()` and inspect the created WebSocket URL.
2. Trigger reconnect/retry paths and inspect replacement WebSocket URLs.
3. Trigger close code `1008`.
4. Trigger close code `4401` and an unexpected retryable close as regression checks.
5. Run `./harness test -- src/hooks/use-terminal.test.ts`.

### Expected Result
- Default URLs include token/dimensions as applicable but never `slug` or `worktree`.
- Retry/reconnect URLs also omit `slug` and `worktree`.
- Close code `1008` sets failed/unsupported-context state and schedules no reconnect.
- Close code `4401` and retryable close behavior remain correct.

## Test TEST-06: Workspace and terminal panel decoupling preserves project-scoped Explorer/File Preview

- **Type:** Component
- **Task:** T3, T4
- **Priority:** High

### Setup
- Use `src/components/workspace-layout.test.tsx` and `src/components/terminal-panel.test.tsx` with mocked workspace/open-project contexts and terminal hook.

### Steps
1. Render `WorkspaceLayout` with an active project and active worktree.
2. Assert `TerminalPanel` is rendered without `slug`/`worktree` props.
3. Assert file-tree sync receives `slug` and `worktree` for Explorer/File Preview behavior.
4. Render `TerminalPanel` with a connected mocked terminal and active `copilotStatus`.
5. Assert `updateCopilotStatus` is not called.
6. Exercise keyboard helper, voice review, disconnect cleanup, theme picker, and mounted panel toggling regressions.
7. Run `./harness test -- src/components/workspace-layout.test.tsx src/components/terminal-panel.test.tsx src/lib/open-projects-context.test.tsx src/components/project-sidebar.test.tsx`.

### Expected Result
- Project selection drives Explorer/File Preview only.
- Default terminal does not consume active project/worktree and does not update project-sidebar Copilot state.
- Accessibility, keyboard helper, voice review, theme, and mounted panel behavior remain covered.

## Test TEST-07: End-to-end selected project does not change default terminal cwd

- **Type:** E2E
- **Task:** T5
- **Priority:** High

### Setup
- Use `e2e/terminal.spec.ts`.
- Launch DevDeck from a known cwd with a token and at least one selectable project.
- Use raw Playwright because `./harness` has no Playwright verb.

### Steps
1. Authenticate via `/?token=<token>`.
2. Select a project from the landing page.
3. Wait for the terminal panel to connect.
4. Run `pwd` in the terminal.
5. Assert output equals the DevDeck launch cwd, not the selected project path.
6. Re-run existing terminal command/fit/auth regressions.
7. Run `npx playwright test e2e/terminal.spec.ts`.

### Expected Result
- Selecting a project does not reroute the default terminal cwd.
- Terminal command execution, fit/no-overflow behavior, touch font-size coverage, voice review, and auth rejection remain passing.

## Test TEST-08: Full harness verification

- **Type:** Verification
- **Task:** T5
- **Priority:** Critical

### Setup
- Complete implementation tasks T1-T5.
- Ensure targeted Vitest and Playwright checks have passed.

### Steps
1. Run `./harness verify`.
2. Review harness verdict and evidence summary.

### Expected Result
- Harness verdict is `pass`.
- Verification covers lint, format check, build, Vitest, and smoke.
- Any non-empty harness inference friction is recorded before handoff.
