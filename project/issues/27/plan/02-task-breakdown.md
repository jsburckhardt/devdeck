# Task Breakdown: Issue #27 — File explorer git-status refresh after in-portal edits

## Task 27.1: Extend `WorkspaceContext` with `refreshFileTree` and `fileTreeRefreshing`

- **Status:** Ready
- **Complexity:** S (≈30 LOC + tests)
- **Dependencies:** —
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008, CORE-COMPONENT-0006

### Description
In `src/lib/workspace-context.tsx`:
- Add `refreshFileTree: () => Promise<void>` and `fileTreeRefreshing: boolean` to the `WorkspaceContextValue` interface.
- Add `const [fileTreeRefreshing, setFileTreeRefreshing] = useState(false)` to `WorkspaceProvider`.
- Implement `refreshFileTree` as a `useCallback` keyed on `project?.slug` and `setFileTree`:
  - No-op when `project?.slug` is falsy.
  - `setFileTreeRefreshing(true)` on entry.
  - `fetch(`/api/files?slug=${encodeURIComponent(project.slug)}`, { cache: "no-store" })`.
  - On non-OK or thrown error: `console.error` and leave `fileTree` untouched (do NOT clear).
  - On success: `setFileTree(await res.json())`.
  - `setFileTreeRefreshing(false)` in `finally`.
- Include both new members in the `value` object passed to `WorkspaceContext.Provider`.
- MUST NOT touch `fileTreeLoading` from inside `refreshFileTree`.

### Acceptance Criteria
- [ ] `WorkspaceContextValue` declares `refreshFileTree: () => Promise<void>` and `fileTreeRefreshing: boolean`.
- [ ] `useWorkspace()` consumers can destructure both members without TypeScript errors.
- [ ] `refreshFileTree()` issues exactly one `GET /api/files?slug=…` per call when a project is active, with `cache: "no-store"`.
- [ ] `refreshFileTree()` performs no fetch and leaves `fileTreeRefreshing=false` when `project` is null/undefined.
- [ ] On fetch error, the previous `fileTree` value is preserved and a `console.error` is emitted.
- [ ] `fileTreeLoading` is not modified inside `refreshFileTree`.

### Test Coverage
- Unit (`src/lib/workspace-context.test.tsx`):
  - `refreshFileTree` calls `fetch` with the expected URL and `{ cache: "no-store" }`.
  - On 200 OK, `fileTree` updates with the parsed JSON payload.
  - During the in-flight promise, `fileTreeRefreshing === true`; after settle, `false`.
  - On non-OK status, `fileTree` is unchanged and `console.error` is called.
  - On `fetch` rejection (network error), same as above.
  - When `project` is null, `fetch` is NOT called and `fileTreeRefreshing` stays `false`.
  - `fileTreeLoading` value is unchanged across a `refreshFileTree` cycle.

---

## Task 27.2: Migrate `WorkspaceLayout` initial load to `refreshFileTree`

- **Status:** Ready
- **Complexity:** S
- **Dependencies:** Task 27.1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description
In `src/components/workspace-layout.tsx`:
- Destructure `refreshFileTree`, `setFileTreeLoading`, `fileTreeLoading` from `useWorkspace()` and remove the local `fetchTree` `useCallback`.
- Replace the existing mount-effect with a single effect that, on mount (and when `project.slug` changes):
  1. `setFileTreeLoading(true)`
  2. `await refreshFileTree()`
  3. `setFileTreeLoading(false)` in `finally`.
- Pass `loading={fileTreeLoading}` to `ExplorerContent` exactly as before — do NOT pass `fileTreeRefreshing`.
- No other behavior changes.

### Acceptance Criteria
- [ ] `WorkspaceLayout` no longer defines a local `fetchTree` callback.
- [ ] Initial mount calls `refreshFileTree()` exactly once and toggles `fileTreeLoading` true→false around the call.
- [ ] `ExplorerContent` continues to receive `loading={fileTreeLoading}`.
- [ ] No regression in spinner behavior on first project load.
- [ ] Switching projects (slug change) re-runs the loading sequence.

