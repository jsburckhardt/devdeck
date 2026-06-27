# Research Brief: feat(terminal): decouple default terminal from selected project

## GitHub Issue
- **Issue:** #101
- **Title:** feat(terminal): decouple default terminal from selected project

## Scope Classification
- **Scope Type:** issue

---

## Problem Statement

DevDeck currently couples the default workspace terminal to the selected project and active worktree. Every time a user selects a project, the terminal opens in that project's directory (resolved server-side via `resolveProjectPath(slug)`), optionally attaching to a tmux shared-socket session or creating a system-default tmux session. This implicit routing makes the terminal harder to compose with and surprises users who expect the file explorer and file preview to track their browsing project while the terminal stays anchored to the app launch directory.

The desired user model is:
- **Explorer + File Preview** → scoped to selected project / active worktree (unchanged).
- **Default Terminal** → opens a simple host shell whose cwd follows the precedence chain: explicit `TerminalServerOptions.cwd` → explicit `DEVDECK_WORKSPACE_ROOT`/`workspaceRoot` config → DevDeck launch `process.cwd()`.

Devcontainer tmux attachment, project-scoped terminals, and worktree terminal routing are out of scope for this issue and should not remain as implicit default behaviour. They should become explicit future capabilities.

---

## Existing Context

### Current Behaviour (source-confirmed)

| Location | Current behaviour |
|----------|------------------|
| `src/components/workspace-layout.tsx` line 474 | `<TerminalPanel slug={project.slug} worktree={activeWorktree ?? undefined} />` — passes selected project context to terminal on every render |
| `src/hooks/use-terminal.ts` `buildWsUrl()` lines 235–246 | Appends `slug` and `worktree` query params when they are present in `UseTerminalOptions` |
| `src/hooks/use-terminal.ts` line 258 | `const baseWsUrl = options?.wsUrl ?? buildWsUrl(options?.slug, options?.worktree)` |
| `src/server/terminal-server.mts` `createTerminalServer()` line 625 | `const cwd = options?.cwd ?? process.env.DEVDECK_WORKSPACE_ROOT ?? homedir()` — falls back to `homedir()`, not `process.cwd()` |
| `src/server/terminal-server.mts` `resolveTerminalSetup()` lines 226–305 | Three-branch decision tree: shared-socket tmux attach → system-default tmux → shell fallback; all gated on a non-null slug |
| `src/lib/config.ts` lines 276–282 | `workspaceRoot` default is `os.homedir()` |
| `src/components/terminal-panel.tsx` lines 21–24 | `TerminalPanelProps { slug?: string; worktree?: string }` |
| `src/components/terminal-panel.tsx` lines 155–157 | `useTerminal({ slug, worktree, theme: theme.colors })` |
| `src/components/terminal-panel.tsx` lines 181–185 | Copilot status side-effect: `if (slug && isConnected) { updateCopilotStatus(slug, copilotStatus) }` |
| `src/components/terminal-panel.tsx` line 172 | `useVoiceInput` contextKey includes `slug ?? "default"` and `worktree ?? "root"` |

When `slug` is null on the server the `resolveTerminalSetup()` already short-circuits to the default cwd (line 233), so the logical branch exists — but the default cwd itself falls back to `homedir()` rather than `process.cwd()`, and the client still sends the slug, so the code path is not exercised in practice.

### Relevant Architecture Records

| Record | Key decisions affected |
|--------|----------------------|
| **ADR-0006** | Default `workspaceRoot = os.homedir()` (needs amendment to `process.cwd()` when no explicit root configured) |
| **CORE-COMPONENT-0003** | Decisions #42, #43, #44, #45, #46, #65, #66, #85, #86, #87, #123 document implicit slug/tmux/worktree routing as part of the default terminal contract — all require superseding or amendment for the default endpoint |
| **CORE-COMPONENT-0008** | Decision #90: `activeWorktree` on WorkspaceContext is still needed for Explorer/File Preview; terminal must stop consuming it |
| **CORE-COMPONENT-0007** | Decision #84 (panels stay mounted) and the WorkspaceLayout control-bar order remain unchanged |
| **ADR-0004** | Token auth before PTY spawn is unchanged and must stay first |

