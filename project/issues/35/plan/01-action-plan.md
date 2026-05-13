# Action Plan: perf(file-explorer): avoid blank workspace while loading large file trees

## Feature

- **ID:** 35
- **Research Brief:** project/issues/35/research/00-research.md

## ADRs Created

None.

Research classified this as an issue-scoped performance and UX fix within the existing Next.js/TypeScript architecture. No new architectural decision is required. Relevant existing ADRs:

- ADR-0002: Next.js + xterm.js + node-pty Tech Stack
- ADR-0003: Project Registry & Persistence Strategy

## Core-Components Created

No new core-component was created.

Updated global core-component:

- CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State
  - Added lazy root file-tree loading contract.
  - Added path-scoped directory child loading contract.
  - Added request deduplication and stale-response protection requirements.
  - Added per-directory loading, error, retry, and empty-state requirements.
  - Reaffirmed issue #32 all-files visibility and prohibited performance hide-lists.

Decision log updated:

- CORE-COMPONENT-0008 status date changed to 2026-05-13.
- Added decision records 65-69 for root-only listing, path-scoped child listing, dedupe/stale guards, per-directory state, and no-hide-list performance strategy.

## Implementation Tasks

1. **Update the file-tree API for lazy direct-child listing**
   - Extend `GET /api/files` to accept optional `path=<relative-dir>`.
   - Make slug-only requests return direct root children only.
   - Make path requests return direct children for that directory only.
   - Validate requested paths remain under `resolveProjectPath(slug)`.
   - Preserve existing classification, git status, unreadable node, and all-files visibility behavior.
   - Add lazy metadata (`hasChildren`, `childrenLoaded`) to returned directory nodes.

2. **Extend file-tree types and workspace context for lazy loading**
   - Extend `FileNode` and per-project workspace state with lazy metadata and per-directory state.
   - Add `loadDirectoryChildren(path, explicitSlug?)`.
   - Dedupe root and child requests by `slug + path`.
   - Ignore stale responses after project switches or newer request generations.
   - Merge child responses immutably without clearing unrelated loaded state.

3. **Update workspace layout and file-tree UI**
   - Keep the initial root spinner gated only by `fileTreeLoading`.
   - Trigger root load via `refreshFileTree(project.slug)` and rely on dedupe to avoid Strict Mode duplicate fetches.
   - Load children when a readable unloaded directory expands.
   - Render per-directory loading, error, retry, and empty states.
   - Preserve selected file, expanded folders, unreadable affordances, and all-files visibility.

4. **Add and update unit tests**
   - Extend route tests for root-only listing, path listing, traversal rejection, non-directory rejection, lazy metadata, unreadable directories, and no hide-list behavior.
   - Extend context tests for request dedupe, stale-response protection, child merging, per-directory error state, and refresh preservation.
   - Extend file-tree and workspace-layout tests for lazy expansion states and initial-load dedupe expectations.

5. **Add an e2e/performance regression where deterministic infrastructure is practical**
   - Prefer a deterministic fixture project or mocked route setup over relying on a developer's real workspace.
   - Verify initial explorer render shows root entries before deep child directories are requested.
   - Verify expanding a directory issues a path-scoped request and renders child entries.
   - If fixture reliability is not practical in the current test harness, document the reason in implementation notes and ensure unit/integration tests cover the contract.

## Verification Commands

Implementation must pass the configured Soft Factory verification commands:

- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm run test`

If e2e coverage is added or changed, also run the relevant Playwright command locally before Verify stage handoff.
