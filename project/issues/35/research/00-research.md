# Research Brief: perf(file-explorer): avoid blank workspace while loading large file trees

## GitHub Issue
- **Issue:** #35
- **Title:** perf(file-explorer): avoid blank workspace while loading large file trees
- **Issue source:** Fetched with `gh issue view 35 --json title,body,labels,assignees,milestone`; metadata shows label `bug`, no assignees, and no milestone. The issue body confirms the reported `GET /api/files?slug=cal-mate` delays, multi-megabyte response, duplicate initial requests, and lazy-loading acceptance criteria.

## Scope Classification
- **Scope Type:** issue
- **Rationale:** This is a focused performance/UX fix in the existing file explorer API, workspace context, and tree UI. It changes the file-tree contract and should amend an existing core-component, but it does not choose a new technology, storage model, or platform architecture.

## Problem Statement

Opening large workspaces can leave the explorer blank because `GET /api/files?slug=<slug>` currently builds a full eager tree to depth 6. After issue #32 made all files visible, high-fanout directories such as `node_modules`, `.git`, and `.next` are no longer hidden, so the root request pays deep traversal cost before any root entries render. The workspace can also issue duplicate root fetches during project initialization, making the delay worse.

Desired outcome: root entries render quickly and visibly include dotfiles, lockfiles, `.git`, `.next`, and `node_modules`; expanding a directory lazily fetches only that directory's direct children, deduplicates concurrent duplicate requests, preserves selected/expanded state, and keeps stale responses from overwriting a newly selected project.

## Existing Context

### Documentation and architecture reviewed

- The RPIV and research guardrails require a Research artifact at `project/issues/<issue>/research/00-research.md`, exact scope classification, repository/doc inspection, and no architectural decisions during Research (`AGENTS.md:126-150`, `.github/agents/research.agent.md:23-38`).
- DevDeck is a Next.js App Router + React + TypeScript app with API routes and a browser file explorer/editor (`docs/README.md:3-9`, `ADR-0002:21-33`).
- Project roots must be resolved server-side through `resolveProjectPath(slug)` and filesystem paths must not be exposed to clients (`ADR-0003:57-70`).
- API errors should be structured and user-facing errors should be clear (`CORE-COMPONENT-0005:21-37`). Tests must be co-located and run through the configured Node/TypeScript standards (`CORE-COMPONENT-0006:37-53`).
- CORE-COMPONENT-0008 owns workspace file-tree state and currently specifies `refreshFileTree(explicitSlug?)`, `fileTreeRefreshing`, initial `fileTreeLoading`, and `GET /api/files?slug=<targetSlug>` with `cache: "no-store"` (`CORE-COMPONENT-0008:47-58`, `CORE-COMPONENT-0008:184-192`). Decision log entries 59-64 record this eager refresh behavior (`project/architecture/ADR/DECISION-LOG.md:89-94`).
- Issue #32 deliberately removed hardcoded hiding and warned that showing `.git`, `node_modules`, `.next`, and lockfiles increases tree size; it required preserving traversal bounds and visible unreadable/truncated markers (`project/issues/32/plan/01-action-plan.md:74-85`).

### Current-state source findings

#### `GET /api/files` eagerly recurses

- `src/app/api/files/route.ts` accepts only `slug`; there is no `path` query parameter or path-scoped response (`src/app/api/files/route.ts:198-223`).
- `readDirectory()` reads a directory, classifies every direct entry, then recursively reads every readable child directory until `maxDepth = 6` (`src/app/api/files/route.ts:110-187`). The max-depth guard returns `children: []` plus `truncated` metadata only after reaching the limit (`src/app/api/files/route.ts:153-160`).
- The route already preserves all-files visibility from issue #32: entries are read directly from `fs.readdir` and classified; there is no active ignore-list filter in this code path (`src/app/api/files/route.ts:117-140`).
- Unreadable directories are retained as visible nodes instead of failing the entire tree (`src/app/api/files/route.ts:148-177`). This behavior must be preserved for lazy child loads.
- Git status is collected once per request via `git status --porcelain -u`; directory status is inferred from descendant status paths (`src/app/api/files/route.ts:86-107`, `src/app/api/files/route.ts:189-196`).

#### `FileNode` is eager-tree shaped

- `FileNode` has `children?`, `kind`, `unreadable`, and `truncated` fields, but no lazy metadata such as `hasChildren`, `childrenLoaded`, per-node loading, or per-node error state (`src/lib/types.ts:26-49`).
- `PerProjectWorkspaceState` stores `fileTree` in memory, so any new lazy metadata must remain serializable and safe to cache per slug (`src/lib/types.ts:75-81`).

