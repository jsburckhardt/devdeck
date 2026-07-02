# Research Brief: feat(workspace): simplify worktree context in the project sidebar

## GitHub Issue
- **Issue:** #103
- **Title:** feat(workspace): simplify worktree context in the project sidebar

## Scope Classification
- **Scope Type:** core_component

## Problem Statement

DevDeck currently treats worktree selection as a nested control inside the active project navigation row. Issue #103 requires the sidebar to distinguish open-project navigation from selected-project/workspace detail, and to make root/worktree choices feel like alternate workspace contexts for the selected project rather than child controls of a tab.

The selected workspace context must drive explorer state, file viewing/editing/diffing, file-tree sync, per-context UI state, and project-page terminal startup/restart behavior without mutating the original checkout, running `git checkout`, or changing global server process state. Existing host-rooted default terminal behavior must remain available unchanged.

The feature is also a safety and resilience hardening effort: worktree identities must be stable and server-issued, labels/status/errors must be sanitized, Git-reported worktrees outside `<project>/.trees/` must be eligible, stale/unavailable choices must fail safely instead of falling through to a different checkout, and expanded/collapsed sidebar modes must remain accessible.

## Existing Context

### Documentation and decision context

- Existing global decisions were read under `docs/` and `project/`, including all ADRs, all core-components, and `project/architecture/ADR/DECISION-LOG.md`.
- Relevant current decisions:
  - `CORE-COMPONENT-0007: Shell Layout` owns the fixed/collapsible `w-44`/`w-12` project sidebar, static flex-sibling placement, toggle accessibility, and collapsed behavior.
  - `CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State` owns `OpenProjectsProvider`, `ProjectSidebar`, `WorktreeTree`, `activeWorktree`, per-project/per-worktree file-tree state, file API worktree parameters, stale response guards, and file-tree sync scoping.
  - `CORE-COMPONENT-0003: WebSocket Terminal Communication` now defines the default terminal as host-rooted and explicitly rejects `slug`/`worktree` on `/api/terminal` with close code `1008`; it also states future explicit project terminal contexts require architecture amendment.
  - `CORE-COMPONENT-0005: Error Handling` already requires structured API errors and redaction for file-tree sync logs.
  - ADR-0003 keeps project path resolution server-side through `resolveProjectPath(slug)`.
  - ADR-0006 configures host terminal workspace-root precedence.
  - ADR-0007 keeps file-tree sync events scoped to project/worktree roots and forbids absolute path emission.
- Existing issue artifacts most directly related: #30 introduced `.trees`-filtered worktree visualization and terminal integration; #52 made file APIs/workspace state worktree-aware; #81 introduced SSE file-tree sync; #101 decoupled the default host terminal from selected project/worktree.

### Current source behavior

- `src/components/project-sidebar.tsx`
  - Renders Home, project tab buttons, close buttons, Copilot badges, and the active project's `<WorktreeTree slug={project.slug} />`.
  - The worktree selector is nested inside the active project row wrapper at `active-worktree-wrapper`, and is `className="hidden"` when the sidebar is collapsed.
  - There is no separate selected-project/workspace detail region and no selected-context label in collapsed mode.
- `src/components/worktree-tree.tsx`
  - Fetches `useWorktrees(slug)`, renders a root selector and flat worktree buttons.
  - Uses client-visible values like `.trees/${wt.name}` as `activeWorktree`.
  - Resets a missing active worktree to root with a toast. That conflicts with #103's requirement that invalid/stale selections fail safely and never silently fall back to another checkout.
  - Worktree labels are raw `wt.name`/`wt.branch` strings from the API; there is no disabled state model for locked, prunable, missing, duplicate, conflicting, Git-unavailable, or unavailable choices.
- `src/app/api/worktrees/route.ts`
  - Parses `git worktree list --porcelain`.
  - Filters to worktrees physically under `<projectRoot>/.trees/`.
  - Returns only `{ name, branch }`, with detached represented as `"(detached)"`.
  - Returns `[]` for git errors/non-Git/Git-unavailable cases, which prevents clear repository/worktree status rendering.
