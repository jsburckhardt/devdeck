# Test Plan: Issue #35 Lazy File Tree Loading

## Test TP1: Root file-tree API returns direct root children only

- **Type:** Unit
- **Task:** T1
- **Priority:** High

### Setup

Mock `resolveProjectPath`, `fs.access`, `fs.readdir`, `fs.lstat`, optional shallow child-existence probes, and git status in `src/app/api/files/route.test.ts`.

### Steps

1. Call `GET /api/files?slug=test`.
2. Mock root entries including directories and files.
3. Mock at least one root directory that contains nested grandchildren.
4. Assert the response includes only root entries.
5. Assert nested grandchildren are not included in any root node response.
6. Assert recursive descendant reads are not performed beyond allowed shallow metadata probes.

### Expected Result

The response is a `FileNode[]` of direct root children only, with lazy metadata on directories and no eager depth-6 descendant tree.

## Test TP2: Path-scoped file-tree API returns direct directory children only

- **Type:** Unit
- **Task:** T1
- **Priority:** High

### Setup

Mock filesystem calls for a project root containing `src/components/Button.tsx` and deeper descendants.

### Steps

1. Call `GET /api/files?slug=test&path=src`.
2. Assert the route resolves the target under the project root.
3. Assert the response includes direct `src` children only.
4. Assert grandchildren are not recursively embedded.

### Expected Result

The API returns only direct children for `src`, preserving classification and lazy metadata.

## Test TP3: File-tree API rejects unsafe or invalid path requests

- **Type:** Unit
- **Task:** T1
- **Priority:** High

### Setup

Mock `resolveProjectPath` to return `/workspaces/test-project`.

### Steps

1. Call `GET /api/files?slug=test&path=../secret`.
2. Call `GET /api/files?slug=test&path=/etc`.
3. Call `GET /api/files?slug=test&path=package.json` where target is a file.
4. Inspect status codes and JSON bodies.

### Expected Result

Traversal and absolute escape attempts are rejected before reading outside the project root, and non-directory targets return structured JSON errors consistent with CORE-COMPONENT-0005.

## Test TP4: Lazy metadata is returned for non-empty, empty, and unreadable directories

- **Type:** Unit
- **Task:** T1
- **Priority:** High

### Setup

Mock root entries for:

- `non-empty-dir`
- `empty-dir`
- `restricted-dir`

Mock shallow reads and permission failures.

### Steps

1. Call `GET /api/files?slug=test`.
2. Inspect each directory node.
3. Verify lazy metadata and unreadable behavior.

### Expected Result

- `non-empty-dir` has `hasChildren: true` and `childrenLoaded: false`.
- `empty-dir` has `hasChildren: false`, `childrenLoaded: true`, and `children: []`.
- `restricted-dir` remains visible, has `unreadable: true`, and does not require child loading.

## Test TP5: All-files visibility remains preserved without hide-lists

- **Type:** Unit
- **Task:** T1, T4
- **Priority:** High

### Setup

Mock root entries including `.git`, `.next`, `node_modules`, `.env`, `.devcontainer`, `package-lock.json`, and regular source files.

### Steps

1. Call `GET /api/files?slug=test`.
2. Inspect returned names.
3. Repeat for a path-scoped directory containing dotfiles and lockfiles.

### Expected Result

All entries are visible. No hardcoded hide-list filters out dotfiles, lockfiles, `.git`, `.next`, `node_modules`, unreadable entries, or non-regular entries.

## Test TP6: Workspace context deduplicates duplicate root requests

- **Type:** Unit
- **Task:** T2, T4
- **Priority:** High

### Setup

Use `src/lib/workspace-context.test.tsx` with mocked `fetch` returning a controlled pending promise.

### Steps

1. Render `WorkspaceProvider` with active project `demo`.
2. Call `refreshFileTree()` twice before the first request resolves.
3. Resolve the pending response.
4. Inspect fetch calls and final state.

### Expected Result

Only one network call is issued for the root key `demo:` while the first request is in flight, and both callers settle consistently.

## Test TP7: Workspace context deduplicates duplicate same-directory child requests

- **Type:** Unit
- **Task:** T2, T4
- **Priority:** High

### Setup

Seed a root tree with an unloaded readable directory `src`.

### Steps

1. Call `loadDirectoryChildren("src")` twice before the first request resolves.
2. Resolve the response with child nodes.
3. Inspect fetch calls and merged tree.

### Expected Result

Only one `/api/files?slug=demo&path=src` request is issued, and `src.children` is populated once.

## Test TP8: Workspace context allows independent different-directory child requests

- **Type:** Unit
- **Task:** T2
- **Priority:** Medium

### Setup

Seed a root tree with unloaded directories `src` and `docs`.

### Steps

1. Call `loadDirectoryChildren("src")`.
2. Call `loadDirectoryChildren("docs")` while `src` is still pending.
3. Inspect fetch calls.
4. Resolve both responses.

### Expected Result

Two independent requests are issued because their `slug + path` keys differ, and each response merges into the correct directory.

## Test TP9: Workspace context ignores stale project responses

