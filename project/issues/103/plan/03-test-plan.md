# Test Plan: Issue #103

## Test TP1: Worktree response issues server-issued workspace identities

- **Type:** Unit/API
- **Task:** T1
- **Priority:** High

### Setup
- Mock `resolveProjectPath`, `git worktree list --porcelain`, remote-origin calls, and filesystem realpath checks.

### Steps
- Run `./harness test -- src/app/api/worktrees/route.test.ts src/lib/worktree-utils.test.ts`.
- Cover root, internal `.trees`, external worktree, detached, locked, prunable, duplicate-label, Git-unavailable, non-Git, and missing path cases.

### Expected Result
- API returns sanitized `WorkspaceContextResponse` data with stable `wt_<hash>` IDs, no absolute paths, no credentials, and correct disabled/status fields.

## Test TP2: Workspace context resolver rejects stale and unsafe contexts

- **Type:** Unit
- **Task:** T1, T2
- **Priority:** High

### Setup
- Mock Git-reported worktrees and filesystem realpaths for valid, missing, duplicate, traversal, absolute, and colliding context values.

### Steps
- Run focused resolver tests through `./harness test -- src/lib/worktree-utils.test.ts`.

### Expected Result
- Resolver accepts `"root"` and valid server-issued IDs only, rejects stale/disabled/unsafe contexts with structured safe codes, and never trusts client paths.

## Test TP3: File APIs use `workspaceContext` and preserve root behavior

- **Type:** API
- **Task:** T2
- **Priority:** High

### Setup
- Use mocked projects with root plus external worktree fixtures and representative files, diffs, symlinks, and permissions.

### Steps
- Run `./harness test -- src/app/api/files/route.test.ts src/app/api/files/content/route.test.ts src/app/api/files/diff/route.test.ts`.
- Exercise omitted context, `"root"`, valid worktree ID, stale ID, disabled ID, traversal, and symlink escape attempts.

### Expected Result
- File listing/content/save/diff operate in the selected root, return context-relative paths, block stale contexts, and emit sanitized structured errors.

## Test TP4: File-tree sync scopes events by workspace context

- **Type:** Unit/API
- **Task:** T2, T3
- **Priority:** High

### Setup
- Mock EventSource, watcher registry, and file-tree sync scopes using root and worktree context IDs.

### Steps
- Run `./harness test -- src/app/api/files/events/route.test.ts src/server/file-tree-sync.test.ts src/hooks/use-file-tree-sync.test.ts`.
- Cover ready/changed/degraded events, stale scope rejection, heartbeat, retry/degraded fallback, hidden-document pause, and cleanup.

### Expected Result
- Events use `workspaceContext`, never include absolute paths, refresh only active scopes, and preserve fallback semantics.

## Test TP5: WorkspaceContext preserves per-context UI state and blocks stale selections

- **Type:** Unit/Component
- **Task:** T3
- **Priority:** High

### Setup
- Render `WorkspaceProvider` with mocked fetches and multiple workspace context IDs.

### Steps
- Run `./harness test -- src/lib/workspace-context.test.tsx src/lib/file-tree-sync-integration.test.tsx`.
- Switch root/worktree contexts, restore cached state, trigger stale responses, and mark the selected context unavailable.

### Expected Result
- File tree, selected file, expanded folders, loaded directories, and errors are preserved by context ID; stale/unavailable contexts do not mutate visible root state or auto-reset.

## Test TP6: FileViewer sends workspace context and respects blocked states

- **Type:** Component
- **Task:** T3
- **Priority:** High

### Setup
- Render FileViewer with mocked workspace context values, selected files, dirty edits, and API responses.

### Steps
- Run `./harness test -- src/components/file-viewer.test.tsx`.
- Verify content GET, save PUT, diff GET, dirty-change confirmation, stale blocked state, and successful save refresh.