### Impacted Source Files

**Core changes:**
- `src/components/workspace-layout.tsx` — remove `slug` and `worktree` from `<TerminalPanel>` invocation
- `src/components/terminal-panel.tsx` — remove `slug`/`worktree` from `TerminalPanelProps` and `useTerminal` call; remove Copilot status side-effect; update `useVoiceInput` contextKey
- `src/hooks/use-terminal.ts` — remove `slug`/`worktree` from `UseTerminalOptions` and `buildWsUrl`; add handling for WS close code `1008` (unsupported-context, no reconnect)
- `src/server/terminal-server.mts` — reject requests containing `slug`/`worktree` params with JSON error frame + close code `1008` after auth and before PTY spawn; change default cwd fallback from `homedir()` to `process.cwd()`
- `src/lib/config.ts` — change default `workspaceRoot` from `os.homedir()` to a startup-provided launch cwd (requires new `launchCwd` option in `LoadConfigOptions`)
- `src/server/start-dev.mts` — pass `cwd`/`process.cwd()` into `loadConfig()` so the resolved `workspaceRoot` inherits the launch directory as its ultimate default

**Documentation:**
- `project/architecture/ADR/ADR-0006-config-file-driven-configuration.md` — amend default workspaceRoot from homedir to launch cwd; document new precedence in startup output
- `project/architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md` — supersede slug/tmux/worktree routing decisions for default endpoint; add 1008 rejection contract; update cwd precedence; update `UseTerminalOptions` interface; update `TerminalPanel` slug/worktree rules
- `project/architecture/ADR/DECISION-LOG.md` — supersede decisions #42, #43, #44, #45, #46, #65, #66, #85, #86, #87; add new decisions for 1008 rejection, simplified cwd precedence, no copilot side-effects for default terminal
- `LLM.txt` — update descriptions for `terminal-server.mts`, `use-terminal.ts`, `terminal-panel.tsx`, `workspace-layout.tsx`

**Tests requiring changes or deletion:**
- `src/components/workspace-layout.test.tsx` — assert TerminalPanel is rendered without `slug`/`worktree` props; assert Explorer/File Preview still receive project/worktree context
- `src/components/terminal-panel.test.tsx` — remove slug/worktree prop tests; assert no Copilot status update for default terminal; assert updated contextKey
- `src/hooks/use-terminal.test.ts` — remove slug/worktree URL tests; add 1008 no-reconnect test; add omission-of-slug/worktree assertion on reconnect/retry
- `src/server/terminal-server.test.ts` — remove slug-based CWD, tmux-probe, worktree tests from default path; add 1008 rejection tests; update default cwd to process.cwd() expectation
- `src/lib/config.test.ts` — add tests for launch-cwd default, explicit workspaceRoot override
- `src/server/start-dev.test.ts` — add test for cwd forwarded into loadConfig

### Existing Decision-Log Entries Being Superseded (for default endpoint)

| Decision # | Current text | Disposition |
|------------|-------------|-------------|
| 42 | Pass project slug as `slug` query parameter on WebSocket upgrade URL | Superseded for default terminal; slug param rejected |
| 43 | Resolve per-connection PTY CWD server-side via `resolveProjectPath(slug)` | Superseded for default terminal; cwd resolved from config/launch cwd only |
| 44 | Three-branch terminal spawn decision tree (tmux shared socket → system tmux → shell) | Superseded for default terminal; shell only |
| 45 | Sanitize tmux session names | Superseded for default terminal |
| 46 | Fall back to regular shell if tmux attach fails | Superseded for default terminal |
| 65 | When `.devcontainer/.tmux-shared` absent, attempt system tmux | Superseded for default terminal |
| 66 | Fall back to login shell in project directory if tmux cannot be spawned | Superseded for default terminal |
| 85 | Worktree terminals use shell-only mode with CWD at resolved worktree dir | Superseded for default terminal |
| 86 | Add `worktree=` as optional WebSocket query parameter | Superseded for default terminal; param rejected with 1008 |
| 87 | `extractWorktree()` to reject `..` paths | Superseded for default terminal (param rejected entirely) |
| 123 | Forward config to terminal-server through env vars | Remains, but adds launch-cwd forwarding |

