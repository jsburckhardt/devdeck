# Task Breakdown: Issue #103 - Simplify worktree context in the project sidebar

## Task T1: Safe worktree IDs and API schemas

**Depends on:** Architecture amendments in `CORE-COMPONENT-0008`

### Work

- Add `ProjectDetailResponse`, `WorktreeListResponse`, `WorktreeSummary`, and related status types.
- Implement porcelain parsing and safe ID generation in `src/lib/worktree-utils.ts`.
- Support outside-`.trees/` worktrees from porcelain.
- Extend IDs from 16 to 32 hex chars on collision and return `WORKTREE_ID_CONFLICT` if still ambiguous.

### Acceptance Criteria

- Safe IDs are derived from canonical resolved porcelain paths.
- API-facing summaries never include absolute filesystem paths.
- Duplicate display names are disambiguated.
- Locked, prunable, missing, detached, and available states are represented.

### Test Coverage

- `src/lib/worktree-utils.test.ts`
- `src/app/api/worktrees/route.test.ts`

## Task T2: Project detail and worktree APIs

**Depends on:** T1

### Work

- Add `GET /api/projects/[slug]` with sanitized repo origin status.
- Change `GET /api/worktrees` to return `WorktreeListResponse`.
- Return structured `400`, `404`, `409`, and safe `200` statuses per architecture.

### Acceptance Criteria

- Unknown slugs return `404`.
- Known unavailable manual projects return `200 available:false`.
- Repo URLs and display values strip credentials/userinfo or return `invalid`.
- Worktree endpoint uses porcelain only and returns cache headers.

### Test Coverage

- `src/app/api/projects/[slug]/route.test.ts`
- `src/app/api/worktrees/route.test.ts`

## Task T3: Safe-ID file API and sync scoping

**Depends on:** T1, T2

### Work

- Update `resolveWorktreeRoot` to resolve safe IDs from current porcelain output.
- Ensure `/api/files`, `/api/files/content`, `/api/files/diff`, and `/api/files/events` treat omitted worktree as root and empty worktree as `400 INVALID_WORKTREE`.
- Preserve traversal/symlink checks relative to the effective root.

### Acceptance Criteria

- File APIs never fall back to project root for unknown worktree IDs.
- Worktrees outside `.trees/` work when porcelain reports them.
- Error bodies contain codes but no absolute paths.

### Test Coverage

- `src/app/api/files/route.test.ts`
- `src/app/api/files/content/route.test.ts`
- `src/app/api/files/diff/route.test.ts`
- `src/app/api/files/events/route.test.ts`
- `src/server/file-tree-sync.test.ts`

## Task T4: Workspace context migration and hooks

**Depends on:** T1, T3

### Work

- Add `activeWorktreeId` and `setActiveWorktreeId` to `WorkspaceContext`.
- Keep legacy `activeWorktree` alias temporarily, carrying the same safe ID value.
- Update request keys, state save/restore, file viewer, file sync hook usage, and `useWorktrees`.
- Migrate legacy `.trees/<name>` in-memory values to matching safe IDs when possible.

### Acceptance Criteria

- Root context is represented as `null`.
- New selections store safe IDs only.
- Legacy `.trees/<name>` values migrate by `repoRelativeLabel` or reset with a non-fatal notice.
- Stale project/worktree guards compare safe IDs.

### Test Coverage

- `src/lib/workspace-context.test.tsx`
- `src/hooks/use-worktrees.test.ts`
- `src/components/worktree-tree.test.tsx`
- `src/components/file-viewer.test.tsx`

## Task T5: Split project sidebar selected-project detail

**Depends on:** T2, T4

### Work

- Remove worktree selector rendering from project tab rows.
- Add selected-project lower detail region sourced from the active `/project/[slug]` route.
- Render no-selection, loading, ready, unavailable, and error states.
- Show name, sanitized repo status, active context label, and worktree list.
- Hide detail controls in collapsed mode and expose compact context labels on the active project button.

### Acceptance Criteria

- Open-project navigation behavior is preserved.
- Worktree selection lives only in selected-project detail.
- Collapsed mode leaves no hidden focusable controls.
- Context changes update visible text and a polite live region.

### Test Coverage

- `src/components/project-sidebar.test.tsx`
- `src/components/worktree-tree.test.tsx`

## Task T6: Workspace terminal endpoint and UI routing

**Depends on:** T1, T4, T5

### Work

- Add `/api/terminal/workspace` handling to `src/server/terminal-server.mts`.
- Preserve default `/api/terminal` host behavior and unsupported-context `1008`.
- Update `useTerminal` and `TerminalPanel` to support explicit workspace routing.
- Pass workspace context from `WorkspaceLayout`.
- Show active context label and context-change restart status.

### Acceptance Criteria

- Auth failures close `4401` before context resolution.
- Invalid workspace contexts close `1008` with fixed error frame and no path echo.
- Valid root/worktree contexts spawn shell cwd at the resolved root.
- Context switches close old PTY, recreate terminal UI, reconnect, and show restart text.

### Test Coverage

- `src/server/terminal-server.test.ts`
- `src/hooks/use-terminal.test.ts`
- `src/components/terminal-panel.test.tsx`
- `src/components/workspace-layout.test.tsx`

## Task T7: Repo map, implementation notes, and verification

**Depends on:** T1-T6

### Work

- Update `LLM.txt` for changed APIs/components.
- Add implementation notes.
- Run targeted tests through `./harness test -- <targets>`.
- Run `./harness verify`.

### Acceptance Criteria

- Documentation reflects changed contracts.
- Implementation notes summarize files changed and test results.
- Full harness verification passes before completion.

### Test Coverage

- `./harness verify`

## Harness Friction Reflection

**What did the agent have to infer that the harness should have proved?** The harness did not provide issue task dependency generation or target test discovery, so dependencies and test mapping were inferred from source and architecture docs.
