# Task Breakdown - GitHub Issue #52

## T52-1 - Updating architecture and repo map

**Description:** Update `CORE-COMPONENT-0008`, `DECISION-LOG.md`, and `LLM.txt` so the codebase documents worktree-aware file-tree state, HTTP file API worktree parameters, WorktreeTree selector semantics, and `.trees` icon behavior.

**References:** `CORE-COMPONENT-0008`, `CORE-COMPONENT-0006`.

**Acceptance Criteria:**

- `CORE-COMPONENT-0008` includes worktree-aware file-tree and file API rules.
- `DECISION-LOG.md` includes Decisions #104-#112.
- `LLM.txt` lists any new source files and updated responsibilities.

**Test Coverage:** Documentation changes are verified by format check and by implementation tests tied to the documented contracts.

## T52-2 - Adding shared worktree root resolution

**Description:** Add a reusable HTTP file API resolver that resolves project root with `resolveProjectPath(slug)` and optional worktree roots under `<projectRoot>/.trees/<worktree>`.

**References:** `ADR-0003`, `CORE-COMPONENT-0005`, `CORE-COMPONENT-0008`.

**Acceptance Criteria:**

- Valid worktree paths resolve to existing worktree directories.
- Empty, absolute, and traversal-containing worktree values are rejected.
- `fs.realpath()` validates that the real worktree path remains inside the real project root.
- Missing worktrees produce a structured `WORKTREE_NOT_FOUND` error.

**Test Coverage:** Unit tests cover valid resolution, traversal rejection, absolute path rejection, missing worktree, and symlink escape rejection.

## T52-3 - Extending file APIs for worktree scope

**Description:** Add optional worktree support to `/api/files`, `/api/files/content` GET/PUT, and `/api/files/diff`.

**References:** `ADR-0003`, `CORE-COMPONENT-0008`.

**Acceptance Criteria:**

- `/api/files` lists direct children under the active worktree root when `worktree` is provided.
- Content GET and PUT read/write files relative to the active worktree root when provided.
- Diff requests run git commands with `cwd` set to the worktree root when provided.
- Existing project-root behavior is unchanged when `worktree` is absent.
- `FileNode.path` values remain relative to the effective root.

**Test Coverage:** API route tests cover worktree and project-root behavior, missing worktree errors, traversal errors, and diff CWD.

## T52-4 - Making workspace file-tree state worktree-aware

**Description:** Update `WorkspaceProvider` so active worktree changes swap the visible file tree and preserve state per project root/worktree.

**References:** `CORE-COMPONENT-0008`, `CORE-COMPONENT-0007`.

**Acceptance Criteria:**

- Request keys include slug, activeWorktree, and path.
- Stale responses compare both slug and activeWorktree before mutating state.
- Switching to a worktree loads or restores that worktree's file-tree state.
- Switching to project root restores root file-tree state.
- Expanded folders, selected file, loaded directories, and directory errors are preserved per context.

**Test Coverage:** Workspace context tests cover request key separation, stale worktree responses, state save/restore, project-root restoration, and rapid switching.

## T52-5 - Wiring FileViewer to activeWorktree

**Description:** Include active worktree context in FileViewer content, save, and diff requests.

**References:** `CORE-COMPONENT-0008`.

**Acceptance Criteria:**

- Content GET appends `worktree` when active.
- Save PUT body includes `worktree` when active.
- Diff GET appends `worktree` when active.
- FileViewer refreshes the active file-tree context after successful saves.
- Stale content or diff results from a previous context do not replace the current view.

**Test Coverage:** FileViewer tests assert GET URLs, PUT body, refresh behavior, and context-switch stale-result handling.

## T52-6 - Refactoring WorktreeTree selector visualization

**Description:** Render WorktreeTree as filesystem-style selector nodes while keeping it a selector for the main file tree.

**References:** `CORE-COMPONENT-0008`, `CORE-COMPONENT-0004`, `CORE-COMPONENT-0007`.

**Acceptance Criteria:**

- Project root selector clears activeWorktree.
- Worktree selectors set `.trees/<name>` activeWorktree values.
- Nested worktree names display their full relative names.
- Active state uses background and font weight, not color alone.
- Active entry has `aria-current="true"`.
- Component remains mounted and CSS-hidden when no worktrees exist.
- Missing restored active worktrees reset to project root with a non-fatal notice.
- No nested inline file trees are rendered.

**Test Coverage:** Component tests cover selector behavior, nested names, active state, accessibility, empty hidden state, and missing restored worktree reset behavior.

## T52-7 - Rendering `.trees/` with Tree icon

**Description:** Update FileTree directory icon rendering so `.trees` uses the `Tree` icon.

**References:** `ADR-0002`, `CORE-COMPONENT-0008`.

**Acceptance Criteria:**

- `.trees` directory nodes render a `Tree` icon when collapsed.
- `.trees` directory nodes render the same `Tree` icon when expanded.
- Other directory icon behavior remains unchanged.

**Test Coverage:** FileTree tests assert `.trees` icon rendering in expanded and collapsed states and preserve regular folder icons for other directories.

## T52-8 - Verifying the implementation

**Description:** Run repository verification and fix any failures caused by issue #52 changes.

**References:** `CORE-COMPONENT-0006`, `.github/soft-factory/verification.yml` when present.

**Acceptance Criteria:**

- `npm run lint` passes.
- `npm run format:check` passes.
- `npm run build` passes.
- `npm run test` passes.
- Worktree terminal behavior remains covered by existing tests.

**Test Coverage:** Full repository verification.
