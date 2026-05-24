# Research Brief: Issue #37 — Copilot CLI Status Indicators on Open Project Tabs

## GitHub Issue

- **Issue:** #37
- **Title:** feat(sidebar): show Copilot CLI status indicators on open project tabs
- **URL:** https://github.com/jsburckhardt/devdeck/issues/37

## Scope Classification

- **scope_type:** `issue`
- **Rationale:** This is a targeted feature addition layered on top of the existing
  multi-project sidebar (CORE-COMPONENT-0007/0008) and WebSocket terminal
  (CORE-COMPONENT-0003). No new cross-cutting infrastructure is introduced; existing
  extension points (JSON text frame protocol, `useOpenProjects` context, sidebar tab
  rendering) are extended. One new ADR is needed to record the detection strategy
  selection. CORE-COMPONENT-0003 and CORE-COMPONENT-0008 require documentation updates.

## ADRs and Core-Components

- **New ADR required:** Yes — `ADR-0005-copilot-cli-status-detection-strategy.md`
  Rationale: Choosing among the four detection strategies is a cross-cutting
  architectural decision affecting the terminal server protocol, the hook API, and the
  sidebar rendering contract. It must be captured as an ADR.

- **CORE-COMPONENT-0003 update required:** Yes — extend with the new
  `{ type: "status", ... }` JSON text frame sent server-side and the corresponding
  `copilotStatus` field exposed on `useTerminal`'s return type.

- **CORE-COMPONENT-0008 update required:** Yes — extend the sidebar contract to define
  how per-project Copilot status is stored, propagated through
  `OpenProjectsProvider`/context, and rendered on sidebar tabs.

- **No new core-component required** — the detection, propagation, and rendering
  concerns are all extensions of existing components.

## Problem Statement

Users can keep multiple projects open in the left sidebar. Each project may have an
active terminal session running Copilot CLI. The sidebar currently only distinguishes
which project is the _active route_ (via `aria-current="page"` and a ring accent).
When Copilot CLI is waiting for input or actively processing in one of those project
terminals, the user has no way to notice without clicking into each project. The issue
asks for at least three states: **running/active**, **waiting for reply/input**, and
**idle**. The hard problem is _detection_, not rendering.

## Architecture and Documentation Findings

| Artifact | Finding |
|----------|---------|
| `src/components/project-sidebar.tsx` | Renders project tabs using only `openProjects` (slug + name + language). No terminal status plumbing. All visual state is derived from `pathname`. |
| `src/lib/open-projects-context.tsx` | `OpenProjectsProvider` owns the open project list and in-memory workspace state cache (`Map<slug, PerProjectWorkspaceState>`). Neither list includes any terminal status field. |
| `src/hooks/use-terminal.ts` | Returns `status: TerminalStatus` (WebSocket connection state) and `terminalMode`/`isFallback`. The `onmessage` handler already dispatches on `msg.type` for `"setup"` and `"error"`. This is the natural extension point for a new `"status"` frame type. |
| `src/server/terminal-server.mts` | Standalone ESM file, no `@/` imports. Owns PTY lifecycle, sends `{ type: "setup", mode }` and `{ type: "setup", fallback: true }` JSON text frames. The `wirePty` function's `onData` callback — where all PTY output flows through — is the natural interception point for output-pattern analysis. |
| `src/components/terminal-panel.tsx` | Consumes `useTerminal` locally. `status` is already rendered as a colored dot in the panel header. Does not propagate status to the sidebar. |
| `src/lib/types.ts` | `PerProjectWorkspaceState` has no terminal-status field. Adding one would allow the `OpenProjectsProvider` cache to hold cross-project status. |
| CORE-COMPONENT-0003 | Defines the JSON text frame protocol with two types: `setup` and `error`. Explicitly extensible — the server MAY add new frame types. |
| CORE-COMPONENT-0007 | Sidebar is a fixed-width flex sibling, 176px wide. Each tab shows a language-color badge + truncated name. Has room for a small status indicator (dot/icon). |
| CORE-COMPONENT-0008 | `PerProjectWorkspaceState` is the per-project cache shape. Adding `copilotStatus` here would let workspace state save/restore carry status across tab switches. |
| CORE-COMPONENT-0004 | All structural colors MUST use CSS custom properties with oklch. Status dot colors must comply. WCAG AA contrast is required. |
| CORE-COMPONENT-0005 | WebSocket close code 4401 = no reconnect. Max 3 reconnect attempts. Error states are surfaced in the terminal panel, not propagated globally. |
| Decision #84 | Terminal panels remain mounted even when collapsed/hidden — this is essential: a hidden project's terminal WebSocket is still alive and can emit status events. |

### Key Architectural Leverage Points

1. **Existing JSON text frame protocol** (`terminal-server.mts:364–454`, `use-terminal.ts:228–254`) —
   the server already sends control messages; adding `{ type: "status", copilotState: "..." }`
   is additive and non-breaking.

