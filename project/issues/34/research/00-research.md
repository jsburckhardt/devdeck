# Research Brief — Issue #34: fix: tmux attach failure when opening projects with shared devcontainer sessions

## 1. Metadata

| Field | Value |
|---|---|
| Issue | #34 |
| Scope Type | `issue` |
| Branch | `34-tmux-attach-failure` |
| Research Date | 2025-07-19 |
| Affected Core-Components | CORE-COMPONENT-0003 (update required) |
| New ADRs Required | None |
| Key Decisions Referenced | 11, 12, 13, 24, 44, 45, 46, 56 |

---

## 2. Problem Analysis

### 2.1 User-Visible Symptoms

When a project has a `.devcontainer/.tmux-shared` socket, opening its workspace terminal produces:

1. WebSocket connects → header immediately shows **"Connected"** (green dot)
2. xterm.js terminal renders raw text: **`open terminal failed: not a terminal`**
3. After a short pause the fallback shell starts — the terminal becomes interactive — but the tmux error text remains in the scroll buffer
4. The user cannot distinguish whether they are in a tmux session or a plain fallback shell; the header shows no session mode indicator

### 2.2 Root Cause Chain

#### Step 1 — tmux attach-session fails inside node-pty

`resolveTerminalSetup` (`src/server/terminal-server.mts:130-177`) detects the socket and
returns:

```
command: "tmux", args: ["-S", <socketPath>, "attach-session", "-t", <sessionName>]
```

node-pty spawns this as a PTY child. `tmux attach-session` internally attempts to open a
client terminal device via `open(ctermfd, ...)`. In a devcontainer environment the socket
may point to a tmux server whose terminal-context expectations differ from what node-pty
provides (e.g., `$TERM` mismatch, terminal-size negotiation not aligned, or socket
namespace isolation). tmux prints its error to the PTY stdout:

```
open terminal failed: not a terminal
```

and exits with code 1.

#### Step 2 — tmux error output streams directly to the client before onExit fires

`wirePty` (`src/server/terminal-server.mts:294-339`) registers `onData` **unconditionally**
for all PTY output. The handler fires synchronously as tmux writes its error — before
`onExit` has any opportunity to classify the exit:

```typescript
// terminal-server.mts:295-302
currentPty.onData((data: string) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(Buffer.from(data, "utf8"));   // raw binary → xterm.js displays it
  }
});
```

There is no suppression, buffering, or classification of pre-exit PTY output. The tmux
error text lands in the xterm scroll buffer before the server knows the attach failed.

#### Step 3 — Fallback is silent from the client's perspective

When tmux exits with non-zero code, `wirePty`'s `onExit` handler
(`src/server/terminal-server.mts:309-331`) silently spawns a fallback shell:

```typescript
if (isTmux && exitCode !== 0 && ws.readyState === WebSocket.OPEN) {
  console.log("tmux attach failed, falling back to regular shell");
  // ...spawn fallbackPty, wire it...
}
```

No structured WebSocket message is sent to the client. The client has no way to know:
- That a fallback occurred
- What mode the terminal is now in
- That it should clear the tmux error text from the xterm buffer

#### Step 4 — "Connected" status is structurally misleading

`ws.onopen` fires on the WebSocket handshake, which completes **before** the async
`resolveTerminalSetup` + PTY spawn begins. The client sets `status = "connected"` and leaves
it there regardless of whether tmux attached or fell back.

The `TerminalStatus` type (`src/hooks/use-terminal.ts:5-10`) has no `"tmux-attaching"`,
`"shell"`, or `"tmux"` state values:

```typescript
export type TerminalStatus =
  | "disconnected" | "connecting" | "connected" | "reconnecting" | "failed";
```

#### Step 5 — No setup-state message protocol exists

CORE-COMPONENT-0003 defines binary frames for PTY I/O and JSON `{ type: "resize" }` /
`{ type: "error" }` for control. It does **not** define a `{ type: "setup" }` message.

The client `onmessage` handler (`src/hooks/use-terminal.ts:228-243`) only handles
`{ type: "error" }` for text frames. All other server-originated JSON types are silently
ignored.

---

## 3. Scope Classification

**`issue`** — This is a targeted bug fix. No new technology choices are required, and no
new cross-cutting architectural component is being introduced. The existing
CORE-COMPONENT-0003 protocol needs to be extended with a `setup` message type; this is a
spec update to an existing component, not a new one. No ADR is needed.

---

## 4. Affected Files and Components