#### Workspace context fetches full roots and does not dedupe/stale-guard

- `refreshFileTree` fetches `/api/files?slug=<targetSlug>` only, parses a full `FileNode[]`, and unconditionally calls `setFileTreeState(data)` (`src/lib/workspace-context.tsx:195-220`).
- It tracks an in-flight count for the spinner flag but not request identity. Existing tests assert two concurrent refresh calls issue two fetches and only keep `fileTreeRefreshing` true until both resolve (`src/lib/workspace-context.test.tsx:379-417`).
- Because `refreshFileTree` depends on `project?.slug`, `WorkspaceLayout`'s initial-load effect can rerun when `setProject(project)` changes context state; React Strict Mode can amplify this (`src/components/workspace-layout.tsx:104-129`, `src/lib/workspace-context.tsx:195-220`).
- `WorkspaceLayout` has a cancellation guard for clearing `fileTreeLoading`, but the context refresh itself has no stale-response guard before replacing `fileTree` (`src/components/workspace-layout.tsx:116-129`, `src/lib/workspace-context.tsx:209-210`).

#### File tree UI expands only preloaded children

- `FileTreeItem` toggles folders locally via `toggleFolder(node.path)` and never initiates a child fetch (`src/components/file-tree.tsx:100-114`).
- Children render only when `node.children` already exists, so unloaded directories cannot show per-directory loading, empty, retry, or error states yet (`src/components/file-tree.tsx:166-179`).
- Issue #32 UI already displays unreadable nodes with warning affordances and prevents unreadable directories from expanding; keep that behavior compatible with lazy loading (`src/components/file-tree.tsx:105-163`).

#### Existing tests cover issue #32 and eager refresh contracts, not lazy loading

- API tests cover all-files visibility, socket/FIFO classification, unreadable directories, broken symlinks, and structured root errors, but not root-only listing, `path`-scoped listing, traversal rejection for `path`, or “do not recurse root descendants” behavior (`src/app/api/files/route.test.ts:69-173`).
- Workspace tests cover `cache: "no-store"`, full-root refresh success/failure, explicit slug refresh, and concurrent refresh flag behavior, but not dedupe/cancellation/stale-response protection or child fetch merging (`src/lib/workspace-context.test.tsx:238-417`).
- File tree tests cover regular selection and unreadable-node behavior, but not unloaded/loading/loaded/empty/failed directory states (`src/components/file-tree.test.tsx:64-121`).
- Existing Playwright coverage is terminal/auth focused; there is no file-explorer e2e regression yet (`e2e/terminal.spec.ts:5-39`, `playwright.config.ts:5-29`).

## Implementation Surfaces for Planner

1. **API route (`src/app/api/files/route.ts`)**
   - Extend `GET /api/files` with optional `path=<relative-dir>`.
   - Root request (`slug` only) should return root-level `FileNode[]` only and must not recursively walk root descendants.
   - Path request should validate `path` under the project root, reject traversal, require a directory target, and return direct children as a flat `FileNode[]`.
   - Reuse the existing classification behavior for `kind`, `unreadable`, `truncated`, and git `status`; preserve no-hide-list behavior.
   - Use a safe path validation pattern matching the content route's `path.resolve` + `path.relative` guard (`src/app/api/files/content/route.ts:121-128`).

2. **Types (`src/lib/types.ts`)**
   - Add explicit lazy metadata, likely `hasChildren?: boolean` and `childrenLoaded?: boolean`.
   - Add serializable per-node child-load error metadata only if Planner chooses node-attached errors; otherwise keep errors in context maps keyed by path.
   - Clarify semantics for unreadable directories, empty directories, and max-depth/truncated directories.

3. **Workspace context (`src/lib/workspace-context.tsx`)**
   - Add a child-load API, e.g. `loadDirectoryChildren(path: string): Promise<void>` or a carefully extended `refreshFileTree(explicitSlug?, path?)` contract.
   - Track in-flight requests by `slug + path` and dedupe duplicate root/child fetches.
   - Track per-directory loading/error state without replacing the whole tree.
   - Merge loaded children into the existing tree immutably while preserving selected file and unrelated expanded folders.
   - Add stale-response protection keyed by current slug/request generation before mutating `fileTree`.