2. **`onData` callback in `wirePty`** (`terminal-server.mts:365–373`) — every byte of PTY
   output passes through here before being sent to the client. Pattern matching can be
   inserted here with zero client changes if using Strategy 1.

3. **`ws.onmessage` dispatch in `useTerminal`** (`use-terminal.ts:228–254`) — already
   switches on `msg.type`. Adding a `"status"` case is a one-line addition.

4. **Decision #84 (panels always mounted)** — guarantees that even non-active project
   terminals maintain their WebSocket connections, so status updates are received for all
   open projects simultaneously.

5. **`OpenProjectsProvider` workspace cache** (`open-projects-context.tsx:70`) — the
   in-memory `Map<slug, PerProjectWorkspaceState>` already caches cross-project state.
   Adding a `copilotStatus` field enables the sidebar to read status from the provider
   context rather than needing its own separate status store.

## Detection Strategy Analysis

### Strategy 1: PTY Output Inference (Server-Side Pattern Matching)

**Mechanism:** In `wirePty`'s `onData` callback, before sending PTY bytes to the client,
the server scans the raw output string for regular expressions that match known Copilot
CLI prompt patterns. On a pattern match, the server sends a `{ type: "status", copilotState }` JSON text frame to the WebSocket client.

**Known Copilot CLI output patterns (observed):**
- Waiting for input: `"> "` at end of output, or `"? "` prompts such as `"? Do you want to..."` 
- Active/thinking: spinner characters (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) or ANSI sequences for animated output
- Response streaming: lines of prose content being written
- Idle/completed: ANSI cursor-home + clear, or return to shell prompt (`$`, `%`, `#`, `❯`)

**Pros:**
- No external process queries; all information is already in the PTY stream
- Zero client-side changes required for detection (server emits status frames)
- Works for tmux and shell modes equally
- Single implementation point in `terminal-server.mts`
- Compatible with the existing binary + JSON text frame protocol

**Cons:**
- Copilot CLI output format is not a public API and may change between versions
- ANSI escape sequences complicate raw string matching (cursor movements pollute text)
- False positives if user runs scripts that emit similar patterns
- Stateful detection requires a small ring-buffer of recent bytes per session
- Raw PTY output includes terminal control codes that must be stripped/ignored first

**Reliability:** Medium — workable for well-known Copilot CLI patterns but fragile to
version changes or terminal multiplexer interference.

**Privacy:** No privacy concerns — output already flows through the server; no new data
is captured or stored.

**Implementation size:** Small. One regex scan function + one new JSON frame type.

---

### Strategy 2: Process/Session Inspection (Server-Side Process Tree Query)

**Mechanism:** The server periodically (e.g., every 2s) or on-demand inspects the
process tree rooted at the PTY's PID (`pty.pid`) using `ps` or `/proc` to detect
whether a Copilot-related process is a descendant. If `gh copilot` or `copilot` appears
as a child process, the status is "active." If the foreground process is the shell
itself, the status is "idle."

**Pros:**
- Completely independent of terminal output format
- Not broken by ANSI codes or Copilot CLI version changes
- Can distinguish between idle shell and any active program (not just Copilot)

**Cons:**
- Periodic polling adds server-side overhead and timer management per PTY session
- Process tree inspection is OS-specific (`ps -o pid,ppid,comm` on Linux/macOS differs)
- On tmux sessions, `pty.pid` is the tmux attach process, not the shell inside — child
  process detection requires traversing the full tmux session's process group
- Cannot detect sub-states (waiting vs. actively streaming) — only presence/absence
- `execFile('ps', ...)` per session every 2s scales poorly with many open projects
- Race conditions: process may exit between poll and frame send

**Reliability:** Medium for process presence/absence; Low for sub-state detection.

**Privacy:** No privacy concerns — only process names and PIDs are inspected.

**Implementation size:** Medium. Polling loop per connection, OS-specific process tree
traversal, tmux PID mapping complexity.

---

### Strategy 3: Explicit Terminal Control / Status Side-Channel (Protocol Extension)

**Mechanism:** Extend the existing JSON text frame protocol with a new server-to-client
frame type: `{ type: "status", copilotState: "idle" | "running" | "waiting" }`. The
server determines state transitions using a combination of Strategy 1 (output pattern
matching) and/or Strategy 2 (process inspection), then emits the status frame to the
client. The `useTerminal` hook adds a `copilotStatus` field to its return type. The
`TerminalPanel` propagates this status upward to `OpenProjectsProvider` (or a new
lightweight status context) so the sidebar can render it.

This strategy does not add _new detection logic_ — it formalizes the **communication
channel** for whatever detection mechanism is chosen, ensuring the client receives
structured status updates rather than inferring them from raw output.