| File | Role | Change Required |
|---|---|---|
| `src/server/terminal-server.mts` | PTY lifecycle, tmux detection, fallback | Send `{ type: "setup" }` after PTY spawn; send fallback notification before wiring fallback shell |
| `src/hooks/use-terminal.ts` | WebSocket client, status tracking | Handle `setup` messages; expose `terminalMode` + `isFallback`; call `term.clear()` on fallback |
| `src/components/terminal-panel.tsx` | Terminal UI, status rendering | Show session mode badge in header; show transient fallback notification |
| `src/server/terminal-server.test.ts` | Server unit tests | Add T23–T25 covering setup message emission and fallback notification |
| `project/architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md` | Protocol spec | Add `setup` message rules (server → client) |

---

## 5. Key Technical Findings

### 5.1 tmux error message mechanics

`open terminal failed: not a terminal` is emitted by tmux's client code when
`open(ctermfd, O_RDWR, 0)` fails on the controlling terminal path. This is a tmux-internal
check that runs at client startup before any session display. Under node-pty the PTY slave
IS a tty device, but in a shared devcontainer scenario the socket may point to a tmux server
whose environment expectations differ. The exit code is always 1 when this fails.

Critically: **tmux prints the error to its stdout (the PTY slave), not to a separate
stderr fd.** node-pty merges all PTY output into the `onData` callback, making
post-hoc filtering impossible without pre-exit buffering.

### 5.2 TMUX env var is already stripped correctly

`src/server/terminal-server.mts:274` correctly unsets `$TMUX` for tmux PTY sessions:

```typescript
const ptyEnv = setup.mode === "tmux" ? { ...env, TMUX: undefined } : env;
```

This avoids nested-session issues but does not address the `not a terminal` error, which
is about the terminal device initialisation, not session nesting.

### 5.3 Fallback mechanism is structurally correct — only the notification is missing

Test T22 (`src/server/terminal-server.test.ts:592-638`) confirms the fallback PTY is spawned
and the client remains connected. The spawn-and-wire mechanism works. The bug is entirely in
the **missing communication layer** between server and client about session-state transitions.

### 5.4 Existing `error` message type is insufficient for this case

The server already sends `{ type: "error", message }` when the initial `spawn()` throws
(`src/server/terminal-server.mts:376`). The client handles this correctly
(`src/hooks/use-terminal.ts:236`). However:
- This covers only spawn failures, not tmux post-spawn failures
- A tmux fallback is a **graceful downgrade**, not an application error; it must not
  show a red error overlay — an informational toast is correct per CORE-COMPONENT-0005

### 5.5 `setup` message is the minimal protocol extension required

Adding a server → client `{ type: "setup", mode: "tmux" | "shell", fallback?: true,
reason?: string }` JSON text frame enables:

1. **After PTY spawn**: client learns what mode is active and shows the mode badge
2. **On fallback**: client receives notification, calls `term.clear()` to erase tmux error
   noise, then shows a transient info notification
3. **Normal tmux case**: client shows a "tmux" badge in the terminal header

No binary framing changes are needed. The existing
`typeof event.data === "string"` branch in `onmessage`
(`src/hooks/use-terminal.ts:232-241`) is the correct handler location.

### 5.6 Timing of the setup message

The setup message must be sent **after** `pty` is assigned and `wirePty()` returns
(around `src/server/terminal-server.mts:355`) but **before** the pending message flush
(line 358). At that point the WebSocket is confirmed open (checked at line 271), the PTY is
live, and the client receives the mode notification before any terminal data arrives.

For the fallback path, the setup message must be sent **before**
`wirePty(fallbackPty, false)` so the client clears its buffer before the shell prompt
arrives.

### 5.7 `UseTerminalReturn` interface needs extension

Currently (`src/hooks/use-terminal.ts:17-25`):

```typescript
export interface UseTerminalReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  status: TerminalStatus;
  isConnected: boolean;
  error: string | null;
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  retry: () => void;
}
```

Needs two additions:
- `terminalMode: "unknown" | "tmux" | "shell"` — drives the header mode badge
- `isFallback: boolean` — drives the transient fallback notification

### 5.8 Terminal panel header is transport-status-only, not mode-aware

`src/components/terminal-panel.tsx` renders a header with label "Terminal" and a connection
status dot + label. It has no concept of session mode. A small mode badge in the header
("tmux" / "shell") provides persistent, non-intrusive session context.

---

## 6. Proposed Changes in Detail

### 6.1 Server (`src/server/terminal-server.mts`)

**A. Send setup message after successful PTY spawn**
Insert after `pendingMessages.length = 0` (currently line 361), before the `ws.on("close")`
registration:

```typescript
// Notify client of session mode
try {
  ws.send(JSON.stringify({ type: "setup", mode: setup.mode }));
} catch { /* send failed */ }
```

