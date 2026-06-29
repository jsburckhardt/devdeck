# Test Plan: Issue #103 - Simplify worktree context in the project sidebar

## Targeted Tests

Run targeted tests with the harness:

```bash
./harness test -- src/lib/worktree-utils.test.ts src/app/api/projects/[slug]/route.test.ts src/app/api/worktrees/route.test.ts src/hooks/use-worktrees.test.ts src/lib/workspace-context.test.tsx src/components/worktree-tree.test.tsx src/components/project-sidebar.test.tsx src/components/workspace-layout.test.tsx src/hooks/use-terminal.test.ts src/server/terminal-server.test.ts
```

Add file API targets when safe-ID resolver changes affect them:

```bash
./harness test -- src/app/api/files/route.test.ts src/app/api/files/content/route.test.ts src/app/api/files/diff/route.test.ts src/app/api/files/events/route.test.ts src/server/file-tree-sync.test.ts
```

## Coverage Matrix

| Area | Required coverage |
| --- | --- |
| Worktree IDs | canonical path hashing, collision extension/conflict, outside-`.trees`, missing/locked/prunable/detached states, duplicate display names, no path leakage |
| Project detail | unknown slug 404, unavailable known project 200, no-origin/not-git/git-unavailable/invalid statuses, HTTPS/SSH/scp-like sanitization, credential stripping |
| Worktree API | exact `WorktreeListResponse`, cache headers, status mapping, porcelain-only discovery, `WORKTREE_ID_CONFLICT` |
| File APIs | omitted worktree root behavior, empty worktree 400, unknown ID 404, collision 409, outside-`.trees` effective root, no fallback to another cwd |
| Workspace context | `activeWorktreeId` root/null switching, scoped state cache, stale guards, request dedupe, legacy `.trees/<name>` migration/reset |
| Sidebar UI | upper/lower split, selected detail states, ready fields, worktree selector moved out of tab rows, collapsed mode, focus order, live-region updates |
| Terminal | workspace URL construction, auth-before-resolution, root/worktree cwd, default endpoint 1008 preservation, context switch cleanup/restart notice |

## Final Verification

Run:

```bash
./harness verify
```

## Harness Friction Reflection

**What did the agent have to infer that the harness should have proved?** The harness exposes test execution but not issue-specific target selection, so this test plan inferred target files from affected source surfaces.