- `src/lib/worktree-utils.ts`
  - `resolveWorktreeRoot(slug, worktree)` strips `.trees/`, joins under `<projectRoot>/.trees/<worktree>`, realpaths both roots, and rejects escapes outside the project root.
  - This protects the current `.trees` convention, but conflicts with #103's requirement that Git-reported worktrees are eligible regardless of physical location and that identities do not rely on client-constructed `.trees` paths.
- `src/lib/workspace-context.tsx`
  - Already scopes file-tree root/directory requests by `slug + activeWorktree + path`.
  - Preserves per-worktree `fileTree`, `expandedFolders`, `selectedFile`, loaded directories, and directory errors.
  - Stale guards compare both current slug and active worktree, which is a good integration point once `activeWorktree` becomes a safe server-issued workspace identity.
- `src/components/file-viewer.tsx`
  - Passes `activeWorktree` to file content GET, save PUT body, and diff GET; resets preview/edit/diff state when worktree changes.
- `src/app/api/files/*` and `src/server/file-tree-sync.ts`
  - File listing/content/diff and SSE sync all call the shared worktree resolver, so they inherit the `.trees`-only limitation.
  - Some API failure paths include `details: String(error)` and `terminal-server.mts` logs spawned `cwd`, which are path-leak risks under #103's no-absolute-path requirement.
- `src/components/workspace-layout.tsx`, `src/components/terminal-panel.tsx`, `src/hooks/use-terminal.ts`, and `src/server/terminal-server.mts`
  - Project workspace currently renders `<TerminalPanel />` with no slug/worktree props.
  - `useTerminal()` builds `/api/terminal` without `slug` or `worktree`.
  - `terminal-server.mts` rejects any default endpoint request carrying `slug` or `worktree` after auth and before PTY spawn.
  - Existing tests and E2E assert default terminal decoupling. #103 therefore needs an explicit project-page terminal context while preserving this default behavior.
- No existing source surface provides selected-project repository detail, remote-origin status sanitization, credential/userinfo stripping, or a safe worktree choice schema with stable opaque IDs.

### Requirements mapped to existing architecture

| Requirement area | Existing owner | Gap |
| --- | --- | --- |
| Separate open-project navigation from selected workspace detail | CORE-COMPONENT-0007/0008 | Current `WorktreeTree` is nested in active project row. |
| Collapsed sidebar accessibility/context label | CORE-COMPONENT-0007 | Current collapsed mode hides the worktree selector and has no selected-context label. |
| Root/worktree context state across explorer/file actions/sync | CORE-COMPONENT-0008 | Current mechanics exist but are keyed by `.trees/...` strings and auto-reset stale selections. |
| Git-reported external worktrees and stable identities | CORE-COMPONENT-0008 | Current API/resolver only accepts `.trees`-relative names. |
| Repository availability/status and remote URL state | CORE-COMPONENT-0008 and possibly CORE-COMPONENT-0005 | No selected-project repository status or remote sanitization model exists. |
| Project-page terminal follows selected context | CORE-COMPONENT-0003/0008 | Default terminal is intentionally host-rooted and must remain unchanged; explicit scoped terminal contract is missing. |
| Safe errors/logs/snapshots | CORE-COMPONENT-0005/0008/0003 | Existing `details: String(error)` and `cwd` logs can leak paths. |

## Proposed ADRs

**ADRs required:** No new ADR is currently required.

Issue #103 changes and hardens existing workspace/sidebar/terminal contracts already governed by core-components. It does not appear to require a new persistence technology, new transport family, or new global architectural strategy if the Plan stage keeps worktree identity resolution server-side and amends existing component contracts.

If the Plan stage proposes a persistent server-side worktree identity database, a new terminal transport family, or a cross-session workspace identity store, it should reassess ADR need before implementation.

## Proposed Core-Components