**B. Send fallback notification before spawning the fallback shell**
Insert at the top of the `isTmux && exitCode !== 0` branch
(currently line 309), before `activePtys.delete(currentPty)`:

```typescript
try {
  ws.send(JSON.stringify({
    type: "setup",
    mode: "shell",
    fallback: true,
    reason: "tmux-attach-failed",
  }));
} catch { /* send failed */ }
```

### 6.2 Hook (`src/hooks/use-terminal.ts`)

**A. Extend message type shape in `ws.onmessage`** (currently handles only `"error"`):

```typescript
const msg = JSON.parse(event.data) as {
  type?: string;
  message?: string;
  mode?: "tmux" | "shell";
  fallback?: boolean;
  reason?: string;
};
if (msg.type === "error") {
  setError(msg.message ?? "Unknown error");
} else if (msg.type === "setup") {
  setTerminalMode(msg.mode ?? "shell");
  if (msg.fallback) {
    setIsFallback(true);
    term.clear();   // erase tmux error noise before shell prompt arrives
  }
}
```

**B. Add new state variables** alongside `status` and `error`:

```typescript
const [terminalMode, setTerminalMode] = useState<"unknown" | "tmux" | "shell">("unknown");
const [isFallback, setIsFallback] = useState(false);
```

Reset both to initial values at the top of `connect()` alongside `setError(null)`:

```typescript
setTerminalMode("unknown");
setIsFallback(false);
```

**C. Extend `UseTerminalReturn`** interface and hook return value:

```typescript
export interface UseTerminalReturn {
  // ...existing fields...
  terminalMode: "unknown" | "tmux" | "shell";  // NEW
  isFallback: boolean;                          // NEW
}
```

### 6.3 Component (`src/components/terminal-panel.tsx`)

**A. Destructure new fields from `useTerminal`:**

```typescript
const { ..., terminalMode, isFallback } = useTerminal({ slug });
```

**B. Add mode badge to the header** (after the status dot/label):

```tsx
{terminalMode !== "unknown" && (
  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground uppercase tracking-wide">
    {terminalMode}
  </span>
)}
```

**C. Add fallback info overlay** (shown once; user dismisses by clicking into the terminal
or it auto-dismisses after ~3s):

```tsx
{isFallback && (
  <StatusOverlay>
    <span>tmux session unavailable — using shell</span>
  </StatusOverlay>
)}
```

Alternatively, a `toast.info(...)` call from `sonner` (per CORE-COMPONENT-0005 pattern) is
equally valid and avoids overlapping with terminal output.

### 6.4 CORE-COMPONENT-0003 update

Add to the **Rules** section:

```
- After the PTY is successfully spawned (and before flushing any pending input messages),
  the server MUST send a JSON text frame `{ type: "setup", mode: "tmux" | "shell" }` to
  the client to communicate the active session mode.
- When tmux attach exits with a non-zero code and the server falls back to a regular shell,
  the server MUST send `{ type: "setup", mode: "shell", fallback: true,
  reason: "tmux-attach-failed" }` before wiring the fallback PTY.
- The client MUST handle `setup` messages: update `terminalMode` state, and call
  `term.clear()` when `fallback: true` is received to erase any error output the failed
  tmux process may have written to the terminal buffer.
- The client MUST reset `terminalMode` to `"unknown"` and `isFallback` to `false` at the
  start of each `connect()` attempt.
```

Add to the **Interfaces** section:

```
- **Setup message (server → client):** `{ type: "setup", mode: "tmux" | "shell",
  fallback?: true, reason?: string }` — sent as a JSON text frame immediately after PTY
  spawn and on any session mode transition (e.g., tmux fallback to shell).
```

### 6.5 New tests required

**Server tests (`src/server/terminal-server.test.ts`)**:

| ID | Description |
|---|---|
| T23 | Shell-only connection → server sends `{ type: "setup", mode: "shell" }` as a text frame after PTY spawn |
| T24 | Tmux attach path → server sends `{ type: "setup", mode: "tmux" }` as a text frame after PTY spawn |
| T25 | Tmux exits with code 1 → server sends `{ type: "setup", mode: "shell", fallback: true, reason: "tmux-attach-failed" }` before fallback shell is wired; client remains connected |

**Hook/client tests** (jsdom environment, vitest):

| ID | Description |
|---|---|
| H-T1 | `setup` message with `mode: "tmux"` → `terminalMode` is `"tmux"` |
| H-T2 | `setup` message with `fallback: true` → `isFallback` is `true` and `term.clear()` is called |
| H-T3 | `terminalMode` resets to `"unknown"` on reconnect (new `connect()` call) |

---