### Expected Result
- FileViewer includes `workspaceContext` when needed, blocks stale/unavailable contexts, preserves unsaved changes on cancelled context switches, and refreshes only after successful saves.

## Test TP7: Sidebar selected-detail layout and accessibility

- **Type:** Component/Accessibility
- **Task:** T4
- **Priority:** High

### Setup
- Render ProjectSidebar with multiple open projects, Copilot statuses, root/worktree choices, disabled choices, and collapsed/expanded states.

### Steps
- Run `./harness test -- src/components/project-sidebar.test.tsx src/components/worktree-tree.test.tsx`.
- Check region placement, focus order, `aria-current`, live regions, disabled focus behavior, collapsed summary, native titles, and no hidden focusable controls.

### Expected Result
- Open-project navigation is separate from selected workspace detail; expanded and collapsed modes remain accessible and do not move focus to another checkout.

## Test TP8: Default terminal remains host-rooted

- **Type:** Unit/Component
- **Task:** T5
- **Priority:** High

### Setup
- Mock terminal WebSocket connections and server auth.

### Steps
- Run `./harness test -- src/server/terminal-server.test.ts src/hooks/use-terminal.test.ts src/components/terminal-panel.test.tsx`.
- Assert default `/api/terminal` rejects `slug`, `worktree`, and `workspaceContext` after auth and before PTY spawn.

### Expected Result
- Default terminal has no project/worktree routing, no scoped props, no sidebar Copilot updates, and no reconnect loop after close code 1008.

## Test TP9: Project-page terminal starts and restarts in selected workspace context

- **Type:** Unit/Component/E2E
- **Task:** T5, T7
- **Priority:** High

### Setup
- Add project terminal mocks and browser fixture projects with root and external worktree contexts.

### Steps
- Run focused terminal tests with `./harness test -- src/server/terminal-server.test.ts src/components/workspace-layout.test.tsx`.
- Run browser coverage with `./harness e2e -- e2e/terminal.spec.ts --project=chromium` or the new focused spec.

### Expected Result
- `/api/terminal/project` validates context, spawns shell-only PTYs in the selected root, restarts on context change, labels the active context, and never falls back on invalid contexts.

## Test TP10: Redaction prevents path and credential leaks

- **Type:** Unit/API/E2E
- **Task:** T6
- **Priority:** High

### Setup
- Use fixture remotes and errors containing absolute paths, credentials, userinfo, query strings, fragments, tokens, and raw Git stderr.

### Steps
- Run targeted sanitizer/API/server tests through `./harness test -- ...`.
- Run any redaction browser regression with `./harness e2e -- <focused spec> --project=chromium`.

### Expected Result
- UI labels, API errors, logs captured by tests, snapshots, and E2E artifacts contain only sanitized labels/codes and no sensitive path or credential material.

## Test TP11: End-to-end workspace context switching

- **Type:** Browser E2E
- **Task:** T4, T5, T7
- **Priority:** Medium

### Setup
- Use harness-owned Playwright fixtures with a project root and at least one Git-reported linked worktree.

### Steps
- Run `./harness e2e -- e2e/workspace-layout.spec.ts --project=chromium` or a new focused workspace-context spec.
- Open a project, switch root → worktree → root, inspect Explorer context, selected-detail labels, FileViewer behavior, and project terminal label/restart.

### Expected Result
- The visible workspace follows the selected context, returns safely to root, and default host terminal behavior remains unchanged elsewhere.

## Test TP12: Final harness verification

- **Type:** Verification
- **Task:** T7
- **Priority:** High

### Setup
- If dependencies are absent, run `./harness install`.

### Steps
- Run `./harness lint`, `./harness format_check`, focused `./harness test -- ...`, focused `./harness e2e -- ...`, and final `./harness verify` as appropriate for implementation handoff.

### Expected Result
- Harness returns pass verdicts for required gates, or any degraded/unavailable browser runtime is documented with the harness verdict and friction record.
