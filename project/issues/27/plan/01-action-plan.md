# Action Plan: fix: File explorer should reflect git status changes after in-portal edits

## Feature
- **ID:** 27
- **Research Brief:** project/issues/27/research/00-research.md

## ADRs Created
None. The fix introduces no new architectural decision. ADR-0002 (tech stack — plain `fetch`, React Context) governs the implementation choices.

## Core-Components Created
None. **CORE-COMPONENT-0008** (Multi-Project Tabs and Workspace State) was amended in this plan stage to document the new `refreshFileTree()` / `fileTreeRefreshing` contract and the silent-refresh rules. Status bumped to **Adopted (updated)** on 2026-05-12. **CORE-COMPONENT-0007** (Shell Layout) is referenced as the host of `WorkspaceLayout` whose local `fetchTree` is being removed.

## Implementation Tasks
The work is a vertical slice across three source files plus their tests. Order matters: each step depends on the previous.

1. **Task 1 — Extend `WorkspaceContext`.** Add `refreshFileTree: () => Promise<void>` and `fileTreeRefreshing: boolean` to `WorkspaceContextValue` and implement them in `WorkspaceProvider` (`src/lib/workspace-context.tsx`). Use `cache: "no-store"`, no-op when `project` is null, toggle `fileTreeRefreshing` only.
2. **Task 2 — Migrate `WorkspaceLayout` initial load.** Remove the local `fetchTree` callback in `src/components/workspace-layout.tsx`. Trigger initial load by setting `fileTreeLoading=true` and calling `refreshFileTree()` once on mount (clear `fileTreeLoading=false` on completion). Subsequent calls remain silent.
3. **Task 3 — Wire `FileViewer.handleSave` to refresh.** In `src/components/file-viewer.tsx`, call `refreshFileTree()` from the post-success block (after `toast.success("File saved")`). Do NOT call it in any failure branch.
4. **Task 4 — Confirm `ExplorerContent` spinner gating.** Verify `ExplorerContent` continues to read `fileTreeLoading` only and never `fileTreeRefreshing`. Add a regression assertion if missing.
5. **Task 5 — Add unit tests.** Cover the contract in `workspace-context.test.tsx`, `file-viewer.test.tsx`, and `workspace-layout.test.tsx` per the test plan.

### Sequencing rationale
- Task 1 must land first — Tasks 2 and 3 import from the new context API.
- Task 2 and Task 3 can be developed in parallel after Task 1 but should land together to avoid a window where the layout no longer fetches but `FileViewer` does not yet refresh.
- Task 4 is a guard/regression check, low effort, can run alongside Task 2.
- Task 5 closes the loop with explicit coverage; tests for each task should be written with that task per CORE-COMPONENT-0006.

### Architectural references
- **ADR-0002** — plain `fetch`, React Context, vitest + @testing-library/react.
- **CORE-COMPONENT-0007** — `WorkspaceLayout` panel structure; the local `fetchTree` removal is in scope.
- **CORE-COMPONENT-0008** — owner of `WorkspaceContextValue`; amended for the new contract.
- **CORE-COMPONENT-0006** — co-located `*.test.tsx`, 80% coverage target.