### Copilot Status Coupling

`terminal-panel.tsx` currently calls `updateCopilotStatus(slug, copilotStatus)` only when `slug && isConnected`. Removing `slug` from `TerminalPanelProps` means this side effect will naturally no-op (slug will be undefined/absent). The `terminal-server.mts` already handles the null-slug path correctly: `copilotStatusKey(null)` returns `null`, and `addCopilotStatusSubscriber`/`broadcastCopilotStatus` are no-ops for a null key. No Copilot state broadcast occurs for default-terminal connections. The issue also explicitly says Copilot status side effects tied to project slugs should not run for the default host terminal.

---

## Proposed ADRs

**No new ADR is required.**

The issue explicitly states: _"This is a terminal core-component simplification plus an ADR-0006 amendment for default cwd precedence. No new ADR is expected."_

**ADR-0006 amendment required:** Document the new default `workspaceRoot` precedence (`explicit config/env → launch cwd → process.cwd()`) and the startup output source label for the terminal cwd.

---

## Proposed Core-Components

**No new core-component is required.**

**CORE-COMPONENT-0003 amendment required** to document:
- Default terminal endpoint rejects `slug`/`worktree` params with close code `1008` and error frame after auth, before PTY spawn
- `UseTerminalOptions` no longer exposes `slug` or `worktree` for the default terminal
- `TerminalPanel` props no longer include `slug` or `worktree`
- Default terminal cwd precedence: `TerminalServerOptions.cwd` → `DEVDECK_WORKSPACE_ROOT`/`workspaceRoot` → `process.cwd()`
- Close code `1008` treated as unsupported-context by `useTerminal`: set failed/error state, no reconnect loop
- Copilot status detection remains in terminal-server but side effects (sidebar updates) do not run for default host terminal connections
- Supersede/replace decisions #42–46, #65–66, #85–87 for the default terminal endpoint

**CORE-COMPONENT-0009** (harness) is not impacted.

---

## Risks and Open Questions

### Risks

1. **Breaking change for existing `workspaceRoot` default users.** Changing the config default from `os.homedir()` to `process.cwd()` is a documented breaking change for users who rely on the current homedir default. Explicit `DEVDECK_WORKSPACE_ROOT` or config-file `workspaceRoot` users are not affected. The change must be clearly communicated in startup output and ADR-0006 amendment, with a migration note.

2. **`loadConfig` API surface change.** Adding `launchCwd` to `LoadConfigOptions` is a backward-compatible extension (it is optional), but existing callers that do not pass it will now get `process.cwd()` of the caller instead of `homedir()`. In tests this may cause unexpected cwd values unless tests also set an explicit `workspaceRoot`. All existing config tests will need review.

3. **Stale reconnect loop risk.** The `useTerminal` hook currently reconnects on unexpected close codes (anything except 4401 and intentional close). Adding a `1008` no-reconnect path mirrors the 4401 pattern and needs careful placement in the `ws.onclose` handler to avoid accidentally treating other legitimate disconnects as unsupported-context.

4. **CORE-COMPONENT-0003 decision count / cross-reference integrity.** CORE-COMPONENT-0003 has 100+ referenced decisions. Superseding ~10 of them without introducing inconsistencies requires careful ordering and date entries in DECISION-LOG.md.

5. **Voice input contextKey.** Currently `\`${slug ?? "default"}\u0000${worktree ?? "root"}\u0000...\`` — after removing slug/worktree from TerminalPanel, this key must change to something that still cleanly resets voice state on connection lifecycle changes (e.g., just the connection state segment).

6. **Copilot sidebar badge persistence.** Decision #164 says to preserve sidebar badges across disconnects. With the default terminal having no slug, `updateCopilotStatus` is never called, so sidebar badges are unaffected for project-scoped contexts. No regression expected, but worth confirming in tests.

