# Test Plan — Issue #43

## Context Tests (`src/lib/workspace-context.test.tsx`)

### T1-ctx-1: `fileTreeError` is set on non-OK response
- Arrange: render harness with project, mock fetch to return 500
- Act: call `refreshFileTree()`
- Assert: `fileTreeError` contains "HTTP 500"

### T1-ctx-2: `fileTreeError` is set on network rejection
- Arrange: render harness with project, mock fetch to reject
- Act: call `refreshFileTree()`
- Assert: `fileTreeError` contains error message

### T1-ctx-3: `fileTreeError` is cleared on successful refresh
- Arrange: render harness, fail first refresh, then succeed
- Act: call `refreshFileTree()` twice
- Assert: `fileTreeError` is null after second call

### T1-ctx-4: `fileTreeError` is cleared at start of new refresh
- Arrange: render harness, fail first refresh
- Act: start second refresh (don't resolve yet)
- Assert: `fileTreeError` is null while second refresh is in flight

## Layout Tests (`src/components/workspace-layout.test.tsx`)

### T2-layout-1: ExplorerContent shows error+retry when root load fails
- Arrange: mock context with `fileTreeError="HTTP 500"`, empty `fileTree`, `fileTreeLoading=false`
- Assert: error message and retry button visible, file tree not visible

### T2-layout-2: ExplorerContent retry triggers refreshFileTree
- Arrange: same as T2-layout-1
- Act: click retry button
- Assert: `setFileTreeLoading(true)` called, `refreshFileTree(slug)` called

### T2-layout-3: ExplorerContent shows spinner during loading (no error shown)
- Arrange: mock context with `fileTreeLoading=true`, `fileTreeError="HTTP 500"`
- Assert: spinner visible, error UI not visible

### T2-layout-4: ExplorerContent shows file tree on success (no error)
- Arrange: mock context with nodes, no error, not loading
- Assert: file tree visible, no error UI
