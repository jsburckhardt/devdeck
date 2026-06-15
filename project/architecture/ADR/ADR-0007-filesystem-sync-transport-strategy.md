# ADR-0007: Filesystem Sync Transport Strategy - Server-Push SSE with Polling Fallback

## Status

Accepted

## Context

Issue #81 requires the file explorer to synchronize with filesystem changes made outside DevDeck's in-portal save flow, including terminal commands, external editors, generated files, branch changes, worktree changes, and git index updates. The current branch already contains a 5000 ms visibility-aware polling implementation for root file-tree and worktree list refreshes, but the revised research brief confirms that polling-only synchronization fails the issue acceptance criteria.

DevDeck already has a canonical file-tree source of truth: `GET /api/files?slug=<slug>[&path=<relative-dir>][&worktree=<relative-worktree>]`. It resolves project and worktree roots server-side, filters `.git` from browsable output, returns relative paths only, and computes git status. The synchronization transport should therefore notify clients that a scoped tree may be stale; it should not become a second source of file rows.

The synchronization architecture must also account for long-lived connection cleanup, auth/origin constraints, watcher burst control, loaded-directory invalidation, stale project/worktree guards, and a degraded mode that preserves the existing polling implementation as fallback.

## Decision

DevDeck will use a Server-Sent Events endpoint as the primary file-tree invalidation transport:

- Add `GET /api/files/events?slug=<slug>[&worktree=<relative-worktree>]` as an EventSource-compatible SSE endpoint running in the Next.js Node.js route runtime.
- Treat SSE payloads as invalidation hints only. Clients MUST refresh canonical state through existing `/api/files` root and directory responses after receiving invalidation events.
- Preserve the existing 5000 ms polling implementation as degraded fallback only. Polling starts when the browser lacks EventSource support, the stream emits `file-tree:degraded`, watcher setup fails, the stream loses heartbeat, or recoverable connection retries are exhausted.
- Do not use polling fallback for authentication failures, invalid origins, invalid slugs, invalid worktree parameters, or other non-retryable request validation failures.

The server will implement filesystem watching through a direct server-only `chokidar` dependency:

- Use a shared watcher registry keyed by normalized `slug + worktree + resolved root`.
- Ref-count subscribers and close each watcher when the last subscriber disconnects or aborts.
- Watch the resolved project/worktree root recursively while preventing absolute paths from reaching the client.
- Exclude noisy `.git` browse contents from event paths, but watch safe git metadata (`.git/index`, `HEAD`, `refs`, and worktree metadata) as status invalidation signals.
- Normalize all emitted paths to POSIX-style relative paths scoped to the effective root.

Raw filesystem events will be debounced and capped:

- Debounce raw watcher events for 250 ms and force-flush any burst that remains open for 1000 ms.
- Limit each `file-tree:changed` payload to 256 relative path hints.
- Include a `truncated: true` flag when the batch cap is exceeded so clients can perform a root-level canonical refresh.
- Limit active watched roots and subscriber counts with explicit resource caps; emit `file-tree:degraded` and close the stream when caps are exceeded.
- Send heartbeat comments at a fixed interval so clients can detect stalled streams.

The SSE endpoint will enforce transport safety:

- Rely on existing HTTP middleware/cookie authentication for same-origin EventSource requests.
- Reject invalid slug/worktree parameters with structured errors and no watcher allocation.
- Reject cross-origin requests when an `Origin` header is present and does not match the request host.
- Never include absolute filesystem paths, registry paths, auth tokens, or raw `.git` paths in SSE data.

## Alternatives

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Keep polling as the primary synchronization strategy | Already implemented; simple client behavior; no new server state | Fails Issue #81's server-push requirement; delays updates; repeatedly runs root refresh/git status even when nothing changes | The revised research brief requires server-push `/api/files/events`, watcher lifecycle, degraded fallback, and sync status UI |
| Use WebSocket for file-tree events | Familiar from terminal transport; bidirectional if future commands are needed | Requires additional auth/routing work, duplicates terminal WebSocket concerns, and implies unnecessary bidirectional protocol | File-tree synchronization is one-way invalidation; SSE fits the HTTP auth/middleware model |
| Send full file rows in event payloads | Could avoid follow-up `/api/files` requests for simple changes | Creates a second source of truth, risks leaking paths, and duplicates git status/path validation semantics | Existing `/api/files` responses must remain canonical after invalidation |
| Use Node `fs.watch` directly | No new dependency; built into Node.js | Recursive behavior and event fidelity vary by platform; debounce/ignore behavior is harder to normalize | `chokidar` provides a more consistent recursive watcher abstraction for the local developer environments DevDeck targets |
| Watch each loaded directory separately | Could reduce event volume for unopened paths | Complex lifecycle tied to UI expansion state; misses root/git metadata changes; many watchers in large trees | A shared root-scoped watcher with batching and loaded-directory client invalidation is simpler and more complete |

## Consequences

### Positive

- External filesystem changes can invalidate the visible explorer without waiting for a fixed poll tick.
- Existing `/api/files` validation, worktree scoping, git status computation, and `.git` filtering remain the canonical data path.
- Watchers are shared across tabs and cleaned up through a ref-counted lifecycle.
- Burst control and payload caps protect clients during branch checkouts, package installs, and generators.
- The existing 5000 ms polling work remains useful as a degraded fallback instead of being discarded.

### Negative

- DevDeck gains a server-side watcher dependency and long-lived SSE connection lifecycle to test.
- Filesystem watchers can still miss or coalesce events on some platforms, so canonical refresh and fallback polling remain necessary.
- Resource caps may place very large repositories into degraded polling mode.
- Native EventSource exposes limited HTTP error details, so client code needs explicit no-retry classification for auth and validation failures.

### Neutral

- The synchronization stream is scoped per project root or active worktree root.
- Loaded directory refresh remains a client workspace-state concern governed by CORE-COMPONENT-0008.
- User-visible sync error/degraded behavior is governed by CORE-COMPONENT-0005.

## Related Issues

- [#81](https://github.com/jsburckhardt/devdeck/issues/81)

## References

- [ADR-0002: Next.js + xterm.js + node-pty Tech Stack](./ADR-0002-tech-stack.md)
- [ADR-0004: Token-Based Authentication](./ADR-0004-token-authentication.md)
- [CORE-COMPONENT-0005: Error Handling](../core-components/CORE-COMPONENT-0005-error-handling.md)
- [CORE-COMPONENT-0008: Multi-Project Tabs and Workspace State](../core-components/CORE-COMPONENT-0008-multi-project-tabs.md)
