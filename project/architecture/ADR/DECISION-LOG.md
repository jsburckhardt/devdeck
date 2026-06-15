# Decision Log

This file is the single registry of all architectural decisions and core-components in the project. Every new or modified ADR or core-component **must** be recorded here.

## ADRs

| ID | Title | Status | Date |
|----|-------|--------|------|
| ADR-0002 | Next.js + xterm.js + node-pty Tech Stack | Accepted | 2026-05-06 |
| ADR-0003 | Project Registry & Persistence Strategy | Accepted | 2025-07-15 |
| ADR-0004 | Token-Based Authentication | Accepted (amended) | 2026-05-24 |
| ADR-0005 | Copilot CLI Status Detection Strategy | Accepted (amended) | 2026-06-11 |
| ADR-0006 | Config File-Driven Configuration System | Accepted | 2026-05-24 |
| ADR-0007 | Filesystem Sync Transport Strategy - Server-Push SSE with Polling Fallback | Accepted | 2026-06-15 |

## Core-Components

| ID | Title | Status | Date |
|----|-------|--------|------|
| CORE-COMPONENT-0002 | Commit Standards | Adopted | 2026-05-05 |
| CORE-COMPONENT-0003 | WebSocket Terminal Communication | Adopted (updated) | 2026-06-11 |
| CORE-COMPONENT-0004 | Theming | Adopted (updated) | 2026-05-21 |
| CORE-COMPONENT-0005 | Error Handling | Adopted (updated) | 2026-06-15 |
| CORE-COMPONENT-0006 | Development Standards (Node/TypeScript) | Adopted | 2026-05-06 |
| CORE-COMPONENT-0007 | Shell Layout | Adopted (updated) | 2026-06-11 |
| CORE-COMPONENT-0008 | Multi-Project Tabs and Workspace State | Adopted (updated) | 2026-06-15 |
| CORE-COMPONENT-0009 | Engineering Harness | Adopted (updated) | 2026-06-11 |

## Decisions

Short, actionable statements derived from ADRs and core-components. More than one decision can originate from a single source.