4. **Workspace layout and tree UI**
   - Stabilize initial root load so one root request per slug is issued in production and duplicate development Strict Mode calls are deduped (`src/components/workspace-layout.tsx:116-129`).
   - Update `FileTree` expansion so unloaded directories trigger child loading, already-loaded directories only toggle, empty directories render a clear empty state, and failed child loads show retryable per-directory errors.
   - Preserve existing unreadable-node affordances and accessibility labels (`src/components/file-tree.tsx:123-163`).

5. **Tests and verification**
   - Extend route, context, workspace-layout, and file-tree tests. Add Playwright/e2e coverage if the plan can create a deterministic fixture project.
   - Existing verification commands are `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test` (`.github/soft-factory/verification.yml:4-19`, `package.json:12-17`).

## Proposed ADRs

- **ADRs required:** No.
- **Proposed ADR titles:** None.

The issue does not introduce a new framework, persistence mechanism, authentication model, or long-lived architecture decision. It stays within ADR-0002 (Next.js/TypeScript/Vitest) and ADR-0003 (server-side project path resolution).

## Proposed Core-Components

- **Core-components required:** Yes — update an existing core-component.
- **Proposed core-component title:** Update **CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State** with a lazy file-tree loading and request-deduplication contract.

Planner should amend CORE-COMPONENT-0008 before implementation because its current rules require `refreshFileTree` to fetch `/api/files?slug=<targetSlug>` as a whole-tree refresh and `WorkspaceLayout` to use that function for initial load (`CORE-COMPONENT-0008:47-58`, `CORE-COMPONENT-0008:184-192`). The new behavior changes the workspace file-tree contract from eager full-tree replacement to root-only fetch plus incremental child loads. Per project rules, the Planner must also update `project/architecture/ADR/DECISION-LOG.md` with the core-component update and new decision records.

Suggested decision topics for Planner:
- Root file-tree requests return direct root entries only.
- Directory children load lazily via `GET /api/files?slug=<slug>&path=<relative-dir>`.
- Workspace context deduplicates in-flight file-tree requests by slug/path and ignores stale responses.
- Directory load state and errors are per-directory and must not clear the existing tree.
- All-files visibility from issue #32 remains mandatory; performance must come from lazy loading, not a hide-list.

## Risks and Open Questions

1. **Accurate `hasChildren`:** Planner should decide whether unloaded readable directories conservatively use `hasChildren: true` until expanded, or whether the API performs a shallow direct-child existence check. Either approach must avoid recursive descendant walks in the root request.
2. **Path traversal and symlinks:** The new `path` parameter must never allow escaping the project root. Symlink handling should remain conservative and not expose absolute paths.
3. **Git status cost:** `git status --porcelain -u` remains per request. Planner should confirm this is acceptable for child requests or consider status reuse/caching within safe bounds.
4. **Race conditions:** Project switches, root reloads, and child loads can overlap. Stale responses must not overwrite the active project's tree or a newer child load.
5. **Duplicate requests:** Current concurrency tracking is not deduplication; duplicate root or same-directory expansions should share one in-flight promise or safely ignore duplicates.
6. **Empty and unreadable directories:** Empty directories need a visible post-expansion empty state; unreadable directories should remain visible and not spin forever.
7. **Cache behavior:** Root and child fetches that update UI state should use `cache: "no-store"` consistently, matching existing refresh intent.
8. **Accessibility:** Per-directory loading and retry controls need accessible names/states (`aria-busy`, clear `aria-label`, and non-color-only error indicators). Existing icon-only controls should remain keyboard reachable.
9. **E2E fixture reliability:** A Playwright regression should avoid relying on a developer's real `cal-mate` path; use a deterministic fixture or mocked/seeded project if practical.

## Handoff Recommendations for Planner

1. Classify the plan as an issue-scoped performance fix with a required CORE-COMPONENT-0008 amendment; do not create a new ADR.
2. Plan API work first: path validation, root-only listing, path-scoped direct-child listing, lazy metadata, and route tests proving no descendant recursion.
3. Plan context work second: request keying/dedupe, stale guards, child merge helpers, per-directory loading/error state, and root initial-load stabilization.
4. Plan UI work third: `FileTree` expansion-triggered loading, loading/error/empty states, retry behavior, and preservation of selection/expansion.
5. Preserve issue #32 behavior explicitly in every task: no hardcoded hide-list, unreadable entries stay visible, non-regular entries remain classified.
6. Include tests for route, context, `WorkspaceLayout`, `FileTree`, and one file-explorer e2e/performance regression if deterministic infrastructure is feasible.
