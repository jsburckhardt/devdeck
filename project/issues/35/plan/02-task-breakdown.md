# Task Breakdown: Issue #35 Lazy File Tree Loading

## Task T1: Implement root-only and path-scoped file-tree API

- **Status:** Planned
- **Complexity:** High
- **Dependencies:** None
- **Related ADRs:** ADR-0002, ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008

### Description

Update `src/app/api/files/route.ts` so `GET /api/files?slug=<slug>` returns only direct project-root children, while `GET /api/files?slug=<slug>&path=<relative-dir>` returns only direct children of that project-relative directory.

Implementation requirements:

- Continue resolving project roots through `resolveProjectPath(slug)`.
- Add optional `path` query parameter handling.
- Validate the resolved target path stays under the project root using the content route's `path.resolve` + `path.relative` guard pattern.
- Reject path traversal or absolute escape attempts with structured JSON.
- Reject non-directory `path` targets with structured JSON.
- Preserve existing all-files visibility; do not add `.git`, `.next`, `node_modules`, dotfile, lockfile, or dependency hide-lists.
- Preserve classification behavior for regular files, directories, symlinks, broken symlinks, sockets, FIFOs, devices, permission-denied paths, unreadable directories, sizes, and git status.
- Replace recursive depth-6 traversal on root load with direct-child listing only.
- Add lazy metadata to directory nodes:
  - `hasChildren: true`, `childrenLoaded: false` for readable directories with children.
  - `hasChildren: false`, `childrenLoaded: true`, `children: []` for empty directories.
  - unreadable directories remain visible, have `unreadable: true`, and do not require a child fetch.
- A shallow direct-child existence probe is allowed for directory metadata, but recursive descendant traversal is not.

### Acceptance Criteria

- `GET /api/files?slug=<slug>` returns direct root children only.
- `GET /api/files?slug=<slug>&path=<relative-dir>` returns direct children for that directory only.
- Root requests do not recurse into nested descendants.
- Path-scoped requests do not recurse into nested descendants.
- Path traversal attempts are rejected before reading outside the project root.
- Non-directory path targets are rejected with structured JSON.
- Missing slug and missing project errors remain structured.
- Dotfiles, lockfiles, `.git`, `.next`, `node_modules`, unreadable entries, and non-regular entries remain visible.
- Directory nodes include `hasChildren` and `childrenLoaded` metadata.
- API responses continue using the existing cache headers, while client state-changing fetches use `cache: "no-store"`.

### Test Coverage

- Add route tests in `src/app/api/files/route.test.ts` proving root requests only call `fs.readdir` for the root and shallow metadata probes, not nested descendant tree traversal.
- Add route tests for `path` requests returning only the requested directory's direct children.
- Add route tests for traversal rejection, absolute path rejection, and non-directory rejection.
- Add route tests for lazy metadata on non-empty, empty, and unreadable directories.
- Update existing all-files visibility tests so `.git`, `.next`, `node_modules`, dotfiles, and lockfiles remain visible under the lazy contract.
- Keep existing tests for sockets, FIFOs, broken symlinks, unreadable directories, and structured root errors passing.

## Task T2: Extend types and workspace context for lazy file-tree state

- **Status:** Planned
- **Complexity:** High
- **Dependencies:** T1
- **Related ADRs:** ADR-0002, ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008

### Description

Update `src/lib/types.ts` and `src/lib/workspace-context.tsx` to support lazy root and child loading.

Implementation requirements:

- Extend `FileNode` with `hasChildren?: boolean` and `childrenLoaded?: boolean`.
- Extend per-project workspace state as needed for loaded directory and directory error state.
- Keep state serializable and safe to cache per slug in memory.
- Keep `refreshFileTree(explicitSlug?)` as the root refresh entry point.
- Add `loadDirectoryChildren(path: string, explicitSlug?: string): Promise<void>`.
- Track root and child in-flight requests by `slug + path`, where the root path is a stable empty/root key.
- Dedupe duplicate root requests and duplicate same-directory requests so only one network call is issued while an equivalent request is in flight.
- Preserve `cache: "no-store"` on root and child fetches.
- Protect against stale responses using current slug and/or request generation checks.
- Merge child results immutably into the matching directory node.
- Preserve selected file, expanded folders, unrelated loaded directories, and previous tree data on child-load failure.
- Store per-directory loading and error state without blanking the full explorer.
- Keep `fileTreeRefreshing` root-refresh-specific and do not mutate `fileTreeLoading` inside `refreshFileTree`.

### Acceptance Criteria

- TypeScript types compile with explicit lazy metadata.
- `refreshFileTree()` fetches root direct children and updates/merges the root tree.
- `loadDirectoryChildren(path)` fetches path-scoped direct children and merges them into the matching directory.
- Duplicate root calls share one in-flight request.
- Duplicate same-directory child calls share one in-flight request.
- Different directory paths may load independently.
- Responses for an old project slug do not overwrite the current project's tree.
- Failed child loads preserve existing tree data and record only that directory's error.
- `fileTreeLoading` is controlled by initial-load callers only.
- `fileTreeRefreshing` is not used for per-directory spinners.

### Test Coverage

