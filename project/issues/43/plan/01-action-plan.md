# Action Plan — Issue #43

## Objective

Surface root file-tree load errors with retry UI, so users see a clear error message and retry button instead of the misleading "No files found" when the initial file tree fetch fails.

## Approach

Follow the existing per-directory error/retry pattern (already in `FileTree` + `directoryErrors`) and apply the same concept at the root level via `ExplorerContent`.

### Changes

1. **`src/lib/workspace-context.tsx`** — Add `fileTreeError: string | null` state
   - Add to `WorkspaceState` and `WorkspaceContextValue` interfaces
   - Initialize as `null`, clear on `setProject`, clear at start of `refreshFileTree`, set on failure
   - Expose in context value

2. **`src/components/workspace-layout.tsx`** — Render error+retry in `ExplorerContent`
   - Read `fileTreeError` from context
   - When `!loading && error && nodes.length === 0`: show error icon, message, and retry button
   - Retry handler: set `fileTreeLoading(true)` → `refreshFileTree(slug)` → `setFileTreeLoading(false)`

3. **Tests** — Cover the new behavior
   - `workspace-context.test.tsx`: `fileTreeError` set on failure, cleared on retry/success
   - `workspace-layout.test.tsx`: ExplorerContent renders error+retry UI, retry triggers refresh

## Non-Goals

- Toast notifications for root errors (the error is shown inline, consistent with directory errors)
- Showing error banners when there IS existing tree data (silent refresh failures remain silent per Decision #62)