## 7. CORE-COMPONENT-0003 Update Required

**Yes.** The current CORE-COMPONENT-0003 specification governs the WebSocket message
protocol. Adding `{ type: "setup" }` is a spec extension that must be captured in the
component document and recorded in DECISION-LOG.md.

Proposed new DECISION-LOG entry:

| # | Decision | Source | Date |
|---|---|---|---|
| 71 | Server MUST send `{ type: "setup", mode }` JSON text frame after PTY spawn; MUST send `{ type: "setup", mode: "shell", fallback: true }` when tmux attach fails; client MUST call `term.clear()` on fallback and reset mode state on each `connect()` | CORE-COMPONENT-0003 | 2025-07-19 |

---

## 8. Risks and Edge Cases

| Risk | Severity | Mitigation |
|---|---|---|
| `ws.send()` for setup message throws if WebSocket closes during async setup | Low | Wrap in `try/catch` — identical pattern to existing error send at `terminal-server.mts:376` |
| `term.clear()` called before `term.open()` completes | Low | `setup` message only arrives after WebSocket open; terminal is always open before first messages because `term.open(containerRef.current)` is called synchronously in `connect()` before the WebSocket is created |
| `isFallback` is sticky — stays `true` across a reconnect | Medium | Reset `isFallback = false` at top of `connect()` alongside `setError(null)` |
| Fallback info overlay overlaps the prompt and confuses the user | Low | Auto-dismiss after ~3s or on first keypress; `sonner` toast is a non-overlapping alternative |
| `term.clear()` erases legitimate output if `setup` message races with valid PTY data | Very Low | `setup` is sent before pending message flush and before `wirePty(fallbackPty)` — no legitimate output can arrive before `setup` in the fallback path |
| tmux attach succeeds, session ends normally (exit code 0) — must not trigger fallback | None | Existing guard `exitCode !== 0` at `terminal-server.mts:309` is already correct; no change needed |
| Stale `setup` messages from superseded connection generations | Low | Existing generation guard `gen !== generationRef.current` at `use-terminal.ts:229` already covers this in `onmessage` |
| tmux binary not on `$PATH` | None | `tmuxHasSession` returns `false` → `resolveTerminalSetup` returns shell mode before spawn; no fallback path is ever taken |

---

## 9. Dependencies on Existing Decisions

| Decision # | Statement | Relevance to Fix |
|---|---|---|
| 11 | Terminal sessions must be backed by real PTY processes via node-pty | Fix stays within this boundary; both tmux attach and fallback shell use node-pty |
| 12 | WebSocket endpoint at `/api/terminal` | No change to endpoint |
| 13 | PTY processes must be cleaned up when WebSocket connection closes | Fallback shell PTY is added to `activePtys` — cleanup already handled by `cleanupPty` |
| 24 | Server sends PTY output as binary WebSocket frames via `Buffer.from(data, 'utf8')` | Setup message is a JSON **text** frame, distinct from binary I/O frames; consistent with existing `error` message pattern |
| 44 | Detect `.devcontainer/.tmux-shared` for tmux vs shell decision | Root cause is in this decision's implementation path; fix keeps the same detection logic |
| 45 | Sanitize tmux session names using `[^a-zA-Z0-9_-]` replacement | No change needed |
| 46 | Fall back to regular shell if tmux attach fails | Fix makes this fallback visible to the client; the server-side mechanism is unchanged |
| 56 | Require `screenReaderMode: true` in Terminal constructor | No change; already present at `use-terminal.ts:112` |

---

## 10. Summary

The bug has three distinct manifestations caused by a single structural gap: **the server
never notifies the client about PTY/session setup-state transitions.**

1. **Raw tmux error text appears in the terminal** — `onData` streams all PTY output to
   the client with no hold-and-classify step during the window between process start and
   `onExit` firing. (`src/server/terminal-server.mts:295-302`)

2. **"Connected" header status is misleading** — it reflects WebSocket transport state
   (set in `ws.onopen`), not PTY/session readiness. Transport and session state are
   conflated.

3. **No session mode indicator** — users cannot tell whether the terminal is a tmux
   session or a plain fallback shell. No mode state exists anywhere in the data flow.

The fix is a **minimal protocol extension**: a JSON `{ type: "setup" }` message emitted
from the server at two points (post-PTY-spawn and on fallback transition), plus client
handling that updates mode state, calls `term.clear()` on fallback to erase error noise,
and surfaces a transient informational notification. CORE-COMPONENT-0003 must be updated
to document the new message type and client obligations. No new ADR is required.

**Total scope:** 4 source files modified, 1 core-component spec updated, 1 DECISION-LOG
entry added, ~8 new tests.
```