- Update `src/lib/workspace-context.test.tsx` to cover root request dedupe.
- Add tests for same-directory child request dedupe.
- Add tests proving different child paths issue independent requests.
- Add tests for stale project response protection.
- Add tests for child merge preserving unrelated tree branches and expanded/selected state.
- Add tests for child-load failure preserving the existing tree and setting path-scoped error state.
- Update existing refresh tests that currently expect concurrent calls to issue multiple fetches; they should now expect deduped fetch behavior under CORE-COMPONENT-0008.
- Keep tests for `cache: "no-store"`, explicit slug refresh, no-op without slug, and no `fileTreeLoading` mutation.

## Task T3: Update workspace layout and file-tree UI for lazy directory expansion

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description

Update `src/components/workspace-layout.tsx` and `src/components/file-tree.tsx` to consume the lazy context contract.

Implementation requirements:

- Keep `ExplorerContent` initial spinner gated only by `fileTreeLoading`.
- Continue initial load through `refreshFileTree(project.slug)`.
- Rely on context dedupe so React Strict Mode or repeated effects do not duplicate root fetches.
- On readable unloaded directory expansion, call `loadDirectoryChildren(node.path)`.
- Already-loaded directories should toggle open/closed without refetching.
- Empty directories should render a clear empty state when expanded.
- Directory load failures should render a path-scoped error with a retry affordance.
- Retry should clear or replace the path error and call the child load again.
- Loading and error states must be accessible (`aria-busy`, clear labels, text not color-only).
- Preserve unreadable directory behavior: visible but not expandable.
- Preserve selected file behavior.
- Preserve expansion state across child loads and project tab switches.

### Acceptance Criteria

- Initial root load displays the existing global explorer spinner only while root entries are unavailable.
- Expanding an unloaded readable directory triggers one child load.
- Expanding an already-loaded directory does not refetch.
- Collapsing and re-expanding a loaded directory preserves children.
- Empty directories display a clear empty state.
- Failed directory loads display an error and retry control scoped to that directory.
- Retry reattempts only that directory load.
- Unreadable directories remain visible and do not expand or fetch.
- File selection continues to work for regular and readable file-like nodes.
- No UI behavior relies on a hardcoded hide-list.

### Test Coverage

- Update `src/components/file-tree.test.tsx` to cover unloaded directory expansion triggering `loadDirectoryChildren`.
- Add tests for loaded directory toggle without refetch.
- Add tests for per-directory loading indicator.
- Add tests for empty directory state.
- Add tests for error and retry state.
- Keep unreadable file-like node and unreadable directory tests passing.
- Add or update `workspace-layout` tests to assert initial root load still uses `fileTreeLoading` and repeated initial calls are deduped by context rather than custom layout fetch logic.

## Task T4: Add route/context/UI regression coverage for all-files visibility and race safety

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1, T2, T3
- **Related ADRs:** ADR-0002, ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008

### Description

Add focused regression tests proving the lazy implementation satisfies issue #35 and preserves issue #32.

Implementation requirements:

- Ensure all-files visibility remains explicit in tests.
- Ensure no performance hide-list is introduced.
- Ensure route tests would fail if root traversal recurses into child directories.
- Ensure context tests would fail if stale responses overwrite the active project.
- Ensure UI tests would fail if a child-load error blanks the whole tree.
- Keep tests deterministic with mocked filesystem/fetch where possible.

### Acceptance Criteria

- Tests fail if `.git`, `.next`, `node_modules`, dotfiles, or lockfiles are filtered out.
- Tests fail if root listing eagerly includes grandchildren.
- Tests fail if a duplicate root load issues duplicate network calls.
- Tests fail if a duplicate same-directory expansion issues duplicate network calls.
- Tests fail if stale response data from project A appears after switching to project B.
- Tests fail if a child directory error clears the root tree.
- Tests remain stable in CI without relying on a developer's real workspace.

### Test Coverage

- Route regression tests in `src/app/api/files/route.test.ts`.
- Context regression tests in `src/lib/workspace-context.test.tsx`.
- Component regression tests in `src/components/file-tree.test.tsx`.
- Add any helper test fixtures locally and co-locate tests according to CORE-COMPONENT-0006.

## Task T5: Add deterministic e2e coverage if practical and run verification

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1, T2, T3, T4
- **Related ADRs:** ADR-0002, ADR-0003, ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008

### Description

Add a Playwright regression for lazy file-tree behavior only if the existing e2e infrastructure can provide a deterministic project fixture without depending on a developer-specific workspace.

Preferred e2e coverage:

- Authenticate with the configured token.
- Open a deterministic project.
- Verify root entries render.
- Verify root load does not require expanding or loading deep descendants first.
- Expand a directory and verify child entries appear.
- Optionally observe network requests to confirm the initial request is slug-only and expansion uses `path=<relative-dir>`.

If reliable deterministic fixture setup is not practical in the implementation stage, document why in `project/issues/35/implementation/README.md` and rely on the route/context/UI tests for contract coverage.

### Acceptance Criteria

- E2E test is added only if deterministic and reliable in CI/local harness.
- E2E test does not depend on a real `cal-mate` path or a developer's local project layout.
- E2E test verifies lazy root render and path-scoped expansion when practical.
- If e2e is not added, implementation notes explain why and identify the unit/integration tests covering the same contract.
- All configured verification commands pass.

### Test Coverage

- Preferred: add `e2e/file-tree-lazy.spec.ts` or equivalent deterministic Playwright test.
- Required regardless of e2e: run `npm run lint`.
- Required regardless of e2e: run `npm run format:check`.
- Required regardless of e2e: run `npm run build`.
- Required regardless of e2e: run `npm run test`.
- If e2e is added, run the relevant Playwright command locally before Verify stage handoff.
