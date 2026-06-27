# Action Plan: feat(terminal): decouple default terminal from selected project

## Feature
- **ID:** 101
- **Research Brief:** project/issues/101/research/00-research.md

## ADRs Created
- None.
- **Amended:** [ADR-0006: Config File-Driven Configuration System](../../../architecture/ADR/ADR-0006-config-file-driven-configuration.md) to make `workspaceRoot` default to the DevDeck launch cwd (`launchCwd`, else `process.cwd()`) when no explicit env/config root is supplied and to require startup output for the resolved workspace root source.

## Core-Components Created
- None.
- **Amended:** [CORE-COMPONENT-0003: WebSocket Terminal Communication](../../../architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md) to define the default host-terminal contract: no implicit project/worktree/tmux routing, 1008 unsupported-context rejection for stale `slug`/`worktree` parameters, simplified cwd precedence, no default project-sidebar Copilot side effects, and no reconnect loop for 1008.

## Decision Log Updates
- [DECISION-LOG.md](../../../architecture/ADR/DECISION-LOG.md) was updated for the ADR/core-component amendments using 2026-06-27 decision dates.
- New decision records: #251-#262.

## Implementation Tasks
1. **Implement config/startup cwd precedence.** Add startup-provided launch cwd support to `loadConfig`, pass `startDev` cwd into config loading, display the resolved workspace root/source in startup output, and keep explicit env/config roots higher precedence. References: ADR-0006 decisions #251-#253; CORE-COMPONENT-0003 decision #258.
2. **Simplify the terminal server default endpoint.** Make `/api/terminal` spawn a host shell from the configured/default cwd only, reject `slug`/`worktree` after auth and before PTY spawn with the fixed 1008 unsupported-context error frame, and preserve auth, binary framing, dimensions, resize, cleanup, and standalone `process.cwd()` fallback. References: ADR-0004 decisions #33-#36; CORE-COMPONENT-0003 decisions #254-#258, #262.
3. **Decouple the React terminal from project/worktree state.** Remove `slug`/`worktree` from default `UseTerminalOptions`, `TerminalPanelProps`, and `WorkspaceLayout` terminal rendering; keep Explorer/File Preview and file-tree sync scoped to project/worktree; ensure close code 1008 is terminal-failed/no-reconnect; preserve theme, keyboard helper, voice review, accessibility, and mounted panel behavior. References: CORE-COMPONENT-0003 decisions #259 and #261; CORE-COMPONENT-0007 decision #84; CORE-COMPONENT-0008 decisions #90, #110.
4. **Remove default terminal Copilot sidebar coupling.** Ensure default host terminal connections do not call `OpenProjectsContext.updateCopilotStatus`, while existing server-side Copilot detection remains no-op without a project key and project-sidebar badges remain governed by project-scoped state. References: ADR-0005 decisions #95-#98; CORE-COMPONENT-0003 decision #260; CORE-COMPONENT-0008 decision #164.
5. **Update tests and user-facing documentation.** Update impacted Vitest suites, add/adjust Playwright coverage for launch-cwd terminal behavior while another project is selected, and update README/LLM descriptions for the new terminal/default cwd contract. Use `./harness test -- <targets>` for targeted Vitest runs and `./harness verify` before implementation handoff; use raw Playwright only because the harness has no Playwright verb.
