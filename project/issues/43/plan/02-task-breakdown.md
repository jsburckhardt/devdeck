# Task Breakdown — Issue #43

## T1: Add `fileTreeError` state to WorkspaceContext

**File:** `src/lib/workspace-context.tsx`

**Changes:**
- Add `fileTreeError: string | null` to `WorkspaceState` interface
- Add `fileTreeError: string | null` to `WorkspaceContextValue` interface
- Add `useState<string | null>(null)` for `fileTreeError`
- In `refreshFileTree`: clear error at start (`setFileTreeError(null)`), set error on non-OK (`setFileTreeError(responseErrorMessage(res))`), set error on catch (`setFileTreeError(err message)`)
- In `setProject` callback: clear `setFileTreeError(null)`
- Add `fileTreeError` to context value object and `useMemo` deps

**Acceptance Criteria:**
- `fileTreeError` is `null` initially
- `fileTreeError` is set to error message on `refreshFileTree` failure
- `fileTreeError` is cleared when a new refresh starts
- `fileTreeError` is cleared on successful refresh
- `fileTreeError` is cleared on project switch

**Test Coverage:** T1-ctx tests in workspace-context.test.tsx

---

## T2: Render error+retry UI in ExplorerContent

**File:** `src/components/workspace-layout.tsx`

**Changes:**
- Add `error` and `onRetry` props to `ExplorerContent`
- Import `WarningCircle` from `@phosphor-icons/react`
- When `!loading && error && nodes.length === 0`: render error icon, message, and retry button
- In `WorkspaceLayout`: read `fileTreeError` from context, create retry handler, pass to `ExplorerContent`
- Retry handler: `setFileTreeLoading(true) → refreshFileTree(slug) → setFileTreeLoading(false)` (mirroring the initial load effect)

**Acceptance Criteria:**
- When root load fails and tree is empty: error icon, message, and retry button are visible
- Retry button triggers a new load with spinner
- When root load succeeds: normal file tree is shown (no error UI)
- When tree has data but refresh fails: tree remains visible (no error shown)

**Test Coverage:** T2-layout tests in workspace-layout.test.tsx

---

## T3: Update CORE-COMPONENT-0008

**File:** `project/architecture/core-components/CORE-COMPONENT-0008-multi-project-tabs.md`

**Changes:**
- Add `fileTreeError: string | null` to the WorkspaceContextValue interface definition
- Add enforcement checkbox for root error/retry tests

**Acceptance Criteria:**
- Documentation reflects the new state
