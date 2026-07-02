# Task Breakdown: Issue #103

## Task T1: Define safe workspace context identity and worktree status models

- **Status:** Planned
- **Complexity:** L
- **Dependencies:** None
- **Related ADRs:** ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0008

### Description
Add shared types and server utilities for `WorkspaceContextId`, `WorkspaceContextChoice`, `WorkspaceContextResponse`, repository status, disabled worktree states, and remote/label sanitization. Replace the current `{ name, branch }[]` worktree API shape with a response that includes the root choice, Git-reported linked worktrees, sanitized labels, safe status/error codes, and server-issued opaque IDs.

### Acceptance Criteria
- `GET /api/worktrees?slug=<slug>` returns a `WorkspaceContextResponse` with a `"root"` choice plus Git-reported linked worktrees.
- Worktree IDs are generated server-side as `wt_<hash>` from real project/worktree roots and are stable for the same Git-reported checkout path.
- External Git-reported worktrees outside `<projectRoot>/.trees/` are eligible.
- Locked, prunable, missing, duplicate, conflicting, non-Git, Git-unavailable, and repository-unavailable cases produce safe statuses instead of raw Git stderr.
- Labels, remote labels, errors, and status messages include no absolute paths, credentials, userinfo, query strings, fragments, or raw command output.
- Focused validation can run through `./harness test -- src/app/api/worktrees/route.test.ts src/lib/worktree-utils.test.ts`.

### Test Coverage
- Add/update `src/app/api/worktrees/route.test.ts` for external worktrees, detached branches, locked/prunable/missing states, duplicate labels, ID stability, and sanitized repository statuses.
- Add/update resolver/sanitizer unit tests near `src/lib/worktree-utils.test.ts` or a new adjacent utility test for ID generation, collision handling, and remote URL sanitization.

## Task T2: Migrate server file and sync APIs to `workspaceContext`

- **Status:** Planned
- **Complexity:** L
- **Dependencies:** T1
- **Related ADRs:** ADR-0003, ADR-0007
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0008

### Description
Replace `.trees`-relative `worktree` request handling in file listing, file content, save, diff, and file-tree sync with server-issued `workspaceContext` resolution. Preserve root behavior when the parameter is omitted or `"root"`, and block stale/disabled contexts instead of falling back.

### Acceptance Criteria
- `/api/files`, `/api/files/content`, `/api/files/diff`, and `/api/files/events` accept `workspaceContext=<id>` and no longer require client-constructed `.trees/<name>` values.
- The shared resolver validates every non-root context against the current Git worktree list and rejects stale, disabled, duplicate, traversal, absolute, or unknown values with structured safe errors.
- File listings and file content remain rooted to the selected context and return only context-relative `FileNode.path`/file paths.
- SSE scopes use the server-issued workspace context ID and ignore stale project/context events.
- Existing project-root behavior remains unchanged when `workspaceContext` is omitted.
- Focused validation can run through `./harness test -- src/app/api/files/route.test.ts src/app/api/files/content/route.test.ts src/app/api/files/diff/route.test.ts src/app/api/files/events/route.test.ts src/server/file-tree-sync.test.ts`.

### Test Coverage
- Update file API route tests for root, valid external worktree, stale worktree, disabled worktree, traversal, symlink escape, and no absolute path leaks.
- Update file-tree sync endpoint/server tests for scoped URL construction, watcher registry keys, stale scope rejection, degraded errors, and redacted events.

## Task T3: Migrate client workspace state and file surfaces to selected workspace context IDs

- **Status:** Planned
- **Complexity:** L
- **Dependencies:** T1, T2
- **Related ADRs:** ADR-0007
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0008

### Description
Rename and migrate client state from `activeWorktree` path strings to `activeWorkspaceContextId`, preserve per-context Explorer/FileViewer UI state, update request keys and stale guards, and block file/sync actions when the selected context is unavailable.

