# Research Brief - GitHub Issue #52

## Title

feat(worktree): enhanced worktree visualization with file tree integration and tree icon

## Scope Classification

- **scope_type:** `core_component`
- **ADRs required:** None proposed. The issue extends existing worktree, file-tree, and workspace-state behavior without changing the tech stack, auth model, registry strategy, or terminal architecture.
- **Core-components requiring update:** `CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State`.

## Rationale

Issue #52 changes cross-cutting behavior already governed by `CORE-COMPONENT-0008`: file-tree request deduplication and stale-response protection, workspace state caching, file API contracts, FileViewer refresh behavior, and WorktreeTree semantics. The Plan stage should update `CORE-COMPONENT-0008` and `project/architecture/ADR/DECISION-LOG.md` before implementation tasks are finalized.

## Existing Decisions and Components

| Source | Relevant rules |
| --- | --- |
| `CORE-COMPONENT-0008` | Decisions #68-73 lazy file-tree behavior, #83 root file-tree errors, #90-94 active worktree and worktree list behavior |
| `CORE-COMPONENT-0003` | Decisions #85-87 terminal worktree support via `worktree` WebSocket parameter |
| `CORE-COMPONENT-0007` | Decision #84: togglable panels that own persistent resources stay mounted |
| `ADR-0003` | `resolveProjectPath(slug)` lives in `src/lib/registry.ts` and resolves project roots server-side |

No existing decision covers worktree-scoped HTTP file APIs, symlink-safe HTTP worktree resolution, or per-worktree file-tree state.

## Current Implementation Summary

### File tree icon rendering

- `src/components/file-tree.tsx` renders directory nodes with `Folder` or `FolderOpen` for every directory.
- `src/lib/file-icons.tsx` only maps file names and extensions for file nodes.
- There is no special case for directory name `.trees`.
- `@phosphor-icons/react` is already used in the codebase and includes `Tree`; no new dependency is needed.

### Worktree selector

- `src/components/worktree-tree.tsx` renders a project-root button and a flat list of worktree buttons.
- Worktree entries use a `GitBranch` icon and call `setActiveWorktree(".trees/<name>")`.
- The component is already always mounted and hidden when there are no worktrees, matching Decision #84.
- The missing piece is filesystem-style selector-node rendering, not nested inline file trees.

### Workspace state and file-tree loading

- `src/lib/workspace-context.tsx` exposes `activeWorktree` and `setActiveWorktree`.
- File-tree request keys are currently keyed by slug and path only, so project-root `src/` and worktree `src/` can collide.
- Root and directory file-tree fetches call `/api/files?slug=<slug>` and `/api/files?slug=<slug>&path=<path>` without a worktree parameter.
- Stale-response checks compare project slug, but not active worktree.
- Selecting a worktree changes terminal scope but does not reload or swap the main file tree.
- Expanded folder, selected file, directory error, and file-tree state are not preserved per worktree.

### HTTP file APIs

- `src/app/api/files/route.ts` resolves all listings under `resolveProjectPath(slug)` and has no `worktree` query parameter.
- `src/app/api/files/content/route.ts` reads and writes under the project root and has no `worktree` query/body parameter.
- `src/app/api/files/diff/route.ts` runs git commands with `cwd` set to the project root and has no `worktree` query parameter.
- Existing path guards use lexical `path.resolve`/`path.relative` checks. Those are useful for normal traversal attempts but do not protect against `.trees/<name>` symlinks that resolve outside the project root.

### FileViewer

- `src/components/file-viewer.tsx` reads `project`, `selectedFile`, `fileTree`, `refreshFileTree`, and `showFileViewer` from `useWorkspace()`.
- Content GET, diff GET, and content PUT requests do not include active worktree context.
- `refreshFileTree()` after save currently refreshes whichever context the workspace provider uses; that provider is not yet worktree-aware.

## Gap Analysis

