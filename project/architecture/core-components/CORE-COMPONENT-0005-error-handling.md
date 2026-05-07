# CORE-COMPONENT-0005: Error Handling

## Status

Adopted

## Purpose

Define consistent error handling patterns across the application, covering WebSocket connection failures, terminal errors, API errors, and UI rendering errors. Users must always see clear, actionable feedback when something goes wrong.

## Scope

- WebSocket connection errors and reconnection
- Terminal PTY process errors
- React error boundaries for UI crashes
- API route error responses
- Toast notifications for user-facing errors

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

### Interfaces
- **ErrorBoundary:** React component wrapping each major panel (file explorer, terminal, content viewer)
- **useWebSocketReconnect:** Hook managing reconnection logic with exponential backoff
- **Toast API:** `toast.error(message)` from sonner for user notifications
- **API error format:** `{ error: string, code: string, details?: unknown }`

### Expectations
- Reconnection attempts MUST use exponential backoff: 1s, 2s, 4s
- After max retries, MUST show a "Connection lost" UI with a manual retry button
- Error boundaries MUST NOT crash the entire application — only the affected panel
- PTY process crashes MUST allow spawning a new terminal without page reload

## Rationale

WebSocket connections are inherently unreliable. Exponential backoff prevents thundering herd problems. React error boundaries isolate failures to individual panels, maintaining the IDE experience even when one component fails. Toast notifications provide non-intrusive feedback that doesn't break the user's workflow.

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
```

## Integration Guidelines

- Wrap each major panel (FileTree, FileViewer, Terminal) in its own ErrorBoundary
- Use the `sonner` Toaster component in the root layout
- WebSocket reconnection logic belongs in the `useTerminal` hook
- API routes should use a shared `createErrorResponse` utility

## Exceptions

- Development mode may show more detailed error information (stack traces)
- Test environments may disable reconnection to make tests deterministic

## Enforcement

- [x] Automated checks: Test that error boundaries catch thrown errors
- [x] Code review checklist: New API routes must use structured error format
- [x] Test coverage requirements: WebSocket reconnection logic must have unit tests

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md)
- [ADR-0004-token-authentication](../ADR/ADR-0004-token-authentication.md)