### Acceptance Criteria
- `WorkspaceContext` exposes `activeWorkspaceContextId`, `activeWorkspaceContextStatus`, and `setActiveWorkspaceContext`.
- Per-project UI state is cached separately by `project slug + WorkspaceContextId`, with `"root"` representing the project root.
- `refreshFileTree`, `loadDirectoryChildren`, `useFileTreeSync`, `useWorktrees`, and `FileViewer` send `workspaceContext` when the selected context is not `"root"`.
- Stale or unavailable restored contexts remain selected as blocked states and do not auto-reset to root.
- FileViewer content, save, diff, dirty-state confirmation, and stale response guards continue to work across context changes.
- Focused validation can run through `./harness test -- src/lib/workspace-context.test.tsx src/hooks/use-worktrees.test.ts src/hooks/use-file-tree-sync.test.ts src/components/file-viewer.test.tsx src/lib/file-tree-sync-integration.test.tsx`.

### Test Coverage
- Update workspace-context tests for context-keyed caching, stale response rejection, unavailable context blocking, fallback polling cleanup, and selected-file clearing.
- Update FileViewer tests for `workspaceContext` on GET/PUT/diff, blocked stale contexts, save refresh, and dirty edit context-switch confirmation.
- Update hook tests for no-store worktree fetches, degraded polling, stale slug/context guards, and cleanup.

## Task T4: Refactor sidebar selected-project detail layout and accessibility

- **Status:** Planned
- **Complexity:** M
- **Dependencies:** T1, T3
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description
Move root/worktree selection out of the active project navigation row into a distinct selected-project workspace detail region. Preserve open-project tab behavior, close buttons, Copilot badges, fixed widths, collapse persistence, and native title usage.

### Acceptance Criteria
- `ProjectSidebar` renders Home and open project navigation independently from the selected-detail region.
- Expanded mode shows selected project label, selected context label, root/worktree choices, repository/worktree status, refresh/retry controls, and safe disabled-state copy.
- Collapsed mode exposes a compact selected-context summary with `title`/`aria-label` and no hidden focusable selector controls.
- Available choices are keyboard-accessible with `aria-current`; disabled/unavailable choices are not focusable and expose their reason.
- Focus recovers safely when a focused worktree becomes unavailable after refresh.
- Polite live-region announcements fire for context changes and stale/unavailable status changes without duplicate chatter.
- Focused validation can run through `./harness test -- src/components/project-sidebar.test.tsx src/components/worktree-tree.test.tsx src/components/workspace-layout.test.tsx`.

### Test Coverage
- Update ProjectSidebar/selected-detail tests for separate region placement, expanded/collapsed widths, focus order, collapsed summary, no hidden focusable controls, close controls, Copilot badges, and native titles.
- Update WorktreeTree/selected-detail tests for root selection, server-issued IDs, duplicate labels, disabled states, `aria-current`, live status, refresh/retry, and stale blocked context.

## Task T5: Add explicit project-page terminal context while preserving default terminal behavior

- **Status:** Planned
- **Complexity:** L
- **Dependencies:** T1, T3
- **Related ADRs:** ADR-0002, ADR-0004, ADR-0006
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005, CORE-COMPONENT-0008

### Description
Introduce the explicit `/api/terminal/project` WebSocket route, project terminal hook/panel surface, and project-page terminal restart behavior. Keep `/api/terminal` host-rooted and rejecting project/worktree/workspace context query parameters.

### Acceptance Criteria
- `/api/terminal` remains host-rooted and rejects `slug`, `worktree`, or `workspaceContext` after auth with close code 1008 and safe fixed copy.
- `/api/terminal/project?slug=<slug>&workspaceContext=<id>` validates auth first, resolves the selected context server-side, and spawns shell-only PTYs with per-PTY `cwd`.
- Scoped terminal invalid/stale contexts send a structured safe error frame and close without spawning or falling back.
- Project-page terminal restarts on selected context changes and displays the sanitized context label/status.
- Default `TerminalPanel` and default `useTerminal` still expose no slug/worktree/workspaceContext props.
- `ProjectTerminalPanel`/`useProjectTerminal` reuses terminal theme, resize, voice/helper cleanup, and no-reconnect-on-1008 behavior.
- Focused validation can run through `./harness test -- src/server/terminal-server.test.ts src/hooks/use-terminal.test.ts src/components/terminal-panel.test.tsx src/components/workspace-layout.test.tsx`.