| # | Decision | Source | Date |
|---|----------|--------|------|
| 1 | Enforce Conventional Commits v1.0.0 on every commit message | CORE-COMPONENT-0002 | 2026-05-05 |
| 2 | Require Conventional Commits format on PR titles | CORE-COMPONENT-0002 | 2026-05-05 |
| 3 | Require Co-authored-by trailer on all AI-authored commits | CORE-COMPONENT-0002 | 2026-05-05 |
| 4 | Use Next.js App Router as the fullstack framework | ADR-0002 | 2026-05-06 |
| 5 | Use TypeScript strict mode across the entire codebase | ADR-0002 | 2026-05-06 |
| 6 | Use xterm.js for browser terminal emulation and node-pty for backend PTY | ADR-0002 | 2026-05-06 |
| 7 | Use WebSocket (ws) for terminal I/O communication | ADR-0002 | 2026-05-06 |
| 8 | Use Tailwind CSS v4 + shadcn/ui for styling and components | ADR-0002 | 2026-05-06 |
| 9 | Use vitest as the test runner with @testing-library/react | ADR-0002 | 2026-05-06 |
| 10 | Use justfile as the task runner for development workflows | ADR-0002 | 2026-05-06 |
| 11 | Terminal sessions must be backed by real PTY processes via node-pty | CORE-COMPONENT-0003 | 2026-05-06 |
| 12 | WebSocket endpoint at /api/terminal for terminal communication | CORE-COMPONENT-0003 | 2026-05-06 |
| 13 | PTY processes must be cleaned up when WebSocket connection closes | CORE-COMPONENT-0003 | 2026-05-06 |
| 14 | All colors must use CSS custom properties with oklch color space | CORE-COMPONENT-0004 | 2026-05-06 |
| 15 | Theme preference must persist in localStorage, default to dark | CORE-COMPONENT-0004 | 2026-05-06 |
| 16 | WebSocket disconnections trigger automatic reconnection (max 3 retries, exponential backoff) | CORE-COMPONENT-0005 | 2026-05-06 |
| 17 | React error boundaries wrap each major panel independently | CORE-COMPONENT-0005 | 2026-05-06 |
| 18 | Use ESLint + Prettier for code quality; 80% test coverage target | CORE-COMPONENT-0006 | 2026-05-06 |
| 19 | Co-locate test files next to source using *.test.ts(x) naming | CORE-COMPONENT-0006 | 2026-05-06 |
| 20 | Use react-resizable-panels for the IDE shell panel layout | CORE-COMPONENT-0007 | 2026-05-07 |
| 21 | Wrap each shell panel in its own ErrorBoundary component | CORE-COMPONENT-0007 | 2026-05-07 |
| 22 | Require shell layout to fill 100vh with no outer scroll | CORE-COMPONENT-0007 | 2026-05-07 |
| 23 | Use `src/server/terminal-server.mts` as the WebSocket server file path | CORE-COMPONENT-0003 | 2026-05-06 |
| 24 | Require server to send PTY output as binary WebSocket frames via `Buffer.from(data, 'utf8')` | CORE-COMPONENT-0003 | 2026-05-06 |
| 25 | Require frontend to set `ws.binaryType = "arraybuffer"` for binary terminal I/O | CORE-COMPONENT-0003 | 2026-05-06 |
| 26 | Use a JSON file (`registry.json`) for project registry persistence | ADR-0003 | 2025-07-15 |
| 27 | Store registry at `$DEVDECK_DATA_DIR/registry.json`, default `~/.config/devdeck/` | ADR-0003 | 2025-07-15 |
| 28 | Use write-to-temp + `fs.rename` for atomic registry writes | ADR-0003 | 2025-07-15 |
| 29 | Move `resolveProjectPath` to `src/lib/registry.ts` as an async function | ADR-0003 | 2025-07-15 |
| 30 | Merge auto-discovered and registry projects in `GET /api/projects`, hiding entries with `hidden: true` | ADR-0003 | 2025-07-15 |
| 31 | Reject manual project adds with duplicate slugs via `409 Conflict` | ADR-0003 | 2025-07-15 |
| 32 | Prohibit slug changes after project creation | ADR-0003 | 2025-07-15 |
| 33 | Use single-tenant bearer token (`DEVDECK_TOKEN` or auto-generated UUID) for authentication | ADR-0004 | 2025-07-16 |
| 34 | Validate token on WebSocket upgrade before spawning PTY process | ADR-0004 | 2025-07-16 |
| 35 | Use `crypto.timingSafeEqual` for all token comparisons | ADR-0004 | 2025-07-16 |
| 36 | Reject unauthenticated WebSocket connections with close code 4401 | ADR-0004 | 2025-07-16 |
| 37 | Protect HTTP routes via Next.js middleware with cookie-based session after initial token URL | ADR-0004 | 2025-07-16 |
| 38 | Require `token` query parameter on WebSocket upgrade requests | CORE-COMPONENT-0003 | 2025-07-16 |
| 39 | Prohibit PTY spawn before token validation succeeds | CORE-COMPONENT-0003 | 2025-07-16 |
| 40 | Prohibit reconnection attempts on WebSocket close code 4401 | CORE-COMPONENT-0005 | 2025-07-16 |
| 41 | Return 401 with `AUTH_REQUIRED` code for unauthenticated HTTP requests | CORE-COMPONENT-0005 | 2025-07-16 |
| 42 | Pass project slug as `slug` query parameter on WebSocket upgrade URL | CORE-COMPONENT-0003 | 2025-07-17 |
| 43 | Resolve per-connection PTY CWD server-side via `resolveProjectPath(slug)`; never expose path to client | CORE-COMPONENT-0003 | 2025-07-17 |
| 44 | Use a three-branch terminal spawn decision tree: shared-socket tmux, system-default tmux, then login shell fallback | CORE-COMPONENT-0003 | 2026-05-13 |
| 45 | Sanitize tmux session names using `[^a-zA-Z0-9_-]` replacement before passing to tmux CLI | CORE-COMPONENT-0003 | 2025-07-17 |
| 46 | Fall back to regular shell if tmux attach fails or tmux is not installed | CORE-COMPONENT-0003 | 2025-07-17 |
| 47 | Render project sidebar as a fixed-width flex sibling outside the resizable panel Group | CORE-COMPONENT-0007 | 2025-07-18 |
| 48 | Mount OpenProjectsProvider at root layout level to survive all client-side navigations | CORE-COMPONENT-0008 | 2025-07-18 |
| 49 | Persist only the open project slug array to localStorage under key `devdeck-open-projects` | CORE-COMPONENT-0008 | 2025-07-18 |
| 50 | Cache per-project workspace UI state in an in-memory Map keyed by slug | CORE-COMPONENT-0008 | 2025-07-18 |
| 51 | Require WorkspaceProvider to save state on unmount and restore on mount via OpenProjectsProvider | CORE-COMPONENT-0008 | 2025-07-18 |
| 52 | Prune stale slugs from localStorage by cross-referencing with /api/projects on cold start | CORE-COMPONENT-0008 | 2025-07-18 |
| 53 | Use native title attribute for sidebar tooltips — prohibit adding @radix-ui/react-tooltip | CORE-COMPONENT-0008 | 2025-07-18 |
| 54 | Pass initial terminal dimensions as cols/rows query params on WebSocket upgrade URL | CORE-COMPONENT-0003 | 2025-07-18 |
| 55 | Require ClipboardAddon for OSC 52 clipboard support in the terminal | CORE-COMPONENT-0003 | 2025-07-18 |
| 56 | Require screenReaderMode: true in Terminal constructor for accessibility input | CORE-COMPONENT-0003 | 2025-07-18 |
| 57 | Require third-party rendering libraries to consume useTheme() and map app theme to their native theme tokens | CORE-COMPONENT-0004 | 2025-07-17 |
| 58 | Map app theme dark to mermaid theme 'dark' and light to mermaid theme 'default' | CORE-COMPONENT-0004 | 2025-07-17 |
| 59 | Expose `refreshFileTree()` and `fileTreeRefreshing` on WorkspaceContext for in-portal save → tree refresh wiring; use `cache: 'no-store'` | CORE-COMPONENT-0008 | 2026-05-12 |
| 60 | Require `refreshFileTree` to no-op when no active project and to never mutate `fileTreeLoading` (silent refresh) | CORE-COMPONENT-0008 | 2026-05-12 |
| 61 | Require `FileViewer` to call `refreshFileTree()` after a successful save only; prohibit calling it on failure paths | CORE-COMPONENT-0008 | 2026-05-12 |
| 62 | Prohibit `ExplorerContent` (and future tree consumers) from reading `fileTreeRefreshing` to gate spinners | CORE-COMPONENT-0008 | 2026-05-12 |
| 63 | Allow `refreshFileTree(explicitSlug?)` to accept an explicit slug so initial-load callers can fetch deterministically without waiting for context `project` propagation | CORE-COMPONENT-0008 | 2026-05-12 |
| 64 | Track concurrent `refreshFileTree` calls via an in-flight counter; only clear `fileTreeRefreshing` when the LAST in-flight call completes | CORE-COMPONENT-0008 | 2026-05-12 |
| 65 | When `.devcontainer/.tmux-shared` is absent, attempt `tmux new-session -A -s <sanitizedSlug>` on the system default socket before falling back to a login shell | CORE-COMPONENT-0003 | 2026-05-13 |
| 66 | If tmux cannot be spawned or exits non-zero for a project terminal, fall back to a login shell in the resolved project directory | CORE-COMPONENT-0003 | 2026-05-13 |
| 67 | Map app theme `dark` to Excalidraw theme `'dark'` and `light` to `'light'` | CORE-COMPONENT-0004 | 2026-05-13 |
| 68 | Require root file-tree requests to return direct root entries only | CORE-COMPONENT-0008 | 2026-05-13 |
| 69 | Load directory children lazily via path-scoped GET /api/files requests | CORE-COMPONENT-0008 | 2026-05-13 |
| 70 | Deduplicate file-tree fetches by slug/path and ignore stale project responses | CORE-COMPONENT-0008 | 2026-05-13 |
| 71 | Surface directory loading, error, retry, and empty states per directory | CORE-COMPONENT-0008 | 2026-05-13 |
| 72 | Preserve all-files visibility; prohibit performance hide-lists in file tree (Superseded by #73) | CORE-COMPONENT-0008 | 2026-05-13 |
| 73 | Apply a server-side default exclusion list (`.git`) to filter noise directories from file-tree API responses | CORE-COMPONENT-0008 | 2026-05-21 |
| 74 | Allow terminal color themes to be user-selectable from a predefined palette of 13 named themes | CORE-COMPONENT-0004 | 2026-05-21 |
| 75 | Persist terminal theme under `devdeck-terminal-theme` localStorage key, defaulting to `catppuccin` | CORE-COMPONENT-0004 | 2026-05-21 |
| 76 | Apply terminal theme changes via `terminal.options.theme` at runtime without reconnect | CORE-COMPONENT-0004 | 2026-05-21 |
| 77 | Require terminal theme to be independent of the app dark/light theme toggle | CORE-COMPONENT-0004 | 2026-05-21 |
| 78 | Exempt terminal (xterm.js) from Decision #57 — terminal themes are user-controlled, not mapped from app theme | CORE-COMPONENT-0004 | 2026-05-21 |
| 79 | Send `{ type: "setup", mode }` JSON text frame from server to client after PTY spawn | CORE-COMPONENT-0003 | 2026-05-22 |
| 80 | Send `{ type: "setup", mode: "shell", fallback: true }` when tmux attach fails before wiring fallback PTY | CORE-COMPONENT-0003 | 2026-05-22 |
| 81 | Require client to call `term.clear()` on fallback setup message to erase tmux error output | CORE-COMPONENT-0003 | 2026-05-22 |
| 82 | Reset `terminalMode` to `"unknown"` and `isFallback` to `false` at start of each `connect()` attempt | CORE-COMPONENT-0003 | 2026-05-22 |
| 83 | Surface root file-tree load errors via `fileTreeError` state and render error+retry UI in `ExplorerContent` when tree is empty | CORE-COMPONENT-0008 | 2026-05-22 |
| 84 | Togglable panels that own persistent resources MUST remain mounted; use `collapsible`/`collapsedSize` with imperative `collapse()`/`expand()` instead of conditional rendering | CORE-COMPONENT-0007 | 2026-05-23 |
| 85 | Require worktree terminals to use shell-only mode, bypassing the tmux decision tree, with CWD set to the resolved worktree directory | CORE-COMPONENT-0003 | 2026-05-23 |
| 86 | Add `worktree=<relative-path>` as an optional WebSocket query parameter on `/api/terminal`; server resolves it relative to the project root server-side | CORE-COMPONENT-0003 | 2026-05-23 |
| 87 | Require `extractWorktree()` to reject paths containing `..` segments or resolving outside the project root; fall back to project root shell on rejection | CORE-COMPONENT-0003 | 2026-05-23 |
| 88 | Require sidebar width of ~176 px with project names displayed as visible truncated text labels alongside the language-color badge | CORE-COMPONENT-0007 | 2026-05-23 |
| 89 | Supersede Decision #47: sidebar tabs show a project badge (language-color initial, or active Copilot-style bot replacement) plus full project name text label, not initial letter only | CORE-COMPONENT-0007 | 2026-05-23 |
| 90 | Expose `activeWorktree: string \| null` and `setActiveWorktree` on WorkspaceContext for worktree terminal scoping | CORE-COMPONENT-0008 | 2026-05-23 |
| 91 | Expose `worktreesSectionCollapsed: boolean` and `toggleWorktreesSection()` on WorkspaceContext | CORE-COMPONENT-0008 | 2026-05-23 |
| 92 | Include `activeWorktree` and `worktreesSectionCollapsed` in `PerProjectWorkspaceState` for per-project cache persistence | CORE-COMPONENT-0008 | 2026-05-23 |
| 93 | Fetch worktree data via `GET /api/worktrees?slug=<slug>` returning `Worktree[]`; return empty array (not HTTP error) when `.trees/` is absent or git is unavailable | CORE-COMPONENT-0008 | 2026-05-23 |
| 94 | Render `WorktreeTree` above `FileTree` inside `ExplorerContent`, always mounted per Decision #84, hidden via CSS when the worktree list is empty (Superseded by #114) | CORE-COMPONENT-0008 | 2026-05-23 |
| 95 | Use PTY output pattern matching for Copilot CLI state detection, rejecting process inspection | ADR-0005 | 2025-07-28 |
| 96 | Extend WebSocket JSON text frame protocol with `{ type: "status", copilotState }` for Copilot CLI status | ADR-0005 | 2025-07-28 |
| 97 | Define CopilotCliState as `"idle" \| "running" \| "waiting"` with conservative idle fallback | ADR-0005 | 2025-07-28 |
| 98 | Revert copilotState to `"idle"` after 30-second idle timeout with no matching PTY output | ADR-0005 | 2025-07-28 |
| 99 | Require `detectCopilotState()` to strip ANSI codes before pattern matching in terminal-server.mts | CORE-COMPONENT-0003 | 2025-07-28 |
| 100 | Require `useTerminal` hook to expose `copilotStatus: CopilotCliState` and reset to `"idle"` on connect | CORE-COMPONENT-0003 | 2025-07-28 |
| 101 | Expose `updateCopilotStatus()` and `getCopilotStatus()` on OpenProjectsContextValue | CORE-COMPONENT-0008 | 2025-07-28 |
| 102 | Render sidebar Copilot status indicator only when status is not `"idle"` and terminal is connected (Superseded by #164) | CORE-COMPONENT-0008 | 2025-07-28 |
| 103 | Require sidebar status indicator to use aria-label and title for non-color semantics | CORE-COMPONENT-0008 | 2025-07-28 |
| 104 | Require file-tree requests to key by slug, activeWorktree, and path | CORE-COMPONENT-0008 | 2026-05-24 |
| 105 | Preserve root and worktree file-tree state separately within each project | CORE-COMPONENT-0008 | 2026-05-24 |
| 106 | Guard file-tree responses against stale slug and activeWorktree contexts | CORE-COMPONENT-0008 | 2026-05-24 |
| 107 | Accept optional worktree parameters on HTTP file APIs | CORE-COMPONENT-0008 | 2026-05-24 |
| 108 | Resolve HTTP worktree roots with fs.realpath symlink-escape protection | CORE-COMPONENT-0008 | 2026-05-24 |
| 109 | Return worktree FileNode paths relative to the active worktree root | CORE-COMPONENT-0008 | 2026-05-24 |
| 110 | Pass activeWorktree on FileViewer content, save, and diff requests | CORE-COMPONENT-0008 | 2026-05-24 |
| 111 | Render WorktreeTree as filesystem-style selector nodes, not nested file trees | CORE-COMPONENT-0008 | 2026-05-24 |
| 112 | Render `.trees` directory nodes with the Tree icon in FileTree | CORE-COMPONENT-0008 | 2026-05-24 |
| 113 | Reset missing restored activeWorktree values to project root with a non-fatal notice | CORE-COMPONENT-0008 | 2026-05-24 |
| 114 | Supersede Decision #94: render WorktreeTree in the active project sidebar panel, not inside ExplorerContent | CORE-COMPONENT-0008 | 2026-05-24 |
| 115 | Load optional runtime configuration from `$DEVDECK_DATA_DIR/config.json` | ADR-0006 | 2026-05-24 |
| 116 | Resolve configuration with environment variables overriding config-file values and config-file values overriding defaults | ADR-0006 | 2026-05-24 |
| 117 | Keep `DEVDECK_DATA_DIR` env-only; warn and ignore `dataDir` when present in `config.json` | ADR-0006 | 2026-05-24 |
| 118 | Persist generated auth tokens to `config.json` with POSIX `0600` permissions when neither env nor config provides a token | ADR-0006 | 2026-05-24 |
| 119 | Mask env/config auth tokens in startup output as `[redacted:<source>]`; generated first-run tokens may be printed in full | ADR-0006 | 2026-05-24 |
| 120 | Seed object-based `initialProjects` additively and idempotently using manual project duplicate rules | ADR-0006 | 2026-05-24 |
| 121 | Support leading `~` expansion for configured initial project entry paths before validation | ADR-0006 | 2026-05-24 |
| 122 | Amend ADR-0004 token generation so generated tokens persist to config and non-generated tokens are masked in startup output | ADR-0004 | 2026-05-24 |
| 123 | Forward resolved config to `src/server/terminal-server.mts` through env vars; prohibit importing the config loader into the standalone `.mts` server | CORE-COMPONENT-0003 | 2026-05-24 |
| 124 | Persist trimmed `initialProjects` name and description on new manual registry entries | ADR-0006 | 2026-05-24 |
| 125 | Use the resolved `projectsDir` for `initialProjects` auto-discovery collision checks during startup seeding | ADR-0006 | 2026-05-24 |
| 126 | Persist sidebar collapse state to `localStorage` under `devdeck-sidebar-collapsed` | CORE-COMPONENT-0007 | 2026-05-30 |
| 127 | Use `w-44` expanded sidebar width and `w-12` collapsed sidebar width | CORE-COMPONENT-0007 | 2026-05-30 |
| 128 | Require sidebar collapse toggle to use `SidebarSimple` with accessible attributes | CORE-COMPONENT-0007 | 2026-05-30 |
| 129 | Render collapsed sidebar tabs as icon-only language-color badges | CORE-COMPONENT-0007 | 2026-05-30 |
| 130 | Keep collapsed sidebar close buttons always visible | CORE-COMPONENT-0008 | 2026-05-30 |
| 131 | Keep active `WorktreeTree` mounted and CSS-hidden when sidebar collapses | CORE-COMPONENT-0008 | 2026-05-30 |
| 132 | Keep Copilot status indicators visible on badges in both sidebar modes | CORE-COMPONENT-0008 | 2026-05-30 |
| 133 | Prohibit storing sidebar collapse state in per-project workspace state | CORE-COMPONENT-0008 | 2026-05-30 |
| 134 | Prohibit sidebar collapse keyboard shortcuts in v1 | CORE-COMPONENT-0007 | 2026-05-30 |
| 135 | Render Explorer toggle before File Preview and Terminal toggles | CORE-COMPONENT-0007 | 2026-05-30 |
| 136 | Keep Explorer mounted when hidden using collapsible zero-size panel behavior | CORE-COMPONENT-0007 | 2026-05-30 |
| 137 | Show panel separators only between adjacent expanded panels | CORE-COMPONENT-0007 | 2026-05-30 |
| 138 | Prevent hiding the last visible workspace panel | CORE-COMPONENT-0007 | 2026-05-30 |
| 139 | Require PanelToggle aria-label and aria-pressed states | CORE-COMPONENT-0007 | 2026-05-30 |
| 140 | Expose showExplorer and toggleExplorer on WorkspaceContext | CORE-COMPONENT-0008 | 2026-05-30 |
| 141 | Persist optional showExplorer in per-project workspace state | CORE-COMPONENT-0008 | 2026-05-30 |
| 142 | Default missing persisted showExplorer values to true | CORE-COMPONENT-0008 | 2026-05-30 |
| 143 | Include showExplorer in workspace state save and restore caching | CORE-COMPONENT-0008 | 2026-05-30 |
| 144 | Resize the remaining visible shell panel to 100% when visibility, project, or worktree changes leave exactly one expanded workspace panel | CORE-COMPONENT-0007 | 2026-05-30 |
| 145 | Restore invalid all-hidden cached workspace visibility as Terminal visible before first render | CORE-COMPONENT-0008 | 2026-05-30 |
| 146 | Require `./harness` as the preferred operating surface for humans and agents | CORE-COMPONENT-0009 | 2026-06-07 |
| 147 | Require `./harness verify` as the primary verification mechanism in Implement and Verify pipeline stages | CORE-COMPONENT-0009 | 2026-06-07 |
| 148 | Allow direct project commands only when the harness lacks a verb, reports degraded, or diagnostic depth requires raw output | CORE-COMPONENT-0009 | 2026-06-07 |
| 149 | Record harness bypass reasons as friction via `./harness friction add` | CORE-COMPONENT-0009 | 2026-06-07 |
| 150 | Require every harness command to return exactly one verdict: pass (0), fail (1), degraded (2), or unknown (3) | CORE-COMPONENT-0009 | 2026-06-07 |
| 151 | Prohibit secrets, tokens, and raw logs in `.harness/evidence/` files | CORE-COMPONENT-0009 | 2026-06-07 |
| 152 | Require harness to wrap existing project commands; prohibit inventing a new build system | CORE-COMPONENT-0009 | 2026-06-07 |
| 153 | Fall back to `verification.yml` or auto-detection when the harness is absent | CORE-COMPONENT-0009 | 2026-06-07 |
| 154 | Expose `useTerminal.sendInput(data)` for raw terminal helper input | CORE-COMPONENT-0003 | 2026-06-06 |
| 155 | Route helper input through authenticated binary WebSocket frames | CORE-COMPONENT-0003 | 2026-06-06 |
| 156 | Require helper input to no-op when no active WebSocket is open | CORE-COMPONENT-0003 | 2026-06-06 |
| 157 | Expose `useTerminal.focusTerminal()` for terminal-helper focus restoration | CORE-COMPONENT-0003 | 2026-06-06 |
| 158 | Preserve h-6 w-6 project badge sizing for active Copilot-style bot icons | CORE-COMPONENT-0007 | 2026-06-09 |
| 159 | Replace project badge initials with Copilot-style bot icons for running or waiting Copilot | CORE-COMPONENT-0008 | 2026-06-09 |
| 160 | Suppress overlay Copilot dots when active Copilot bot badges render | CORE-COMPONENT-0008 | 2026-06-09 |
| 161 | Expose active Copilot bot state with sr-only role=status text | CORE-COMPONENT-0008 | 2026-06-09 |
| 162 | Cache last-known Copilot CLI state per project and replay it to newly connected same-project terminal clients | ADR-0005 | 2026-06-11 |
| 163 | Broadcast Copilot CLI status changes to every connected terminal WebSocket client for the same project slug | CORE-COMPONENT-0003 | 2026-06-11 |
| 164 | Preserve sidebar active Copilot badges across browser terminal disconnects; clear them only on explicit idle, unrecognized status, or project closure | CORE-COMPONENT-0008 | 2026-06-11 |
| 165 | Supersede Decision #153: use `./harness verify` and `.harness/contract.yml` as the verification source of truth; do not maintain `.github/soft-factory/verification.yml` | CORE-COMPONENT-0009 | 2026-06-11 |
| 166 | Require CI to run `./harness verify` instead of mirroring a separate verification config | CORE-COMPONENT-0009 | 2026-06-11 |
| 167 | Expose an always-visible current-project close action in WorkspaceLayout controls | CORE-COMPONENT-0007 | 2026-06-11 |
| 168 | Prohibit aria-pressed on WorkspaceLayout close actions | CORE-COMPONENT-0007 | 2026-06-11 |
| 169 | Route sidebar and workspace close actions through OpenProjectsProvider requestProjectClose | CORE-COMPONENT-0008 | 2026-06-11 |
| 170 | Require safe project-name aria-labels and titles on workspace close actions | CORE-COMPONENT-0008 | 2026-06-11 |
| 171 | Require provider-owned pending guards for duplicate project close requests | CORE-COMPONENT-0008 | 2026-06-11 |
| 172 | Require normalized slug handling and stale-active fallback navigation for project close requests | CORE-COMPONENT-0008 | 2026-06-11 |
| 173 | Require a non-interactive divider before WorkspaceLayout Close Project controls | CORE-COMPONENT-0007 | 2026-06-11 |
| 174 | Render WorkspaceLayout Close Project disabled, not hidden, when the normalized slug is empty | CORE-COMPONENT-0007 | 2026-06-11 |
| 175 | Dispatch voice transcripts through `sendInput(data)` without new WebSocket messages | CORE-COMPONENT-0003 | 2026-06-11 |
| 176 | Run SpeechRecognition one-shot with interim results disabled | CORE-COMPONENT-0003 | 2026-06-11 |
| 177 | Send final SpeechRecognition transcripts only; prohibit newline auto-append | CORE-COMPONENT-0003 | 2026-06-11 |
| 178 | Hide terminal microphone controls when SpeechRecognition is unavailable | CORE-COMPONENT-0003 | 2026-06-11 |
| 179 | Disable terminal microphone controls while terminal input is disconnected | CORE-COMPONENT-0003 | 2026-06-11 |
| 180 | Check `window.isSecureContext` before starting browser speech recognition | CORE-COMPONENT-0003 | 2026-06-11 |
| 181 | Isolate SpeechRecognition lifecycle in standalone `useVoiceInput` hook | CORE-COMPONENT-0003 | 2026-06-11 |
| 182 | Expose microphone listening state with label, title, and aria-pressed | CORE-COMPONENT-0003 | 2026-06-11 |
| 183 | Use browser-only SpeechRecognition without DevDeck audio transport or speech services | CORE-COMPONENT-0003 | 2026-06-11 |
| 184 | Expose full voice status states from `useVoiceInput` for terminal review UI | CORE-COMPONENT-0003 | 2026-06-11 |
| 185 | Treat missing Permissions API as unknown voice permission, not failure | CORE-COMPONENT-0003 | 2026-06-11 |
| 186 | Supersede Decision #176: display interim transcripts without sending them | CORE-COMPONENT-0003 | 2026-06-11 |
| 187 | Supersede Decision #177: require editable review before any voice terminal send | CORE-COMPONENT-0003 | 2026-06-11 |
| 188 | Send reviewed voice text exactly; append `\r` only via Send + Enter | CORE-COMPONENT-0003 | 2026-06-11 |
| 189 | Enforce non-empty and 500-character limits before sending reviewed voice text | CORE-COMPONENT-0003 | 2026-06-11 |
| 190 | Retain reviewed voice text when `sendInput` returns false and show retryable alert | CORE-COMPONENT-0003 | 2026-06-11 |
| 191 | Normalize Web Speech permission and recognition errors into actionable alert copy | CORE-COMPONENT-0003 | 2026-06-11 |
| 192 | Guard voice callbacks against stale terminal context before UI updates or sends | CORE-COMPONENT-0003 | 2026-06-11 |
| 193 | Clear voice state on cancel, Escape, disconnect, context change, and unmount | CORE-COMPONENT-0003 | 2026-06-11 |
| 194 | Restore xterm focus after successful send or cancel; keep review focus on failure | CORE-COMPONENT-0003 | 2026-06-11 |
| 195 | Disclose browser speech processing and shell-history implications beside voice review | CORE-COMPONENT-0003 | 2026-06-11 |
| 196 | Keep voice transcripts panel-local; prohibit OpenProjects or browser-storage persistence | CORE-COMPONENT-0003 | 2026-06-11 |
| 197 | Supersede Decision #178: render visible microphone entry point with accessible unsupported state | CORE-COMPONENT-0003 | 2026-06-11 |
| 198 | Use client-side polling for near-realtime file explorer synchronization (Superseded by #213) | CORE-COMPONENT-0008 | 2026-06-15 |
| 199 | Poll active root file-tree state every five seconds (Superseded by #214) | CORE-COMPONENT-0008 | 2026-06-15 |
| 200 | Limit polling to root file-tree refreshes; keep child directories lazy (Superseded by #215) | CORE-COMPONENT-0008 | 2026-06-15 |
| 201 | Pause polling while documents are hidden (Superseded by #216) | CORE-COMPONENT-0008 | 2026-06-15 |
| 202 | Refresh file-tree and worktree lists immediately when visible (Superseded by #217) | CORE-COMPONENT-0008 | 2026-06-15 |
| 203 | Reuse refreshFileTree no-store, deduplication, stale guards, and silent refresh (Superseded by #218) | CORE-COMPONENT-0008 | 2026-06-15 |
| 204 | Co-refresh active project worktree lists with no-store polling (Superseded by #219) | CORE-COMPONENT-0008 | 2026-06-15 |
| 205 | Clean up polling timers and visibility listeners on lifecycle changes (Superseded by #220) | CORE-COMPONENT-0008 | 2026-06-15 |
| 206 | Guard polling browser APIs for SSR and tests (Superseded by #221) | CORE-COMPONENT-0008 | 2026-06-15 |
| 207 | Use SSE `/api/files/events` for file-tree invalidation transport | ADR-0007 | 2026-06-15 |
| 208 | Refresh canonical file-tree state through existing `/api/files` responses | ADR-0007 | 2026-06-15 |
| 209 | Adopt chokidar for server-side filesystem watcher normalization | ADR-0007 | 2026-06-15 |
| 210 | Debounce file sync batches for 250 ms before broadcasting | ADR-0007 | 2026-06-15 |
| 211 | Limit file sync event batches to 256 relative path hints | ADR-0007 | 2026-06-15 |
| 212 | Require same-origin authenticated access for file sync event streams | ADR-0007 | 2026-06-15 |
| 213 | Supersede Decision #198: use SSE as primary file explorer synchronization | CORE-COMPONENT-0008 | 2026-06-15 |
| 214 | Supersede Decision #199: poll every five seconds only during degraded fallback | CORE-COMPONENT-0008 | 2026-06-15 |
| 215 | Supersede Decision #200: invalidate loaded directories from server-push events | CORE-COMPONENT-0008 | 2026-06-15 |
| 216 | Supersede Decision #201: pause degraded fallback polling while hidden | CORE-COMPONENT-0008 | 2026-06-15 |
| 217 | Supersede Decision #202: refresh immediately after ready, retry, or visible fallback | CORE-COMPONENT-0008 | 2026-06-15 |
| 218 | Supersede Decision #203: reuse `refreshFileTree` after every invalidation hint | CORE-COMPONENT-0008 | 2026-06-15 |
| 219 | Supersede Decision #204: poll worktree lists only as degraded fallback | CORE-COMPONENT-0008 | 2026-06-15 |
| 220 | Supersede Decision #205: clean up EventSource, timers, listeners, and watchers | CORE-COMPONENT-0008 | 2026-06-15 |
| 221 | Supersede Decision #206: guard EventSource and polling browser APIs | CORE-COMPONENT-0008 | 2026-06-15 |
| 222 | Require `file-tree:ready`, `file-tree:changed`, and `file-tree:degraded` events | CORE-COMPONENT-0008 | 2026-06-15 |
| 223 | Expose file-tree sync status and retry through WorkspaceContext | CORE-COMPONENT-0008 | 2026-06-15 |
| 224 | Ignore file-tree events for stale project or worktree scopes | CORE-COMPONENT-0008 | 2026-06-15 |
| 225 | Refresh loaded directories affected by file-tree invalidation events | CORE-COMPONENT-0008 | 2026-06-15 |
| 226 | Update collapsed directory `hasChildren` metadata after invalidation refreshes | CORE-COMPONENT-0008 | 2026-06-15 |
| 227 | Require accessible live status for file-tree sync states | CORE-COMPONENT-0005 | 2026-06-15 |
| 228 | Retry recoverable file sync failures before entering degraded polling | CORE-COMPONENT-0005 | 2026-06-15 |
| 229 | Prohibit automatic retry for auth, origin, and invalid-parameter sync failures | CORE-COMPONENT-0005 | 2026-06-15 |
| 230 | Expose manual retry for degraded file-tree sync connections | CORE-COMPONENT-0005 | 2026-06-15 |
| 231 | Preserve visible explorer state during sync failures and fallback polling | CORE-COMPONENT-0005 | 2026-06-15 |
| 232 | Preserve 5000 ms polling only as degraded fallback | ADR-0007 | 2026-06-15 |
| 233 | Clear selected files deleted by canonical sync refreshes | CORE-COMPONENT-0008 | 2026-06-15 |
