# Action Plan: Issue #103 - Simplify worktree context in the project sidebar

## Scope

**scope_type:** `core_component`

Implement the core-component amendments recorded in `CORE-COMPONENT-0003`, `CORE-COMPONENT-0007`, `CORE-COMPONENT-0008`, and `DECISION-LOG.md` for Issue #103.

## Architecture Alignment

- Preserve `ADR-0002` stack choices: Next.js App Router, TypeScript, xterm.js, node-pty, ws, Tailwind, Vitest.
- Preserve `ADR-0003` registry behavior and extend project detail read behavior without changing registry storage.
- Preserve `ADR-0004` auth ordering for HTTP and WebSocket contexts.
- Preserve `ADR-0006` terminal-server env-driven startup configuration.
- Preserve `ADR-0007` file-tree sync transport and change only its worktree context identifier from relative path to safe ID.
- Implement `CORE-COMPONENT-0003` workspace terminal endpoint without weakening default `/api/terminal`.
- Implement `CORE-COMPONENT-0007` split-sidebar layout and collapsed-mode accessibility.
- Implement `CORE-COMPONENT-0008` selected-project detail, safe worktree IDs, worktree response schema, and active workspace context state.

## Implementation Strategy

1. Add shared safe worktree ID utilities and response types.
2. Add `GET /api/projects/[slug]` project detail with sanitized repo origin status.
3. Change `/api/worktrees` to return `WorktreeListResponse` from porcelain only.
4. Change file APIs and file-tree sync resolution to use safe worktree IDs.
5. Rename workspace context semantics to `activeWorktreeId` while keeping temporary legacy aliases for compatibility and migration.
6. Split `ProjectSidebar` into open-project navigation and selected-project detail.
7. Route project-page terminals through `/api/terminal/workspace` and show context/restart status.
8. Update tests for the changed contracts and run targeted harness tests before full verification.

## Non-Goals

- Do not add native dependencies.
- Do not run `git checkout` to change context.
- Do not add durable localStorage migration; workspace context cache is in memory only.
- Do not add tmux routing for workspace terminals in v1.
- Do not expose absolute project/worktree paths or remote URL credentials to clients.

## Harness Friction Reflection

**What did the agent have to infer that the harness should have proved?** The harness did not provide an RPIV planning verb or issue-to-test-surface mapping, so the task breakdown and targeted test set were inferred from architecture/source inspection.