**Core-components required:** Yes.

Proposed target amendments and titles for Plan:

1. **Amend `CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State`**
   - Proposed amendment title: **Selected Workspace Context and Safe Worktree Identity**.
   - Define a selected-project/workspace detail contract separate from open-project tab navigation.
   - Replace client-constructed `.trees/<name>` context values with a server-issued, stable, non-secret workspace/worktree identity model.
   - Define root/worktree choice schema: safe label, active label, repository/worktree status, disabled/error state, no absolute path, no credentials, no remote URL userinfo.
   - Define Git-reported worktree eligibility regardless of physical location.
   - Define stale/invalid/unknown selections as safe blocked states; do not silently fall back to root or another checkout.
   - Define multiple-tab/session independence for selected workspace context.
   - Define how explorer, file content/save/diff, file-tree sync, stale response guards, and per-context UI state consume the selected workspace identity.

2. **Amend `CORE-COMPONENT-0007: Shell Layout`**
   - Proposed amendment title: **Sidebar Selected-Project Detail Layout and Accessibility**.
   - Define placement of selected-project/workspace detail as a separate sidebar region, not inside project navigation rows.
   - Preserve Home/project navigation, active states, close controls, badges, fixed widths, and collapse persistence.
   - Define collapsed-mode selected-context exposure without hidden focusable controls.
   - Define focus order, focus recovery, polite announcements, and disabled worktree focus behavior.

3. **Amend `CORE-COMPONENT-0003: WebSocket Terminal Communication`**
   - Proposed amendment title: **Explicit Project-Page Workspace Terminal Context**.
   - Preserve default host-rooted `/api/terminal` behavior and its `slug`/`worktree` rejection.
   - Define the explicit project-page terminal context contract: how selected workspace identity is sent, resolved server-side, validated, labeled in UI, and restarted on context changes.
   - Require scoped terminal spawn to use per-PTY `cwd` only, never `process.chdir`, `git checkout`, or global server state.
   - Require invalid/stale scoped terminal contexts to fail safely and never fall back to a different checkout.

4. **Consider amending `CORE-COMPONENT-0005: Error Handling` if Plan centralizes redaction**
   - Proposed amendment title: **Workspace Context Error Redaction and Disabled-State Copy**.
   - Define safe structured errors for repository/worktree/terminal context failures and prohibit absolute paths, credentials, query tokens, and remote URL userinfo in UI, API errors, logs, and snapshots.

`project/architecture/ADR/DECISION-LOG.md` must be updated for every core-component amendment.

## Risks and Open Questions

### Gaps and risks for Plan

- **Safe worktree IDs:** The current `activeWorktree` value is a client-visible `.trees/...` path. Planner must select a server-issued identity strategy that is stable for the same checkout, non-secret, and resolvable on each use without trusting client-constructed paths.
- **External worktree locations:** Current `/api/worktrees` filters out worktrees outside `<projectRoot>/.trees/`, and current file APIs cannot resolve them. This is the largest backend contract change.
- **Stale selections:** Current `WorktreeTree` resets missing active worktrees to root. #103 requires safe errors/disabled states and no unintended file/terminal action in another checkout.
- **Terminal context split:** Existing default terminal tests intentionally prove no `slug`/`worktree` routing. Planner must add project-page scoped terminal behavior without regressing default host terminal behavior.
- **Path and credential leaks:** Existing API `details: String(error)` and terminal `cwd` logs may expose absolute paths. Remote-origin support must strip credentials/userinfo/query tokens for HTTPS and SSH/scp-like forms and handle malformed/no-origin/non-Git cases safely.
- **Duplicate/conflicting labels:** External worktrees can share basenames or branch labels. UI must disambiguate without paths.
- **Git edge cases:** Locked, prunable, detached, deleted, missing, duplicate, conflicting, non-Git, Git-unavailable, and repository-unavailable states need explicit response and UI models.
- **Accessibility:** Disabled worktrees should not be focusable; context changes need visible status and polite announcements without duplicate live-region chatter; collapsed mode must expose context label without hidden controls.

