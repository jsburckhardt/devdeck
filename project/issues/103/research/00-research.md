# Research Brief: Issue #103 - Simplify worktree context in the project sidebar

## Scope Classification

**scope_type:** `core_component`

Issue #103 changes reusable cross-cutting workspace behavior across the project sidebar, workspace context state, worktree discovery/resolution, file APIs, file sync scoping, and terminal routing. Existing ADRs remain sufficient; existing core-components require amendments before implementation.

## Issue Summary

The current worktree experience presents worktrees as nested selectors under the active project tab and stores `.trees/<name>` paths as client-visible context. The requested behavior is to split the project sidebar into an upper open-project navigation region and a lower selected-project detail region. Worktree selection should act like opening another checkout as the active workspace context without running `git checkout` in the original project directory.

## Existing Behavior

- `GET /api/worktrees?slug=<slug>` uses `git worktree list --porcelain`, filters results to `<projectRoot>/.trees/`, and returns a bare `Worktree[]` of `{ name, branch }`.
- `WorktreeTree` is rendered inside the active project tab row and selects worktrees by constructing `.trees/<name>` values.
- `WorkspaceProvider` keeps `activeWorktree` in memory and scopes file tree, selected file, loaded directories, stale guards, and sync state by project plus active worktree.
- HTTP file APIs accept optional `worktree` and resolve it as a relative path under `<projectRoot>/.trees/`.
- `/api/terminal` is a default host terminal and intentionally rejects `slug`/`worktree` context with close code `1008`.
- Project detail route `src/app/api/projects/[slug]/route.ts` supports `PUT` and `DELETE`, but not the requested focused `GET` detail schema.

## Relevant Architecture

- `ADR-0002`: Next.js, TypeScript, xterm.js, node-pty, ws, Tailwind, Vitest remain the implementation stack.
- `ADR-0003`: Project registry and `resolveProjectPath` define slug-to-root resolution and manual unavailable project behavior.
- `ADR-0004`: HTTP and WebSocket auth must validate before sensitive terminal/context resolution.
- `ADR-0006`: Terminal server remains env-driven for startup configuration.
- `ADR-0007`: File-tree sync scope must continue to use canonical `/api/files` refreshes with SSE invalidation.
- `CORE-COMPONENT-0003`: Needs amendment for explicit `/api/terminal/workspace` while preserving default `/api/terminal`.
- `CORE-COMPONENT-0007`: Needs amendment for the vertically split project sidebar and collapsed-mode focus behavior.
- `CORE-COMPONENT-0008`: Needs amendment for selected-project detail, safe worktree IDs, `activeWorktreeId`, per-context state, and new worktree response schema.
- `CORE-COMPONENT-0005`: Existing structured error and non-retryable sync error rules apply.
- `CORE-COMPONENT-0009`: Harness workflow and verification rules apply.

## Relevant Source Surfaces

- `src/lib/types.ts`
- `src/lib/registry.ts`
- `src/lib/worktree-utils.ts`
- `src/app/api/projects/[slug]/route.ts`
- `src/app/api/worktrees/route.ts`
- `src/app/api/files/route.ts`
- `src/app/api/files/content/route.ts`
- `src/app/api/files/diff/route.ts`
- `src/app/api/files/events/route.ts`
- `src/hooks/use-worktrees.ts`
- `src/hooks/use-file-tree-sync.ts`
- `src/lib/workspace-context.tsx`
- `src/components/project-sidebar.tsx`
- `src/components/worktree-tree.tsx`
- `src/components/workspace-layout.tsx`
- `src/components/terminal-panel.tsx`
- `src/hooks/use-terminal.ts`
- `src/server/terminal-server.mts`
- `LLM.txt`

## Required Architecture Updates

No new ADR is required.

Required core-component amendments:

1. `CORE-COMPONENT-0003`: Add explicit workspace-scoped terminal endpoint contract and keep default host terminal behavior unchanged.
2. `CORE-COMPONENT-0007`: Add selected-project lower sidebar region, collapsed behavior, and focus/live-region expectations.
3. `CORE-COMPONENT-0008`: Replace `.trees/<name>` client context with safe worktree IDs, update worktree list response schema, and define selected-project detail behavior.
4. `DECISION-LOG.md`: Add and supersede decisions for all core-component amendments.
5. `LLM.txt`: Update changed API/component responsibilities.

## Implementation Risks

- Safe IDs must not expose absolute paths and must re-resolve from porcelain for each file/terminal request.
- Old `.trees/<name>` in-memory state needs migration/reset without durable localStorage migration.
- Outside-`.trees/` worktrees must be supported by porcelain, while traversal checks remain relative to the effective resolved root.
- Default `/api/terminal` behavior from Issue #101 must remain unchanged.
- Context switches must not leave terminal UI claiming one cwd while the WebSocket is connected to another.
- Tests need updates for the changed `/api/worktrees` object response and new safe-ID semantics.

## Proposed Test Focus

- Worktree utility tests for porcelain parsing, safe IDs, outside-`.trees`, duplicate display names, ID collision handling, old `.trees` migration/reset, and resolution errors.
- API tests for `GET /api/projects/[slug]`, `GET /api/worktrees`, file API empty/unknown worktree behavior, and workspace terminal auth/context ordering.
- Component tests for sidebar split layout, collapsed behavior, selected-project detail states, worktree selection, disabled states, and active context announcements.
- Hook/context tests for `activeWorktreeId`, scoped request keys, stale response guards, and workspace terminal URL construction/restarts.

## Harness Friction Reflection

**What did the agent have to infer that the harness should have proved?** The harness did not prove issue-scope artifact readiness or identify the source/doc surfaces relevant to #103; those were inferred from `gh`, `rg`, and architecture inspection.
