# Task Breakdown: feat(terminal): decouple default terminal from selected project

## Task T1: Implement launch-cwd workspace root precedence

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0006 (#251, #252, #253)
- **Related Core-Components:** CORE-COMPONENT-0003 (#258), CORE-COMPONENT-0009 (#244, #247, #248)

### Description
Update configuration/startup plumbing so the default terminal cwd ultimately comes from the DevDeck launch directory when no explicit `DEVDECK_WORKSPACE_ROOT` or config-file `workspaceRoot` is set.

Implementation scope:
- Add a startup cwd option (for example `launchCwd?: string`) to `LoadConfigOptions`.
- Resolve `workspaceRoot` precedence as env `DEVDECK_WORKSPACE_ROOT` → config `workspaceRoot` → startup launch cwd → `process.cwd()`.
- Pass `startDev`'s resolved `cwd` into `loadConfig`.
- Print the resolved workspace root and source in the startup banner.
- Preserve existing token, `projectsDir`, host/port, `initialProjects`, and data-dir behavior.

### Acceptance Criteria
- `loadConfig` resolves env/config `workspaceRoot` exactly as before when either is explicitly set.
- `loadConfig` resolves missing `workspaceRoot` to the supplied launch cwd.
- `loadConfig` falls back to `process.cwd()` when no launch cwd is supplied.
- `startDev` forwards its `cwd` dependency into `loadConfig`.
- Startup output includes the resolved workspace root and its source.
- Targeted tests pass with `./harness test -- src/lib/config.test.ts src/server/start-dev.test.ts`.

### Test Coverage
- Add/adjust `src/lib/config.test.ts` cases for:
  - env `DEVDECK_WORKSPACE_ROOT` overrides config and launch cwd.
  - config `workspaceRoot` overrides launch cwd.
  - missing `workspaceRoot` uses supplied launch cwd.
  - missing launch cwd falls back to `process.cwd()` deterministically via a spy/mock.
  - source metadata reports the default/launch source expected by ADR-0006.
- Add/adjust `src/server/start-dev.test.ts` cases proving `loadConfig` receives the startup cwd and the banner logs workspace root/source without leaking tokens.

## Task T2: Simplify `/api/terminal` to a default host shell endpoint

- **Status:** Pending
- **Complexity:** Large
- **Dependencies:** T1
- **Related ADRs:** ADR-0004 (#33, #34, #36), ADR-0006 (#251, #252)
- **Related Core-Components:** CORE-COMPONENT-0003 (#254, #255, #256, #257, #258, #262), CORE-COMPONENT-0005 (#16, #40)

### Description
Update `src/server/terminal-server.mts` so the default endpoint no longer performs implicit project, worktree, or tmux routing. The endpoint must authenticate first, reject unsupported context before spawning a PTY, then spawn a regular host shell from the resolved cwd for supported requests.

Implementation scope:
- Replace standalone cwd fallback `homedir()` with `process.cwd()`.
- Preserve `TerminalServerOptions.cwd` as the highest-precedence direct override.
- Preserve forwarded `DEVDECK_WORKSPACE_ROOT` as the env/config/launch-cwd source from T1.
- Detect `slug` or `worktree` query parameters after token validation.
- Send exactly `{ "type": "error", "message": "Project-scoped terminals are not supported by the default terminal." }` as a JSON text frame, then close with code `1008`.
- Do not echo supplied `slug`/`worktree` values in frames, close reasons, or logs.
- Do not call `resolveProjectPath`, `tmux`, or worktree resolution on the default path.
- Preserve token/cookie auth, initial `cols`/`rows`, binary `Buffer.from(data, "utf8")` output, resize handling, PTY cleanup, Copilot detection no-op behavior without a project key, and setup frame `{ type: "setup", mode: "shell" }`.

### Acceptance Criteria
- Unauthenticated WebSocket attempts still close with `4401` and spawn no PTY.
- Authenticated default WebSocket attempts without `slug`/`worktree` spawn one regular shell PTY.
- Authenticated attempts with `slug`, `worktree`, or both spawn no PTY, receive the fixed error frame, and close with `1008`.
- Default terminal spawn never invokes tmux or project/worktree path resolution.
- Cwd precedence is `TerminalServerOptions.cwd` → `DEVDECK_WORKSPACE_ROOT` → `process.cwd()`.
- Targeted tests pass with `./harness test -- src/server/terminal-server.test.ts`.

### Test Coverage
- Add/adjust `src/server/terminal-server.test.ts` cases for:
  - default no-option cwd equals `process.cwd()`, not home.
  - `TerminalServerOptions.cwd` wins over env.
  - `DEVDECK_WORKSPACE_ROOT` wins over `process.cwd()`.
  - valid auth + `slug` closes with `1008`, emits the fixed error frame, and does not spawn.
  - valid auth + `worktree` closes with `1008`, emits the fixed error frame, and does not spawn.
  - invalid auth + `slug` still closes `4401` before unsupported-context handling.
  - default setup message remains `{ type: "setup", mode: "shell" }`.
  - dimensions/resize and PTY cleanup continue to pass existing tests.
- Remove or rewrite default-path tmux/project/worktree expectations that are superseded by CORE-COMPONENT-0003 decisions #255-#257.

## Task T3: Remove project/worktree routing from default terminal client APIs

- **Status:** Pending
- **Complexity:** Large
- **Dependencies:** T2
- **Related ADRs:** ADR-0004 (#34, #36)
- **Related Core-Components:** CORE-COMPONENT-0003 (#255, #256, #259, #261, #262), CORE-COMPONENT-0007 (#84), CORE-COMPONENT-0008 (#90, #110)

### Description
Update client terminal wiring so project selection affects Explorer/File Preview only and the default terminal uses no project/worktree identity.

Implementation scope:
- Remove `slug` and `worktree` from default `UseTerminalOptions`.
- Update WebSocket URL construction to include token/dimensions only for default callers.
- Add close-code `1008` handling that sets failed/unsupported-context error state and does not reconnect.
- Remove `slug`/`worktree` from `TerminalPanelProps` and the `useTerminal` call.
- Render `<TerminalPanel />` from `WorkspaceLayout` without `project.slug` or `activeWorktree`.
- Keep `WorkspaceLayout` passing `activeWorktree` to file-tree sync, Explorer, and File Preview flows.
- Update voice context cleanup to key on terminal connectivity/lifecycle rather than project/worktree.
- Preserve terminal theme switching, keyboard helper raw input, voice review workflow, accessibility labels/live regions, xterm binary input/output, dimensions/resize, retry for supported host terminal failures, and mounted/collapsed panel behavior.

### Acceptance Criteria
- `useTerminal` public options expose `wsUrl` and `theme`, but not `slug` or `worktree`.
- Default WebSocket URLs never include `slug` or `worktree`, including after retry/reconnect.
- `WorkspaceLayout` still consumes `activeWorktree` for Explorer/File Preview/file sync but not for TerminalPanel props.
- Close code `1008` produces a visible terminal error and no reconnect loop.
- Supported unexpected host-terminal closes still retry with bounded backoff.
- Terminal stays mounted when hidden per CORE-COMPONENT-0007 decision #84.
- Targeted tests pass with `./harness test -- src/hooks/use-terminal.test.ts src/components/workspace-layout.test.tsx src/components/terminal-panel.test.tsx`.

### Test Coverage
- Update `src/hooks/use-terminal.test.ts`:
  - remove slug/worktree URL option tests or convert them to assert absence.
  - assert reconnect/retry URLs omit `slug`/`worktree`.
  - add close-code `1008` no-reconnect/failed-state coverage.
  - preserve `4401`, unexpected close retry, dimensions, resize, binary send, theme, and font-size tests.
- Update `src/components/workspace-layout.test.tsx`:
  - mock `TerminalPanel` as a no-prop component and assert it receives no `slug`/`worktree`.
  - assert file-tree sync and FileViewer/Explorer behavior still receive active worktree context.
  - preserve mounted-panel and toggle-order tests.
- Update `src/components/terminal-panel.test.tsx`:
  - render `<TerminalPanel />` without slug/worktree.
  - assert keyboard helper and voice UI reset on connect/disconnect/unmount, not project/worktree changes.
  - preserve theme, accessibility, voice review, and helper input tests.

## Task T4: Remove default terminal Copilot sidebar side effects

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** T3
- **Related ADRs:** ADR-0005 (#95, #96, #97, #98)
- **Related Core-Components:** CORE-COMPONENT-0003 (#260), CORE-COMPONENT-0008 (#159, #160, #161, #164)

### Description
Remove the React-side coupling that writes terminal Copilot status into project-sidebar state for the default host terminal. Server-side status detection can remain as a no-op for null project keys, but the default `TerminalPanel` must not update `OpenProjectsContext`.

Implementation scope:
- Remove the `updateCopilotStatus(slug, copilotStatus)` effect from default `TerminalPanel`.
- Avoid requiring `useOpenProjects()` in the default terminal solely for Copilot status propagation.
- Keep project-sidebar badge persistence behavior unchanged for existing project state.
- Keep `useTerminal` exposing `copilotStatus` as `"idle"` by default and handling status frames defensively.

### Acceptance Criteria
- Default `TerminalPanel` never calls `updateCopilotStatus`.
- Sidebar Copilot status tests continue to govern project badges independently of default host terminal connection state.
- Terminal server status-key behavior remains safe for null/default terminal context.
- Targeted tests pass with `./harness test -- src/components/terminal-panel.test.tsx src/lib/open-projects-context.test.tsx src/components/project-sidebar.test.tsx`.

### Test Coverage
- Update `src/components/terminal-panel.test.tsx` to assert no `updateCopilotStatus` call even when `copilotStatus` is `"running"` and `isConnected` is true.
- Preserve or update OpenProjects/ProjectSidebar tests asserting project badge states are retained/cleared only by project-scoped status updates and project closure.
- If terminal-server tests currently assert same-project broadcast behavior, keep only tests applicable to explicit keyed contexts or remove default-path coupling expectations.

## Task T5: Update documentation, E2E coverage, and verification evidence

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** T1, T2, T3, T4
- **Related ADRs:** ADR-0006 (#251, #252, #253), ADR-0004 (#33-#36)
- **Related Core-Components:** CORE-COMPONENT-0003 (#254-#262), CORE-COMPONENT-0005 (#16, #40), CORE-COMPONENT-0009 (#146-#150, #244)

### Description
Update user-facing/repo-map documentation and add end-to-end coverage proving that selecting a project no longer changes the default terminal cwd.

Implementation scope:
- Update `README.md` configuration table so `workspaceRoot` default is the DevDeck launch cwd / `process.cwd()` fallback, not the home directory.
- Update `LLM.txt` summaries for `terminal-server.mts`, `use-terminal.ts`, `terminal-panel.tsx`, `workspace-layout.tsx`, and `config.ts` as needed.
- Add or adjust `e2e/terminal.spec.ts` coverage to select a project, run `pwd`, and assert it matches the DevDeck launch cwd rather than the selected project path.
- Preserve existing terminal E2E coverage for auth, connection, command execution, fit/no overflow, touch font-size, keyboard helper, voice review, and access rejection.
- Run final targeted and full verification.

### Acceptance Criteria
- Documentation no longer describes the default terminal as project/worktree/tmux routed.
- Playwright verifies `pwd` in the default terminal is the launch cwd while a project is selected.
- Vitest targeted suites pass through `./harness test -- <targets>`.
- Raw Playwright terminal E2E passes with `npx playwright test e2e/terminal.spec.ts` because `./harness` has no Playwright verb.
- Full implementation verification passes with `./harness verify`.

### Test Coverage
- Add/adjust Playwright test coverage for:
  - selected project + terminal `pwd` equals launch cwd.
  - terminal still executes commands and fits without horizontal overflow.
  - auth rejection remains covered.
- Run targeted Vitest suites from T1-T4 using `./harness test --`.
- Run `./harness verify` before handoff to cover lint, format check, build, Vitest, and smoke.
