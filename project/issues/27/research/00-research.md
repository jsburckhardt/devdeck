# Research Brief: fix: File explorer should reflect git status changes after in-portal edits

## GitHub Issue
- **Issue:** #27
- **Title:** fix: File explorer should reflect git status changes after in-portal edits

## Scope Classification
- **Scope Type:** `issue`
- **Justification:** This is a focused bug fix — the file explorer loses sync with git status
  after an in-portal save. No new architectural pattern is introduced; no cross-cutting concern
  is generalised into a new core-component. The fix extends the `WorkspaceContextValue` interface
  defined in CORE-COMPONENT-0008, so the planner must amend that core-component document. No new
  ADR is warranted.

---

## Problem Statement

After a user saves a file via the in-portal editor (`FileViewer` edit mode), the file explorer
tree does not refresh its git-status badges. The `M` / `A` / `D` indicators become stale and
remain so until the user manually reloads or navigates away and back.

### Root Cause (verified by code inspection)

**1. `fetchTree` is a local callback inside `WorkspaceLayout`, not published to `WorkspaceContext`.**

`src/components/workspace-layout.tsx:108–120` — `fetchTree` is a `useCallback` scoped to
`WorkspaceLayout`. It is not part of `WorkspaceContextValue` and cannot be called by sibling or
child components such as `FileViewer`.

```ts
// workspace-layout.tsx:108-120
const fetchTree = useCallback(async () => {
  setFileTreeLoading(true);
  try {
    const res = await fetch(`/api/files?slug=${encodeURIComponent(project.slug)}`);
    if (!res.ok) throw new Error("Failed to fetch file tree");
    const data = await res.json();
    setFileTree(data);
  } catch (err) {
    console.error("Failed to load file tree:", err);
  } finally {
    setFileTreeLoading(false);
  }
}, [project.slug, setFileTree, setFileTreeLoading]);
```

**2. `WorkspaceContext` exposes no tree-refresh mechanism.**

`src/lib/workspace-context.tsx:25–33` — `WorkspaceContextValue` provides `setFileTree` and
`setFileTreeLoading` (state setters) but no `refreshFileTree` function.

```ts
// workspace-context.tsx:25-33
interface WorkspaceContextValue extends WorkspaceState {
  setProject: (project: Project) => void;
  selectFile: (path: string | null) => void;
  toggleFolder: (path: string) => void;
  toggleFileViewer: () => void;
  toggleTerminal: () => void;
  setFileTree: (tree: FileNode[]) => void;       // ← state setter only
  setFileTreeLoading: (loading: boolean) => void; // ← no refreshFileTree
}
```

**3. The file tree is fetched exactly once — on `WorkspaceLayout` mount.**

`src/components/workspace-layout.tsx:122–124`:
```ts
useEffect(() => {
  fetchTree();
}, [fetchTree]);
// fetchTree only changes when project.slug changes — never on save
```

**4. `FileViewer.handleSave` calls `PUT /api/files/content` but never signals the tree to refresh.**

`src/components/file-viewer.tsx:357–399` — after a successful save, `handleSave` updates local
`fileContent`, resets edit state, clears `diffContent`, and shows `toast.success("File saved")`.
There is no call to refresh the file tree.

```ts
// file-viewer.tsx:386-394 (post-save success block)
const updated: FileContent = await res.json();
setFileContent(updated);
setEditMode(false);
setEditContent("");
setOriginalContent("");
setDiffContent(null);   // ← resets diff cache
toast.success("File saved");
// ← NO refreshFileTree() call
```

**5. The server-side git status computation is correct but only invoked on initial load.**

`src/app/api/files/route.ts:26–50` — `getGitStatus()` runs `git status --porcelain -u` via
`execFileAsync` on every `GET /api/files` request. The problem is not on the server; the endpoint
is simply never called again after a save.

**6. The `GET /api/files` response carries a short browser-cache header.**

`src/app/api/files/route.ts:149`:
```ts
headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=15" }
```
A refresh fetch issued immediately after save may be served from the browser cache. The fix must
use `cache: "no-store"` on refresh-triggered fetches, or add a cache-busting query parameter.

