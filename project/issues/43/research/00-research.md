# Research Brief — Issue #43

## Title

feat(file-explorer): surface root file-tree load errors with retry UI

## Scope Type

issue

## Problem Statement

When the initial root file-tree fetch fails (network error or non-OK HTTP response), `refreshFileTree()` silently catches the error and logs it to console. Because the tree starts as `[]`, the user sees "No files found" — which is misleading and provides no way to retry.

Per-directory errors already have loading/error/retry UI (implemented in `FileTree` component via `directoryErrors` state), but the root level lacks equivalent error surfacing.

## Affected Components

| Component | File | Role |
|-----------|------|------|
| `WorkspaceContext` | `src/lib/workspace-context.tsx` | Manages `refreshFileTree` — currently swallows root errors silently |
| `ExplorerContent` | `src/components/workspace-layout.tsx` | Renders the explorer panel — currently shows "No files found" on root failure |
| `FileTree` | `src/components/file-tree.tsx` | Already has per-directory error/retry pattern (reference) |

## Existing Architectural Decisions

- **Decision #68:** "Surface directory loading, error, retry, and empty states per directory" — covers subdirectories but not root
- **CORE-COMPONENT-0008 Rule:** "File-tree request failures MUST preserve the existing tree and set an error only for the affected root or directory path" — root error state is required but not implemented
- **CORE-COMPONENT-0005 Rule:** "React error boundaries MUST catch rendering errors and show a fallback UI" — ErrorBoundary wraps ExplorerContent but doesn't handle fetch errors

## Proposed Solution

1. Add `fileTreeError: string | null` state to `WorkspaceContext`
2. In `refreshFileTree`: clear error at start, set on failure (non-OK or network error)
3. In `ExplorerContent`: render error+retry UI when `!loading && error && nodes.length === 0`
4. Retry handler re-runs the initial load sequence (set loading→refresh→clear loading)

## ADRs/Core-Components Required

- **No new ADRs required** — this is a feature-level implementation within existing decisions
- **CORE-COMPONENT-0008 update** — may need a minor update to document `fileTreeError` in the WorkspaceContextValue interface

## Risks

- None significant; the change is additive and follows the existing per-directory error pattern
