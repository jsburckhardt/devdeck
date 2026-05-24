# Test Plan - GitHub Issue #52

## Unit and Component Tests

### Shared worktree resolver

- Valid `.trees/<name>` worktree resolves to an existing directory.
- Nested names such as `.trees/feature/login` resolve correctly.
- Empty worktree values are rejected.
- Absolute paths are rejected.
- `..` traversal segments are rejected.
- Missing worktree directory maps to `WORKTREE_NOT_FOUND`.
- Symlink escape is rejected when `fs.realpath()` resolves the worktree outside the real project root.

### File APIs

- `/api/files?slug=<slug>&worktree=<name>` returns direct children under the worktree root.
- `/api/files?slug=<slug>&path=<dir>&worktree=<name>` returns direct children under a worktree subdirectory.
- `/api/files` without worktree preserves project-root behavior.
- `/api/files/content` GET reads from the worktree root when worktree is present.
- `/api/files/content` PUT writes to the worktree root when worktree is present.
- `/api/files/diff` runs git commands with `cwd` set to the worktree root when worktree is present.
- Invalid worktree values return structured client errors.
- Missing worktrees return structured 404 errors.

### Workspace context

- Root refresh request keys include slug, activeWorktree, and root path.
- Directory-load request keys include slug, activeWorktree, and directory path.
- Duplicate in-flight requests dedupe only when all three dimensions match.
- Stale responses from a previous activeWorktree are ignored.
- Switching project root -> worktree saves root state and loads or restores worktree state.
- Switching worktree -> project root saves worktree state and restores root state.
- Switching worktree A -> worktree B -> worktree A restores A's expanded folders, selected file, loaded directories, directory errors, and file tree.

### FileViewer

- Content GET includes `worktree` query parameter when activeWorktree is set.
- Save PUT includes `worktree` in the JSON body when activeWorktree is set.
- Diff GET includes `worktree` query parameter when activeWorktree is set.
- Requests omit worktree when activeWorktree is null.
- ActiveWorktree changes do not allow stale content/diff responses to replace the current view.
- Successful saves call `refreshFileTree()` once and refresh the active context.

### WorktreeTree

- Project-root selector clears activeWorktree.
- Worktree selector sets the `.trees/<name>` activeWorktree value.
- Nested worktree names render as selector-style filesystem nodes.
- Active worktree entry has `aria-current="true"`.
- Active styling uses background/font weight in addition to color.
- Empty component remains mounted and hidden via CSS-compatible state.
- Missing restored active worktrees reset to project root with a non-fatal notice.
- WorktreeTree does not render nested file-tree contents under entries.

### FileTree

- `.trees` directory renders the `Tree` icon when collapsed.
- `.trees` directory renders the `Tree` icon when expanded.
- Regular directories still render `Folder`/`FolderOpen`.
- The icon remains decorative and does not alter tree keyboard behavior.

## Regression Tests

- Existing terminal tests still pass; no terminal-server changes are expected.
- Existing project-root file listing, file content, save, and diff tests still pass.
- Existing lazy file-tree loading tests still pass.
- Existing open project/workspace state persistence tests still pass.

## Verification Commands

Run these after implementation:

```bash
npm run lint
npm run format:check
npm run build
npm run test
```
