# CORE-COMPONENT-0005: Error Handling

## Status

Adopted (updated) - 2026-06-15

## Purpose

Define consistent error handling patterns across the application, covering WebSocket connection failures, terminal errors, API errors, file-tree sync stream degradation, and UI rendering errors. Users must always see clear, actionable feedback when something goes wrong.

## Scope

- WebSocket connection errors and reconnection
- Terminal PTY process errors
- React error boundaries for UI crashes
- API route error responses
- Toast notifications for user-facing errors
- File-tree SSE sync connection, degraded fallback, and retry behavior

## Definition

### Rules
- WebSocket disconnections MUST trigger an automatic reconnection attempt (max 3 retries with exponential backoff)
- Terminal connection errors MUST display a visible overlay in the terminal panel
- React error boundaries MUST catch rendering errors and show a fallback UI
- API errors MUST return structured JSON: `{ error: string, code: string }`
- User-facing errors MUST use toast notifications (sonner) for non-blocking feedback
- All errors MUST be logged to the browser console with contextual information
- WebSocket close code 4401 MUST be treated as an authentication error; the client MUST NOT attempt reconnection
- Authentication failures on HTTP routes MUST return 401 status with `{ error: string, code: "AUTH_REQUIRED" }`
- The terminal panel MUST display a distinct "Unauthorized" overlay when close code 4401 is received
- File-tree sync connection states MUST render visible, non-blocking Explorer status instead of replacing the file tree
- File-tree sync status text MUST use `role="status"` with `aria-live="polite"` for connecting, ready, syncing, degraded, retrying, and recovered states
- Non-retryable file-tree sync failures such as authentication, invalid origin, invalid slug, invalid worktree, or invalid parameters MUST render actionable error text and MUST NOT start automatic retry loops
- Recoverable file-tree sync failures MUST retry the SSE stream with bounded exponential backoff before entering degraded fallback polling
- Degraded file-tree sync MUST preserve existing visible tree state, start the 5000 ms fallback polling path, and expose a manual retry control
- Manual file-tree sync retry MUST close any stale EventSource, stop fallback polling after a new `file-tree:ready`, and keep fallback polling active if retry fails recoverably
- File-tree sync error logs MUST include status/code and project/worktree scope only; logs MUST NOT include absolute filesystem paths, auth tokens, or raw event payloads

### Interfaces
- **ErrorBoundary:** React component wrapping each major panel (file explorer, terminal, content viewer)
- **useWebSocketReconnect:** Hook managing reconnection logic with exponential backoff
- **Toast API:** `toast.error(message)` from sonner for user notifications
- **API error format:** `{ error: string, code: string, details?: unknown }`
- **File-tree sync status UI:** Explorer header status element using `role="status"` and `aria-live="polite"` plus a retry button when the state is retryable/degraded
- **File-tree sync retry action:** `retryFileTreeSync()` from `WorkspaceContext`, invoked by Explorer UI to restart the SSE stream without remounting the tree
- **File-tree sync no-retry states:** `unauthorized`, `invalid-origin`, `invalid-slug`, `invalid-worktree`, and `invalid-parameters`

### Expectations
- Reconnection attempts MUST use exponential backoff: 1s, 2s, 4s
- After max retries, MUST show a "Connection lost" UI with a manual retry button
- Error boundaries MUST NOT crash the entire application — only the affected panel
- PTY process crashes MUST allow spawning a new terminal without page reload
- File-tree sync degradation MUST announce fallback polling without clearing selection, expansion, loaded directories, or the current tree
- File-tree sync auth/validation failures MUST tell the user what to change and avoid misleading fallback polling

## Rationale

WebSocket connections are inherently unreliable. Exponential backoff prevents thundering herd problems. React error boundaries isolate failures to individual panels, maintaining the IDE experience even when one component fails. Toast notifications provide non-intrusive feedback that doesn't break the user's workflow.

File-tree synchronization uses a long-lived SSE stream that may fail independently from the rest of the workspace. Treating recoverable stream failures as degraded background synchronization keeps the explorer usable, while explicitly stopping retries for auth and validation failures prevents hidden loops and avoids masking configuration problems.

## Usage Examples

```typescript
// WebSocket reconnection
const { isConnected, error, retry } = useWebSocketReconnect('/api/terminal', {
  maxRetries: 3,
  baseDelay: 1000,
});

// Error boundary usage
<ErrorBoundary fallback={<PanelError onRetry={reset} />}>
  <Terminal />
</ErrorBoundary>

// API error response
return Response.json({ error: 'PTY spawn failed', code: 'PTY_ERROR' }, { status: 500 });

// File-tree sync status
<div role="status" aria-live="polite">
  File sync degraded — polling every 5 seconds.
  <button onClick={retryFileTreeSync}>Retry sync</button>
</div>
```

## Integration Guidelines

- Wrap each major panel (FileTree, FileViewer, Terminal) in its own ErrorBoundary
- Use the `sonner` Toaster component in the root layout
- WebSocket reconnection logic belongs in the `useTerminal` hook
- API routes should use a shared `createErrorResponse` utility
- File-tree sync retry/degraded handling belongs in `useFileTreeSync` and must be surfaced through `WorkspaceContext` for Explorer UI
- Explorer sync status must be inline and non-blocking; it must not replace root load errors or per-directory retry UI

## Exceptions

- Development mode may show more detailed error information (stack traces)
- Test environments may disable reconnection to make tests deterministic
- Test environments may mock EventSource and force degraded polling without real timers or filesystem watchers

## Enforcement

- [x] Automated checks: Test that error boundaries catch thrown errors
- [x] Code review checklist: New API routes must use structured error format
- [x] Test coverage requirements: WebSocket reconnection logic must have unit tests
- [ ] Automated checks: File-tree sync hook tests must cover recoverable retry/backoff, degraded fallback entry, manual retry, and fallback stop after `file-tree:ready`
- [ ] Automated checks: Explorer UI tests must cover `role="status"`, `aria-live`, retry button accessibility, non-retryable auth/invalid-param copy, and tree preservation while degraded
- [ ] Test coverage requirements: `./harness verify` must pass before implementation handoff

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md)
- [ADR-0004-token-authentication](../ADR/ADR-0004-token-authentication.md)
- [ADR-0007-filesystem-sync-transport-strategy](../ADR/ADR-0007-filesystem-sync-transport-strategy.md)