1. **`.trees/` icon:** `FileNodeIcon` should render `Tree` for directory nodes named `.trees`, in both expanded and collapsed states.
2. **WorktreeTree visualization:** `WorktreeTree` should render filesystem-style selector nodes with tree/worktree icons, indentation, `aria-current` on the active entry, and non-color active affordances.
3. **Worktree file-tree context:** `WorkspaceProvider` should key in-flight requests and stale guards by `{ slug, activeWorktree, path }`, switch file trees when active worktree changes, and preserve state per root/worktree context.
4. **Shared worktree resolver:** File API routes need a shared helper that resolves optional worktree scope under `<projectRoot>/.trees/<worktree>` and validates with `fs.realpath()` on both project root and worktree root.
5. **Worktree-aware file APIs:** `/api/files`, `/api/files/content`, and `/api/files/diff` need optional worktree support and consistent error mapping for invalid or missing worktrees.
6. **FileViewer integration:** File content GET, save PUT, diff GET, and post-save refresh need to preserve active worktree context.
7. **Documentation:** `CORE-COMPONENT-0008`, `DECISION-LOG.md`, and `LLM.txt` should describe the new files/contracts.

## Security Considerations

The main risk is a symlink escape under `.trees/`. A lexical check can allow `<projectRoot>/.trees/evil` even if `evil` is a symlink to `/etc`. The shared resolver should:

1. Reject empty, absolute, or `..`-containing worktree parameters.
2. Join worktree names under `<projectRoot>/.trees/`.
3. Call `fs.realpath()` for both the project root and the candidate worktree path.
4. Verify the real worktree path remains inside the real project root.
5. Return `404 WORKTREE_NOT_FOUND` for missing worktree directories and `400`/`403` for invalid or escaping worktree parameters, following existing route error patterns.

All git operations should continue using `execFile`, not shell-constructed commands.

## Proposed Architecture Updates for Plan Stage

The Planner should update `CORE-COMPONENT-0008` with rules for:

- Three-dimensional file-tree request keys: `slug + activeWorktree + path`.
- Per-worktree in-memory file-tree state covering root tree, expanded folders, selected file, loaded directories, and directory errors.
- Stale-response guards comparing both current slug and current active worktree.
- Optional `worktree` support in `/api/files`, `/api/files/content` GET/PUT, and `/api/files/diff`.
- Shared symlink-safe worktree root resolution for HTTP file routes.
- Worktree-rooted `FileNode.path` values being relative to the active worktree root.
- FileViewer passing `activeWorktree` to content, save, and diff requests.
- WorktreeTree remaining a selector while rendering filesystem-style nodes.
- `.trees/` directory nodes rendering a `Tree` icon.

Suggested decision records should start at the next number after current Decision #103.

## Recommended Verification Focus

- Unit tests for the shared worktree resolver, including traversal, missing worktree, and symlink escape cases.
- API route tests proving `/api/files`, `/api/files/content`, and `/api/files/diff` use the worktree root and preserve existing project-root behavior when absent.
- Workspace context tests for worktree-aware request keys, stale response rejection, worktree switch loading, and state restoration.
- FileViewer tests proving worktree parameters are included in content GET, save PUT body, and diff GET.
- FileTree test proving `.trees` directories render the `Tree` icon.
- WorktreeTree tests proving selector-node rendering, active state, project root selection, nested worktree names, and accessibility attributes.
- Full verification should include `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test`.

## Handoff Notes for Planner

- Treat this as a `core_component` scope because `CORE-COMPONENT-0008` must define the new reusable workspace/file-tree contracts before implementation.
- Do not create a new ADR unless planning discovers a broader architectural decision not visible in research.
- Terminal implementation should remain unchanged unless implementation discovers a direct integration regression; existing Decisions #85-87 already cover worktree terminal CWD behavior.
- Keep WorktreeTree selector-only. Do not render nested file trees inside it; selecting a worktree should replace the main file tree.
- Preserve existing user changes noted before the pipeline started: `.gitignore` is modified and `image.png` is untracked.