**7. Stale tree survives tab switches via the `PerProjectWorkspaceState` in-memory cache.**

`src/lib/types.ts:59–65` — `PerProjectWorkspaceState` includes `fileTree: FileNode[]`. On
unmount, `WorkspaceProvider` saves the current (stale) tree to the `OpenProjectsProvider`
in-memory cache (`src/lib/workspace-context.tsx:100–112`). Switching tabs and back restores
the stale tree.

---

## Existing Context

### Source files (verified)

| File | Purpose | Key lines |
|---|---|---|
| `src/components/workspace-layout.tsx` | Owns `fetchTree`; fires once on mount | 108–124 |
| `src/components/file-viewer.tsx` | `handleSave` — calls PUT, no tree refresh | 357–399 |
| `src/lib/workspace-context.tsx` | `WorkspaceContextValue` — no `refreshFileTree` | 25–33, 158–164 |
| `src/lib/types.ts` | `FileNode`, `FileContent`, `PerProjectWorkspaceState` | 26–65 |
| `src/app/api/files/route.ts` | `GET /api/files` — git status + directory tree | 26–157 |
| `src/app/api/files/content/route.ts` | `PUT /api/files/content` — atomic file write | 79–144 |

### Architectural artifacts

| Artifact | Relevance |
|---|---|
| **CORE-COMPONENT-0007** Shell Layout | Defines `WorkspaceLayout` panel structure — host of `fetchTree` |
| **CORE-COMPONENT-0008** Multi-Project Tabs and Workspace State | Defines `WorkspaceContextValue` and `PerProjectWorkspaceState` — directly extended by this fix |

### Existing test coverage gap

`src/components/file-viewer.test.tsx:380–495` covers tests 4.17–4.19 (save calls PUT, save
success returns to preview mode, save failure stays in edit mode). None assert that the file
tree is refreshed after save. New unit tests must be added.

---

## Options Considered

### Option A — Add `refreshFileTree` to `WorkspaceContext`; move fetch into context *(recommended)*

**What:** Add `refreshFileTree: () => Promise<void>` and `fileTreeRefreshing: boolean` to
`WorkspaceContextValue`. Implement `refreshFileTree` inside `WorkspaceProvider` using
`project?.slug` (already in context state). `WorkspaceLayout` replaces its local `fetchTree` /
`useEffect` pair with `context.refreshFileTree()` on mount. `FileViewer.handleSave` calls
`refreshFileTree()` after a successful save.

**Loading state:** `fileTreeRefreshing` is a separate boolean from `fileTreeLoading`. Initial
load shows a spinner (`fileTreeLoading = true`). Subsequent save-triggered refreshes set only
`fileTreeRefreshing = true`; `ExplorerContent` never reads this flag, so no spinner appears
(no flicker, no layout shift).

**Cache busting:** Pass `{ cache: "no-store" }` on the refresh fetch to bypass the 5-second
browser cache.

**Fit with codebase:** Excellent. Follows the existing context pattern (`setFileTree`,
`setFileTreeLoading` already live in context). Minimal diff.

**Performance (1000+ files):** One additional HTTP + `git status` call per save.
`git status` on 1,000 files: ~50–150ms on SSD. Acceptable.

**Complexity:** Low. ~30 lines of new code across two files, plus tests.

---

### Option B — Keep `fetchTree` in `WorkspaceLayout`; add `treeRefreshToken` counter to context

**What:** `WorkspaceContext` adds `treeRefreshToken: number` and `incrementTreeRefresh: () => void`.
`WorkspaceLayout` watches `treeRefreshToken` in a `useEffect` and calls local `fetchTree` when
it changes. `FileViewer` calls `incrementTreeRefresh()` after save.

**Fit:** Acceptable but indirect. The fetch logic stays duplicated in `WorkspaceLayout` and is
triggered indirectly via a counter — harder to reason about and test.

**Complexity:** Moderate. Two extra context members, one extra `useEffect`.

---

### Option C — SWR / React Query shared cache

**What:** Replace manual fetch with a SWR hook keyed by `slug`. Call `mutate(key)` after save.

