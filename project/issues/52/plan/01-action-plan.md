# Action Plan - GitHub Issue #52

## Scope

- **scope_type:** `core_component`
- **Primary component:** `CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State`
- **ADR changes:** None planned
- **Core-component changes:** Update `CORE-COMPONENT-0008` and `DECISION-LOG.md` with worktree-aware file-tree and file API contracts.

## Goal

Make worktrees first-class in the Explorer experience: the file tree, FileViewer, file APIs, and worktree selector should all reflect the active worktree while preserving existing project-root behavior and terminal worktree support.

## Architectural Decisions

The Plan stage records these decisions in `DECISION-LOG.md` as Decisions #104-#112:

- File-tree request identity includes slug, activeWorktree, and path.
- Project root and each worktree preserve separate file-tree UI state.
- Stale file-tree responses are guarded by both slug and activeWorktree.
- HTTP file APIs accept optional worktree context.
- HTTP worktree roots are resolved with `fs.realpath()` symlink-escape protection.
- Worktree `FileNode.path` values are relative to the active worktree root.
- FileViewer passes activeWorktree to content, save, and diff requests.
- WorktreeTree renders filesystem-style selector nodes, not nested file trees.
- `.trees` directory nodes render a `Tree` icon.

## Implementation Approach

1. Add a shared worktree root resolver for HTTP file APIs.
2. Extend file listing, content, and diff routes to accept optional worktree scope.
3. Make workspace file-tree state and request deduplication worktree-aware.
4. Wire FileViewer to activeWorktree.
5. Refactor WorktreeTree visual rendering while preserving selector behavior.
6. Add a special `.trees` directory icon in FileTree.
7. Update `LLM.txt` with new/changed source contracts.
8. Run the configured verification commands.

## Files and Components

| Area | Files |
| --- | --- |
| Architecture docs | `project/architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md`, `project/architecture/ADR/DECISION-LOG.md` |
| Issue docs | `project/issues/52/plan/*`, `project/issues/52/implementation/README.md` |
| Shared utilities | `src/lib/worktree-utils.ts`, `src/lib/worktree-utils.test.ts` |
| File APIs | `src/app/api/files/route.ts`, `src/app/api/files/content/route.ts`, `src/app/api/files/diff/route.ts` and tests |
| Workspace state | `src/lib/workspace-context.tsx`, `src/lib/workspace-context.test.tsx`, `src/lib/types.ts` |
| UI | `src/components/file-tree.tsx`, `src/components/worktree-tree.tsx`, `src/components/file-viewer.tsx` and tests |
| Repo map | `LLM.txt` |

## Risks and Mitigations

- **Symlink escape through `.trees/`:** use a shared resolver with `fs.realpath()` on both project and worktree roots.
- **Stale file tree after rapid switching:** include activeWorktree in request keys and stale-response guards.
- **Path ambiguity:** return `FileNode.path` relative to the active root and pass worktree context back to APIs.
- **Regression in terminal worktrees:** avoid terminal server changes unless tests reveal a direct issue.
- **Unrelated worktree dirt:** preserve pre-existing `.gitignore` modification and untracked `image.png`.

## Completion Criteria

- All issue acceptance criteria are implemented.
- `CORE-COMPONENT-0008`, `DECISION-LOG.md`, and `LLM.txt` reflect the new contracts.
- Tests cover resolver security, API behavior, workspace state switching, FileViewer requests, FileTree icon rendering, and WorktreeTree accessibility.
- `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test` pass.
