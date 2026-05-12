# Test Plan: Issue #27 — File explorer git-status refresh after in-portal edits

All tests are unit-level (vitest + @testing-library/react), co-located with their subjects per CORE-COMPONENT-0006. No new e2e is required for this fix; an optional Playwright follow-up is noted at the end.

---

## Test T1: `refreshFileTree` issues a no-store GET against `/api/files`

- **Type:** Unit (vitest)
- **Task:** 27.1
- **Priority:** P0

### Setup
- Render `WorkspaceProvider` with a non-null `project` whose `slug = "demo"`.
- Stub `global.fetch` with a `vi.fn()` returning `{ ok: true, json: () => [{ name: "a", path: "a", type: "file" }] }`.

### Steps
1. Obtain `refreshFileTree` from `useWorkspace()` via a test-harness consumer.
2. `await act(() => refreshFileTree())`.

### Expected Result
- `fetch` called once with URL `/api/files?slug=demo` and options `{ cache: "no-store" }`.
- `fileTree` from the context updates to the mocked array.

---

## Test T2: `refreshFileTree` toggles `fileTreeRefreshing` true→false and never `fileTreeLoading`

- **Type:** Unit (vitest)
- **Task:** 27.1
- **Priority:** P0

### Setup
- As T1, but resolve `fetch` via a controllable deferred so timing is observable.
- Capture `fileTreeRefreshing` and `fileTreeLoading` snapshots at three points.

### Steps
1. Snapshot before: `fileTreeRefreshing=false`, capture `fileTreeLoading` value V.
2. Call `refreshFileTree()` (do not await).
3. Snapshot in-flight: `fileTreeRefreshing=true`.
4. Resolve fetch; await microtask.
5. Snapshot after.

### Expected Result
- In-flight: `fileTreeRefreshing === true`.
- After: `fileTreeRefreshing === false`.
- `fileTreeLoading === V` at all three snapshots (unchanged by `refreshFileTree`).

---

## Test T3: `refreshFileTree` is a no-op when `project` is null

- **Type:** Unit (vitest)
- **Task:** 27.1
- **Priority:** P0

### Setup
- Render `WorkspaceProvider` with `project={null}` (or omitted).
- `fetch` mocked with `vi.fn()`.

### Steps
1. `await refreshFileTree()`.

### Expected Result
- `fetch` called 0 times.
- `fileTreeRefreshing` remains `false` throughout.
- No `console.error`.

---

## Test T4: `refreshFileTree` preserves prior `fileTree` on error

- **Type:** Unit (vitest)
- **Task:** 27.1
- **Priority:** P1

### Setup
- Seed `fileTree` with a known array `PREV` via initial state / `setFileTree`.
- Stub `fetch` to (a) return `{ ok: false, status: 500 }` then (b) reject with `new Error("network")`.
- Spy on `console.error`.

### Steps
1. Call `refreshFileTree()` (non-OK path); await.
2. Assert state.
3. Call `refreshFileTree()` (rejection path); await.
4. Assert state.

### Expected Result
- After each call: `fileTree === PREV` (unchanged), `fileTreeRefreshing === false`.
- `console.error` invoked at least once per failing call.

---

## Test T5: `FileViewer` save success calls `refreshFileTree` exactly once

- **Type:** Unit (vitest + RTL)
- **Task:** 27.3
- **Priority:** P0

### Setup
- Render `FileViewer` in edit mode with a selected file.
- Wrap with a test `WorkspaceProvider` whose `refreshFileTree` is a `vi.fn().mockResolvedValue(undefined)`.
- Mock `fetch` for `PUT /api/files/content` to resolve with `{ ok: true, json: () => updatedContent }`.

### Steps
1. Click the Save button.
2. `await waitFor(() => expect(toast.success).toHaveBeenCalledWith("File saved"))`.

### Expected Result
- `refreshFileTree` mock called exactly once.
- Call ordering: `toast.success` resolved before/at the same tick as `refreshFileTree`.

---

## Test T6: `FileViewer` save failure does NOT call `refreshFileTree`

- **Type:** Unit (vitest + RTL)
- **Task:** 27.3
- **Priority:** P0

### Setup
- As T5 but provide two scenarios:
  - (a) `fetch` resolves with `{ ok: false, status: 500, json: () => ({ error: "boom" }) }`.
  - (b) `fetch` rejects with `new Error("network")`.

### Steps
1. Click Save.
2. `await waitFor(() => expect(toast.error).toHaveBeenCalled())`.

### Expected Result
- For both (a) and (b): `refreshFileTree` mock called 0 times.
- Editor remains in edit mode (existing test 4.19 behavior preserved).

---

## Test T7: `WorkspaceLayout` initial mount renders spinner once and fetches tree

- **Type:** Unit (vitest + RTL) — regression
- **Task:** 27.2
- **Priority:** P1

### Setup
- Render `WorkspaceLayout` inside a `WorkspaceProvider` whose `refreshFileTree` is a controllable `vi.fn()` returning a deferred promise.
- Project context has `slug = "demo"`.

### Steps
1. Render.
2. Assert spinner present in `ExplorerContent` while `fileTreeLoading=true`.
3. Resolve the deferred promise.
4. Assert spinner removed.

### Expected Result
- `refreshFileTree` called exactly once on mount.
- Spinner visible while loading; gone after settle.
- No additional `refreshFileTree` calls fire on re-render.

---

## Test T8: `ExplorerContent` spinner is NOT gated by `fileTreeRefreshing`

- **Type:** Unit (vitest + RTL) — regression
- **Task:** 27.4
- **Priority:** P1

### Setup
- Render `WorkspaceLayout` with a context where `fileTreeLoading=false` and `fileTreeRefreshing=true`.

### Steps
1. Query for the loading spinner element.

### Expected Result
- Spinner is NOT rendered.
- File tree content is rendered as usual.

---

## Optional follow-up (out of scope for this issue)

- **E2E (Playwright):** open a project, edit a tracked file, save, and assert that an `M` `StatusBadge` appears in the explorer for that file without page reload. Recommended once the unit coverage above is green.