### Suggested implementation surfaces for Planner

- `src/lib/types.ts`: introduce safe workspace/worktree choice/status types and context identity type.
- `src/app/api/worktrees/route.ts`: replace `{ name, branch }[]` with a richer, sanitized repository/worktree status response; parse porcelain robustly and include disabled/error states.
- `src/lib/worktree-utils.ts`: replace `.trees`-only resolver with a resolver that accepts server-issued workspace context IDs and verifies against current Git-reported worktrees at use time.
- `src/lib/workspace-context.tsx`: migrate `activeWorktree` to the selected workspace identity, preserve per-context state, and block file/sync actions when context is invalid/unavailable.
- `src/components/project-sidebar.tsx`: split navigation rows from a selected-project detail component; preserve existing project tab/close/collapse behavior.
- `src/components/worktree-tree.tsx` or replacement selected-context component: render root/worktree choices, disabled/error states, sanitized labels, live status, focus recovery, and collapsed summary.
- `src/app/api/files/*` and `src/server/file-tree-sync.ts`: accept/resolve the new context identity and remove unsafe error details.
- `src/components/workspace-layout.tsx`, `src/components/terminal-panel.tsx`, `src/hooks/use-terminal.ts`, `src/server/terminal-server.mts`: add an explicit project-page terminal context path/component while keeping default terminal unchanged.
- `src/components/file-viewer.tsx`: ensure content/save/diff requests use the new context identity and stay blocked on invalid/stale context.
- E2E and unit tests: update `project-sidebar`, `worktree-tree/selected-detail`, `workspace-context`, `worktree-utils`, worktree API, file APIs, terminal server/hook/panel, and Playwright workspace/terminal/accessibility coverage.

### Verification focus for Planner

- Unit/component coverage for selected-project detail placement, no detail when no project is selected, collapsed label behavior, keyboard focus order, disabled worktree focus behavior, polite announcements, and focus recovery.
- API/resolver coverage for external Git-reported worktrees, stable identity reuse, duplicate/conflicting labels, locked/prunable/detached/missing/deleted/non-Git/Git-unavailable states, and sanitized errors.
- Workspace context coverage proving root/worktree switching updates explorer/file actions/file-tree sync/per-context UI state and ignores stale responses.
- Terminal coverage proving project-page terminal starts/restarts in selected context, labels the active context, rejects stale/invalid contexts safely, and default host-rooted terminal remains unchanged.
- Browser coverage proving root ↔ worktree switching changes visible explorer context and project-page terminal context label, then restores root.
- Redaction coverage for UI, API errors, logs/snapshots, remote origin states, credentials, query tokens, userinfo, and absolute paths.
- Repository verification should use harness verbs; `./harness doctor` currently reports `node_modules` missing, so Plan/Implement should run `./harness install` before verification if dependencies are still absent.

### Open questions

1. What exact server-issued identity should represent a worktree while remaining stable, non-secret, and resolvable after worktree removal/recreation?
2. Should root context and worktree context share one API parameter (for example `workspaceContext`) rather than overloading the existing `worktree` parameter?
3. Should project-page scoped terminal use a separate endpoint/component, or an explicit mode on the existing hook/server after core-component amendment?
4. How should duplicate labels be disambiguated without revealing paths?
5. Which repository status belongs in the worktree response versus a separate selected-project status endpoint?
6. Should `Project.path` continue to be present in `/api/projects` for existing UI needs, and how should tests avoid snapshotting it?

### Harness friction

**What did the agent have to infer that the harness should have proved?**

The agent had to manually prove issue metadata, required documentation/source coverage, and the relevant sidebar/worktree/terminal architecture surfaces because the harness has no Research preflight that fetches the issue and reports required docs/source/decision coverage.

Friction record action: recorded with `./harness friction add "Research had to use raw gh/manual docs-source inspection because harness lacks issue fetch and required coverage preflight"`.