### Test Coverage
- Update terminal server tests for default rejection, scoped endpoint auth ordering, valid root/worktree spawn cwd via mocks, invalid context no-spawn, no tmux/process.chdir/git checkout, and redacted errors/logs.
- Add/update hook/panel tests for scoped URL construction, context restart, status label, stale blocking, unsupported-context close handling, and default panel prop restrictions.
- Update Next rewrite/config tests or assertions for `/api/terminal/project` routing.

## Task T6: Harden redaction, disabled-state copy, and diagnostics

- **Status:** Planned
- **Complexity:** M
- **Dependencies:** T1, T2, T5
- **Related ADRs:** ADR-0004, ADR-0007
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005, CORE-COMPONENT-0008, CORE-COMPONENT-0009

### Description
Remove unsafe `details: String(error)` and resolved `cwd` logging from workspace-sensitive paths. Centralize safe copy for repository/worktree/terminal context failures and ensure tests and snapshots cannot capture absolute paths or credentials.

### Acceptance Criteria
- Workspace-sensitive API errors return `{ error, code }` plus only sanitized structured fields.
- File, diff, sync, worktree, and project terminal failure paths do not expose absolute paths, raw Git stderr, credentials, tokens, query strings, fragments, or remote URL userinfo.
- Browser console logging for workspace-sensitive failures uses safe slug/context/code/status fields only.
- Selected-detail disabled copy is actionable and safe for locked, prunable, missing, duplicate, unavailable, Git-unavailable, and non-Git states.
- Harness evidence and E2E artifacts remain sanitized according to CORE-COMPONENT-0009.
- Focused validation can run through targeted `./harness test -- ...` suites covering the changed sanitizers and API/server modules.

### Test Coverage
- Add/update sanitizer tests for HTTPS, SSH, scp-like, malformed, no-origin, credential-bearing, query-bearing, and fragment-bearing remotes.
- Add redaction assertions in API, terminal server, selected-detail, and Playwright-facing tests.
- Add regression tests proving `details: String(error)` and resolved `cwd` are absent from workspace-sensitive responses/logs.

## Task T7: Add browser E2E coverage and run final harness verification

- **Status:** Planned
- **Complexity:** M
- **Dependencies:** T1, T2, T3, T4, T5, T6
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0009

### Description
Add representative browser coverage for selected workspace context switching, sidebar accessibility, project-page terminal context labels/restarts, and default terminal preservation. Finish with full harness verification.

### Acceptance Criteria
- Browser E2E covers root ↔ worktree switching, visible Explorer context changes, FileViewer request behavior, selected-detail collapsed/expanded accessibility, and project-page terminal context label/restart behavior.
- Browser E2E proves the default host terminal remains unchanged and is not routed by selected project/worktree context.
- Tests use accessibility-oriented selectors and harness-owned fixtures.
- If dependencies are missing, implementation uses `./harness install` before verification.
- Final handoff includes `./harness lint`, `./harness format_check`, focused `./harness test -- ...`, focused `./harness e2e -- ...`, and `./harness verify` results as applicable.

### Test Coverage
- Add/update Playwright specs under `e2e/` for sidebar selected-detail workflow, workspace context switching, project terminal scoped context, invalid/stale context copy, redaction, and default terminal preservation.
- Run final `./harness verify` locally before implementation handoff; if browser runtime is unavailable, record the harness verdict and friction per CORE-COMPONENT-0009.