**Fit:** Poor. No SWR/React Query dependency exists. ADR-0002 chose plain `fetch`. Adding a
cache library for a single endpoint is disproportionate. Requires a new ADR.

**Complexity:** High (new dependency, ADR required).

---

### Option D — WebSocket / Server-Sent Events push

**What:** Server emits a "file changed" event after every PUT; client re-fetches tree on receipt.

**Fit:** Very poor. The WebSocket infrastructure (CORE-COMPONENT-0003) exists for terminal I/O
only. A second channel purely for file-change events is disproportionate.

**Complexity:** Very high.

---

### Option E — Polling

**What:** Client polls `GET /api/files` every N seconds.

**Fit:** Poor. Spawns a git process on every cycle; wasteful for idle sessions. Performance risk
for large repos violates the acceptance criterion.

**Complexity:** Low implementation, but unacceptable performance.

---

## Recommended Approach

**Option A — add `refreshFileTree: () => Promise<void>` to `WorkspaceContext`.**

### Rationale
- Single source of truth: the context owns both the tree data and the mechanism to refresh it.
- Follows existing codebase patterns (`setFileTree` / `setFileTreeLoading` already in context).
- Silent refresh (`fileTreeRefreshing` flag, no spinner) satisfies "no flicker / no layout shift".
- `cache: "no-store"` on the refresh fetch bypasses the short browser cache cleanly.
- No new dependencies, no new ADR.
- Lowest implementation risk.

### Sketch (for planner reference — not a committed decision)