**Pros:**
- Clean separation of concerns: detection is server-side, rendering is client-side
- Non-breaking: new frame type, existing `"setup"` and `"error"` types unchanged
- Protocol is already established; adding a new type requires only hook dispatch update
- Enables future detection strategy swaps without client changes
- Status is authoritative (server decides) rather than client-inferred

**Cons:**
- Requires server-side detection (Strategy 1 or 2) anyway — this is a transport, not
  a detection mechanism on its own
- Requires plumbing from `useTerminal` → `TerminalPanel` → `OpenProjectsProvider` →
  sidebar; this is the largest code surface area change

**Reliability:** Depends entirely on the underlying detection mechanism used server-side.

**Privacy:** No privacy concerns.

**Implementation size:** Medium (protocol plumbing). Pairs with Strategy 1 for the
smallest overall implementation.

---

### Strategy 4: User-Configured Command/Status Mapping

**Mechanism:** Users configure in a settings file (e.g., project-level or global
DevDeck config) a list of shell command name patterns and their associated status labels.
For example: `{ pattern: "gh copilot", state: "running" }`. The server reads this config
and uses process inspection (Strategy 2) or output matching (Strategy 1) driven by
user-supplied patterns rather than hard-coded ones. Alternatively, users configure
special shell prompt markers (e.g., a `PS1` segment) that signal state.

**Pros:**
- Not coupled to any specific tool's output format
- Allows DevDeck to generalize beyond Copilot CLI to any interactive CLI tool
- Future-proof against Copilot CLI version changes

**Cons:**
- Adds configuration surface area (new config file schema, parser, validation)
- Most single-user dev tool users will not configure this — zero UX out of the box
- Config file adds a new persistence mechanism (currently only `registry.json` and
  `localStorage` exist)
- Requires the user to understand PTY internals to write effective patterns
- Still requires one of Strategy 1 or 2 as the underlying detection engine
- Significant scope expansion for an issue described as focused on Copilot CLI

**Reliability:** Depends on user configuration quality; unreliable by default.

**Privacy:** No privacy concerns. Config stays local.

**Implementation size:** Large. New config schema, parsing, validation, and runtime
injection into the terminal server.

---

## Strategy Comparison Matrix

| Criterion | Strategy 1: PTY Output | Strategy 2: Process Inspect | Strategy 3: Protocol Channel | Strategy 4: User Config |
|-----------|------------------------|----------------------------|------------------------------|------------------------|
| Detects Copilot states | ✅ (pattern-dependent) | ⚠️ (presence only) | ✅ (transport only) | ⚠️ (config-dependent) |
| Fragility to CLI changes | High | Low | Depends on 1/2 | Low |
| Implementation complexity | Low | Medium | Medium (combines with 1) | High |
| Scalability (many projects) | ✅ (event-driven) | ❌ (polling overhead) | ✅ | ✅ |
| Sub-state detection (wait vs. run) | ✅ | ❌ | ✅ (via 1) | ⚠️ |
| tmux compatibility | ✅ | ❌ complex | ✅ | ⚠️ |
| Privacy | ✅ | ✅ | ✅ | ✅ |
| Maintainability | Medium | Low | High | Medium |
| Out-of-box UX | ✅ | ✅ | ✅ | ❌ |

---

## Recommended Strategy

**Recommended: Strategy 1 + Strategy 3 combined, with conservative "unknown" fallback.**

**Rationale:**

1. **Strategy 3 (protocol extension) is mandatory regardless of detection approach** —
   it formalizes the communication path from server to client to sidebar without
   coupling the sidebar to raw PTY output. The existing `{ type: "setup" }` precedent
   proves this pattern works well.

2. **Strategy 1 (PTY output inference) is the pragmatic detection engine** because:
   - All PTY output already flows through `wirePty`'s `onData` — no new I/O required
   - Event-driven (not polling) — scales to many open projects without overhead
   - Can detect sub-states (waiting for input vs. actively streaming) via distinct patterns
   - tmux output passes through the same `onData` callback transparently
   - Implementation is a single pattern-scan function with a small ring buffer

3. **Strategy 2 is rejected** for the primary path because it requires OS-specific
   polling that is unreliable in tmux mode (pty.pid is the tmux attach process, not
   the shell inside the session), and cannot distinguish sub-states.

4. **Strategy 4 is deferred** — configurable patterns are a valid future enhancement
   once the core detection is stable. The implementation should leave a hook point
   (a replaceable `detectCopilotState(output: string): CopilotCliState | null` function)
   for this.

**Conservative fallback rule:** If no pattern matches within a configurable idle timeout
(e.g., 30 seconds of no Copilot CLI output), the status MUST revert to `"idle"` (shell
prompt visible). The sidebar MUST NOT show misleading status — prefer `"idle"` over
stale `"running"`. The initial state before any Copilot CLI activity is detected is
`"idle"` (no indicator shown, or a neutral indicator).

**Proposed `CopilotCliState` type:**
```typescript
export type CopilotCliState = "idle" | "running" | "waiting";
