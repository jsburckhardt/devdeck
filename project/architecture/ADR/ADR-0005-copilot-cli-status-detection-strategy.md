# ADR-0005: Copilot CLI Status Detection Strategy

## Status

Accepted

## Context

Users can keep multiple projects open in the sidebar, each with a live terminal WebSocket connection (Decision #84). When Copilot CLI is running in one of those terminals, the user has no visual indication of its state without navigating to that project's terminal. The sidebar needs to show per-project Copilot CLI status indicators (idle, running, waiting). The hard problem is **detection** — how the server determines the Copilot CLI state from the terminal session.

Four detection strategies were evaluated:

1. **PTY Output Inference** — server-side regex pattern matching on PTY output
2. **Process/Session Inspection** — periodic `ps` process tree queries
3. **Protocol Extension** — structured JSON text frame for status communication
4. **User-Configured Patterns** — configurable pattern/command mapping

## Decision

**Combine Strategy 1 (PTY Output Inference) with Strategy 3 (Protocol Extension).**

### Detection Engine: PTY Output Pattern Matching (Strategy 1)

A pure function `detectCopilotState(strippedOutput: string): CopilotCliState | null` is added to `terminal-server.mts`. It runs inside the existing `wirePty` `onData` callback — the single point where all PTY output flows before being sent to the client. The function:

- Strips ANSI escape sequences before matching
- Returns `"running"` when spinner characters (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) or active streaming patterns are detected
- Returns `"waiting"` when input prompt patterns (`> ` at end, `? ` prompts) are detected
- Returns `"idle"` when shell prompt patterns (`$`, `%`, `#`, `❯` at line end) are detected
- Returns `null` when no pattern matches (no state change)

An idle timeout (default 30 seconds) reverts `copilotState` to `"idle"` if no new Copilot CLI output pattern is matched. This is the conservative fallback — prefer `"idle"` over stale `"running"`.

### Communication Channel: Protocol Extension (Strategy 3)

The existing JSON text frame protocol (which already supports `"setup"` and `"error"` types) is extended with a new `"status"` frame type:

```typescript
{ type: "status", copilotState: "idle" | "running" | "waiting" }
```

The server emits this frame whenever `detectCopilotState()` returns a non-null value that differs from the current state. The server also caches the last known state per project slug, broadcasts detected changes to same-project WebSocket clients, and replays the cached state to newly connected same-project clients. The `useTerminal` hook handles this frame in its `onmessage` dispatch and exposes `copilotStatus: CopilotCliState` on its return type.

### Status Model

```typescript
export type CopilotCliState = "idle" | "running" | "waiting";
```

- `"idle"` — no Copilot CLI activity detected, or idle timeout expired, or shell prompt visible
- `"running"` — Copilot CLI actively processing/streaming output
- `"waiting"` — Copilot CLI waiting for user input

Initial state is `"idle"` until a detection event fires or a same-project cached state is replayed by the server.

## Alternatives

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Strategy 2: Process Inspection | OS-level accuracy, not coupled to output format | Polling overhead, OS-specific, tmux PID mapping broken (`pty.pid` is tmux attach, not inner shell), cannot detect sub-states (waiting vs. running) | Unreliable in tmux mode; polling scales poorly with many open projects |
| Strategy 4: User-Configured Patterns | Future-proof, generalizes beyond Copilot CLI | Large config surface, zero UX out of the box, scope expansion | Deferred as future enhancement; `detectCopilotState()` is designed as a replaceable function to enable this later |
| Client-side detection | No server changes needed | Client doesn't have raw PTY output (only rendered xterm); would require duplicating ANSI parsing client-side | Detection is more natural at the server where raw PTY output is available |

## Consequences

### Positive
- Event-driven detection — no polling, scales to many open projects
- Clean separation: server detects, client renders
- Non-breaking protocol extension — existing `"setup"` and `"error"` frames unchanged
- `detectCopilotState()` is a pure function, easily testable and replaceable
- Works equally for tmux and shell modes (both flow through `onData`)

### Negative
- Pattern matching is fragile to Copilot CLI version changes (output format is not a public API)
- ANSI escape sequences must be stripped before matching, adding processing to every `onData` call
- False positives possible if user runs scripts that emit similar patterns
- Per-connection state (current `copilotState`, idle timer) and the per-project status cache add small memory overhead

### Neutral
- The idle timeout value (30s) may need tuning based on real-world usage
- Future Strategy 4 integration is supported by the replaceable `detectCopilotState()` design

## Related Issues

- [#37](https://github.com/jsburckhardt/devdeck/issues/37)

## References

- CORE-COMPONENT-0003 (WebSocket Terminal Communication) — JSON text frame protocol
- CORE-COMPONENT-0008 (Multi-Project Tabs) — per-project workspace state
- Decision #84 — togglable panels remain mounted, enabling background status updates
- Decision #79 — `{ type: "setup", mode }` JSON text frame precedent