```ts
// src/lib/workspace-context.tsx — additions to WorkspaceContextValue
refreshFileTree: () => Promise<void>;
fileTreeRefreshing: boolean;

// Implementation inside WorkspaceProvider
const [fileTreeRefreshing, setFileTreeRefreshing] = useState(false);

const refreshFileTree = useCallback(async () => {
  if (!project?.slug) return;
  setFileTreeRefreshing(true);
  try {
    const res = await fetch(
      `/api/files?slug=${encodeURIComponent(project.slug)}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("Failed to fetch file tree");
    setFileTree(await res.json());
  } catch (err) {
    console.error("Failed to refresh file tree:", err);
  } finally {
    setFileTreeRefreshing(false);
  }
}, [project?.slug, setFileTree]);
```

```ts
// src/components/workspace-layout.tsx — replace local fetchTree
const { refreshFileTree, fileTreeLoading } = useWorkspace();
useEffect(() => { void refreshFileTree(); }, [refreshFileTree]);
// fileTreeLoading (initial spinner in ExplorerContent) remains driven by first refreshFileTree call
```

```ts
// src/components/file-viewer.tsx — handleSave, after toast.success("File saved")
const { refreshFileTree } = useWorkspace();
// ... inside handleSave, after toast.success:
void refreshFileTree();
```

**Debounce:** Not required for save (user-initiated, not rapid-fire).

**Flicker mitigation:** `fileTreeRefreshing = true` must NOT be passed as the `loading` prop to
`ExplorerContent`. Only `fileTreeLoading` gates the spinner. React reconciles the new `fileTree`
array in-place; `StatusBadge` values update with no layout shift.

---

## ADR / Core-Component Impact

| Artifact | Change needed? | Action for planner |
|---|---|---|
| ADR-0002 Tech Stack | No | — |
| ADR-0003 Project Registry | No | — |
| ADR-0004 Token Auth | No | — |
| **CORE-COMPONENT-0007** Shell Layout | Minor note | Record that `WorkspaceLayout` delegates initial tree load to `context.refreshFileTree()` |
| **CORE-COMPONENT-0008** Multi-Project Tabs & Workspace State | **Yes — amend** | Add `refreshFileTree: () => Promise<void>` and `fileTreeRefreshing: boolean` to `WorkspaceContextValue`; document `cache: "no-store"` refresh contract |

**No new ADR is required.**
**No new core-component is required.**
**DECISION-LOG.md must be updated** with a decision record for the CORE-COMPONENT-0008 amendment.

Proposed CORE-COMPONENT-0008 amendment title (for planner):
> "Add `refreshFileTree` and `fileTreeRefreshing` to `WorkspaceContextValue`; specify silent-refresh contract"

---

## Open Questions / Risks

| # | Risk / Question | Severity | Notes |
|---|---|---|---|
| 1 | **Browser cache bypass** — Does `cache: "no-store"` interact with any proxy in production? | Low | DevDeck is a local tool; no CDN. Acceptable. |
| 2 | **Two booleans vs discriminated state** — `fileTreeLoading` + `fileTreeRefreshing` vs `treeState: "idle" \| "loading" \| "refreshing"` | Low | Planner decides. Two booleans is simpler to implement and test. |
| 3 | **Stale tree in `PerProjectWorkspaceState` cache** — After refresh, `stateRef` updates on next render via effect at `workspace-context.tsx:89–97`. Cache receives refreshed tree on unmount. Confirm no race if unmount fires before refresh completes. | Low | Normal navigation order: state update → effect → unmount. Low risk. |
| 4 | **Large repo timeout** — `git status --porcelain -u` on 50k-file repos can exceed 1s. Should an `AbortController` timeout protect the refresh fetch? | Medium | Acceptance criterion is 1,000+ files. A 10-second `AbortController` timeout is a safe guard. Planner decides scope. |
| 5 | **Untracked new files** — `getGitStatus` at `route.ts:38` maps `"??"` → `"added"`. Verify this surfaces correctly in the tree after refresh. | Low | Server logic is correct; gap is only the missing refresh call. Implementer should add a test. |
| 6 | **Concurrent saves** — Two rapid saves trigger two `refreshFileTree` calls. Last one wins. Safe but causes a double re-render of the tree. | Low | Acceptable. Planner may add an `AbortController` / `useRef` guard if desired. |
| 7 | **`ExplorerContent` must not show spinner on silent refresh** — `workspace-layout.tsx:51–76` currently passes `loading={fileTreeLoading}` to `ExplorerContent`. Confirm `fileTreeRefreshing` is never passed as `loading`. | Low | Implementer must verify; clear from the spec above. |

---

## Hand-off Checklist for Plan Stage

- [ ] **Amend CORE-COMPONENT-0008** — add `refreshFileTree: () => Promise<void>` and
  `fileTreeRefreshing: boolean` to `WorkspaceContextValue`; document `cache: "no-store"`
  refresh contract; record the decision.
- [ ] **Update DECISION-LOG.md** — add a decision record for the CORE-COMPONENT-0008 amendment.
- [ ] **Produce `01-action-plan.md`** — sequence: context change → `WorkspaceLayout` migration →
  `FileViewer` hook-up → test additions.
- [ ] **Produce `02-task-breakdown.md`** with at minimum:
  - **Task 1:** Extend `WorkspaceContextValue` with `refreshFileTree` / `fileTreeRefreshing`;
    implement in `WorkspaceProvider`
  - **Task 2:** Migrate `WorkspaceLayout` initial load to call `context.refreshFileTree()`;
    remove local `fetchTree` callback
  - **Task 3:** Call `refreshFileTree()` in `FileViewer.handleSave` after successful save only
  - **Task 4:** Add unit tests in `workspace-context.test.tsx` and `file-viewer.test.tsx`
  - **Task 5:** Confirm `ExplorerContent` spinner is driven by `fileTreeLoading` only, not
    `fileTreeRefreshing`
- [ ] **Produce `03-test-plan.md`** covering:
  - `workspace-context`: `refreshFileTree` fetches `/api/files?slug=...` with `cache: "no-store"`
    and updates `fileTree`
  - `workspace-context`: `fileTreeRefreshing` is `true` during fetch, `false` after
  - `file-viewer`: on save success → `refreshFileTree` called exactly once
  - `file-viewer`: on save failure (4xx / 5xx / network error) → `refreshFileTree` NOT called
  - `workspace-layout`: initial mount triggers tree load via context (regression: spinner visible
    on initial load)
  - E2E (optional): after save, `StatusBadge` with `M` appears in file explorer without page
    reload