7. **`buildWsUrl` signature change.** Current callers of `useTerminal({ wsUrl: '...' })` (e.g., tests) pass an explicit URL. Removing `slug`/`worktree` from the public API must not break test utilities that directly call `buildWsUrl` if it remains exported. If `buildWsUrl` is kept as an internal utility only, this is low risk.

8. **E2E test coverage.** The issue requires a Playwright test to verify `pwd` in the terminal returns launch cwd when a different project is selected. The harness has no `playwright` verb — raw `npx playwright test` is required. This is a known harness gap (friction item).

### Open Questions

1. **`launchCwd` parameter name in `LoadConfigOptions`.** Should it be `launchCwd`, `defaultWorkspaceRoot`, or simply rely on `process.cwd()` being captured in `startDev`? The issue says "Update `loadConfig` so the default `workspaceRoot` can be resolved from a startup-provided launch cwd". The cleanest implementation passes `launchCwd?: string` in `LoadConfigOptions` and uses it as the ultimate default before `os.homedir()`. Planner decision.

2. **Should `terminal-server.mts` also change its cwd fallback?** Currently `createTerminalServer()` line 625: `options?.cwd ?? DEVDECK_WORKSPACE_ROOT ?? homedir()`. If `DEVDECK_WORKSPACE_ROOT` is forwarded by `start-dev` (it already is, via `buildChildEnv`), and `start-dev` now passes `process.cwd()` as the default workspaceRoot into config, the env var will carry the correct cwd. The `terminal-server.mts` fallback `homedir()` then only activates for standalone direct invocations. The issue says standalone `terminal-server.mts` should use `process.cwd()` as final fallback — so `homedir()` should be replaced with `process.cwd()` in `createTerminalServer`.

3. **Copilot PTY output pattern matching.** The issue says "Per-connection PTY output detection may remain only if it does not update project-sidebar state or require a project key; otherwise reset to idle/no-op for the default terminal." Since the existing code already no-ops for null `statusKey`, and `updateCopilotStatus` in the React side is only called when `slug` is truthy, no server-side change is needed for Copilot detection. But the planner should confirm this interpretation.

4. **`1008` rejection must not echo supplied slug/worktree values.** The issue is explicit that the error frame must be `{ "type": "error", "message": "Project-scoped terminals are not supported by the default terminal." }` and must not reflect back slug/worktree values. The implementation must ensure the rejection handler only sends the fixed error string.

5. **`TerminalMode` type.** Currently `"unknown" | "tmux" | "shell"`. After this change, the default terminal always sends `{ type: "setup", mode: "shell" }`. The `"tmux"` mode value becomes unreachable for the default terminal. The type can stay for forward-compatibility, but the planner should note that CORE-COMPONENT-0003 references to `mode: "tmux"` in the setup frame should be marked as applicable only to future explicit terminal contexts.

---

## Harness Friction Answer

**What did the agent have to infer that the harness should have proved?**

1. **Which DECISION-LOG.md entries are superseded by this issue.** The harness has no verb to cross-reference decision entries against a given issue description. The agent manually read all 250+ decision rows to identify which ones (#42, #43, #44, #45, #46, #65, #66, #85, #86, #87) govern the default terminal's slug/tmux/worktree routing and therefore must be superseded. A harness command like `./harness orient --decisions` that extracts and maps decision source documents would have proved this.

2. **That `terminal-server.mts` cwd fallback uses `homedir()` not `process.cwd()`.** The issue body says the default cwd should be `process.cwd()` but the current code uses `homedir()` as its final fallback. The agent had to read both ADR-0006 (documents `workspaceRoot` default as `os.homedir()`) and the actual source to confirm alignment. A harness `orient` command that extracted the cwd precedence chain from the server source would have proved this without a raw file read.

3. **That `TerminalPanelProps` already has `slug?` and `worktree?` as optional (not required) fields.** This matters for the scope of the breaking change — removing optional props is gentler than required ones. The agent had to infer this from source inspection; no harness command surfaces prop signatures.