### Test Coverage
- Unit (`src/components/workspace-layout.test.tsx`):
  - On mount, `refreshFileTree` from context is called exactly once.
  - `fileTreeLoading` is set to `true` before the call and `false` after resolution.
  - `ExplorerContent`'s loading spinner is rendered while `fileTreeLoading` is true.
  - Confirm `fileTreeRefreshing` is never used as the loading prop.

---

## Task 27.3: Call `refreshFileTree()` in `FileViewer.handleSave` on success only

- **Status:** Ready
- **Complexity:** XS
- **Dependencies:** Task 27.1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0008, CORE-COMPONENT-0005

### Description
In `src/components/file-viewer.tsx`:
- Destructure `refreshFileTree` from `useWorkspace()`.
- In the success branch of `handleSave`, immediately after `toast.success("File saved")`, invoke `void refreshFileTree();`.
- Do NOT call `refreshFileTree` from:
  - the non-OK HTTP status branch,
  - the `catch` block (network/throw),
  - any conflict / 409 / validation-error branch.

### Acceptance Criteria
- [ ] `FileViewer` imports `refreshFileTree` from `useWorkspace()`.
- [ ] On a 2xx response from `PUT /api/files/content`, `refreshFileTree` is invoked exactly once after `toast.success("File saved")`.
- [ ] On a non-OK response, `refreshFileTree` is invoked zero times.
- [ ] On a thrown error / network failure, `refreshFileTree` is invoked zero times.
- [ ] No change to existing edit/preview state transitions.

### Test Coverage
- Unit (`src/components/file-viewer.test.tsx`):
  - Save success → `refreshFileTree` mock called exactly once.
  - Save returns 500 → `refreshFileTree` NOT called.
  - `fetch` rejects (network error) → `refreshFileTree` NOT called.
  - Existing tests (4.17–4.19) continue to pass.

---

## Task 27.4: Confirm `ExplorerContent` spinner is gated by `fileTreeLoading` only

- **Status:** Ready
- **Complexity:** XS (verification + regression test)
- **Dependencies:** Task 27.2
- **Related ADRs:** —
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description
Inspect `src/components/workspace-layout.tsx` (`ExplorerContent`) and any sibling that renders the file tree. Ensure the loading spinner is driven solely by the `loading` prop sourced from `fileTreeLoading`. Add an inline code comment near the prop wiring documenting the silent-refresh contract.

### Acceptance Criteria
- [ ] `ExplorerContent` reads only `fileTreeLoading` (via `loading` prop) for spinner gating.
- [ ] No code path reads `fileTreeRefreshing` from context to render UI.
- [ ] Code comment documents that `fileTreeRefreshing` is intentionally not surfaced.

### Test Coverage
- Unit (`src/components/workspace-layout.test.tsx`): regression assertion that toggling `fileTreeRefreshing` on the context (with `fileTreeLoading=false`) does NOT render the spinner.

---

## Task 27.5: Add and update unit tests across the slice

- **Status:** Ready
- **Complexity:** M
- **Dependencies:** Tasks 27.1, 27.2, 27.3, 27.4
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0008

### Description
Author / extend the unit tests called out in `03-test-plan.md` under `src/lib/workspace-context.test.tsx`, `src/components/workspace-layout.test.tsx`, and `src/components/file-viewer.test.tsx`. Use `vi.fn()` for `fetch`, MSW or simple mock factories per existing test conventions, and the established `useWorkspace` test harness.

### Acceptance Criteria
- [ ] All tests enumerated in the test plan exist and pass locally (`just test` / `npx vitest run`).
- [ ] No flakiness; async assertions use `await waitFor`.
- [ ] Coverage for `src/lib/workspace-context.tsx` and `src/components/file-viewer.tsx` does not regress versus current baseline.
- [ ] No `console.error` leakage in passing tests (mock or assert as appropriate).

### Test Coverage
- All tests listed in `03-test-plan.md` (T1–T8). Each must execute deterministically under `vitest run`.