- **Type:** Unit
- **Task:** T2, T4
- **Priority:** High

### Setup

Render context, start a pending request for project `alpha`, then switch active project to `beta` before `alpha` resolves.

### Steps

1. Call `refreshFileTree("alpha")` or `loadDirectoryChildren` for `alpha`.
2. Switch context to project `beta`.
3. Resolve the `alpha` response.
4. Inspect file tree state.

### Expected Result

The stale `alpha` response is ignored and cannot overwrite `beta` file-tree state.

## Test TP10: Workspace context preserves tree and records per-directory errors

- **Type:** Unit
- **Task:** T2, T4
- **Priority:** High

### Setup

Seed a root tree containing `src` and `docs`. Mock a failing child request for `src`.

### Steps

1. Call `loadDirectoryChildren("src")`.
2. Return a non-OK response or reject fetch.
3. Inspect `fileTree`, directory errors, and loading state.

### Expected Result

The root tree and unrelated `docs` branch remain intact. Only `src` receives a path-scoped error, and the `src` loading flag clears.

## Test TP11: FileTree triggers lazy load on unloaded directory expansion

- **Type:** Component
- **Task:** T3
- **Priority:** High

### Setup

Mock `useWorkspace` in `src/components/file-tree.test.tsx` with an unloaded readable directory node.

### Steps

1. Render `FileTree`.
2. Click the unloaded directory.
3. Inspect calls to `toggleFolder` and `loadDirectoryChildren`.

### Expected Result

The directory toggles open and `loadDirectoryChildren(node.path)` is called once.

## Test TP12: FileTree does not refetch already-loaded directories

- **Type:** Component
- **Task:** T3
- **Priority:** Medium

### Setup

Render a directory with `childrenLoaded: true` and child nodes.

### Steps

1. Click the directory to expand.
2. Click to collapse.
3. Click to expand again.
4. Inspect `loadDirectoryChildren` calls.

### Expected Result

Loaded children render from existing state, and no child fetch is triggered for normal expand/collapse.

## Test TP13: FileTree renders per-directory loading, empty, error, and retry states

- **Type:** Component
- **Task:** T3
- **Priority:** High

### Setup

Mock workspace state for:

- a directory path in `directoryLoading`
- an empty loaded directory
- a directory path in `directoryErrors`

### Steps

1. Render each state.
2. Inspect accessible labels/text.
3. Click retry on the error state.

### Expected Result

Loading, empty, and error states render inside the affected directory only. Retry calls the directory child loader for that path. States are accessible and not color-only.

## Test TP14: FileTree preserves unreadable node behavior

- **Type:** Component
- **Task:** T3, T4
- **Priority:** High

### Setup

Use existing unreadable file-like and unreadable directory fixtures.

### Steps

1. Render unreadable file-like nodes.
2. Click unreadable file-like nodes.
3. Render unreadable directories.
4. Click unreadable directories.

### Expected Result

Unreadable file-like nodes remain visible and selectable. Unreadable directories remain visible, show warning affordances, and do not expand or fetch children.

## Test TP15: WorkspaceLayout initial root load remains spinner-scoped and deduped

- **Type:** Component
- **Task:** T3
- **Priority:** Medium

### Setup

Render `WorkspaceLayout` with mocked workspace context and controlled `refreshFileTree`.

### Steps

1. Mount with project `demo`.
2. Assert `setFileTreeLoading(true)` is called before root refresh.
3. Assert `refreshFileTree("demo")` is used.
4. Assert `setFileTreeLoading(false)` is called after completion.
5. Exercise duplicate effect behavior through context-level dedupe tests rather than custom layout fetch logic.

### Expected Result

Initial root load uses `fileTreeLoading`, calls `refreshFileTree(project.slug)`, and does not introduce a separate layout-level fetch implementation.

## Test TP16: Deterministic e2e lazy explorer regression

- **Type:** E2E
- **Task:** T5
- **Priority:** Medium

### Setup

Use Playwright only if a deterministic fixture project or reliable mocked project setup is available. Do not depend on a developer-specific `cal-mate` workspace path.

### Steps

1. Authenticate with the configured test token.
2. Open the deterministic project.
3. Observe the initial `/api/files?slug=<slug>` request.
4. Verify root entries render.
5. Expand a directory.
6. Observe `/api/files?slug=<slug>&path=<relative-dir>`.
7. Verify child entries render.

### Expected Result

The initial explorer render is root-only and visible. Directory expansion uses a path-scoped request and renders direct children. If deterministic setup is not practical, implementation notes must explain why and reference TP1-TP15 as the required contract coverage.

## Test TP17: Full verification command suite passes

- **Type:** Verification
- **Task:** T5
- **Priority:** High

### Setup

Use the repository's configured scripts and Soft Factory verification configuration.

### Steps

1. Run `npm run lint`.
2. Run `npm run format:check`.
3. Run `npm run build`.
4. Run `npm run test`.
5. If e2e coverage is added, run the relevant Playwright command locally before Verify stage handoff.

### Expected Result

All configured verification commands pass with no skipped required tests.
