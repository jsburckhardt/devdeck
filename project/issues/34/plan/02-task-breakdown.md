# Task Breakdown — Issue #34: tmux attach failure fix

## Task 1: Server — Send `setup` message after PTY spawn and on tmux fallback

- **Status:** Not started
- **Complexity:** Small
- **Dependencies:** None
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005

### Description
Add two `ws.send()` calls in `src/server/terminal-server.mts`:

**A. After successful PTY spawn (around line 355, after `wirePty` but before pending message flush):**
```typescript
try {
  ws.send(JSON.stringify({ type: "setup", mode: setup.mode }));
} catch { /* send failed */ }
```

**B. In the tmux fallback branch (line 309, inside `isTmux && exitCode !== 0` block, before spawning fallback PTY):**
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

Both sends use `try/catch` consistent with the existing error send pattern at line 376.

### Acceptance Criteria
- [ ] After PTY spawn, server sends `{ type: "setup", mode: "<mode>" }` as a JSON text frame before flushing pending messages
- [ ] When tmux attach fails (non-zero exit), server sends `{ type: "setup", mode: "shell", fallback: true, reason: "tmux-attach-failed" }` before spawning the fallback shell
- [ ] Both sends are wrapped in `try/catch` to handle closed WebSocket gracefully
- [ ] Existing behavior (PTY I/O, fallback spawn, cleanup) is unchanged

### Test Coverage
- T23: Shell connection → server sends `{ type: "setup", mode: "shell" }` text frame
- T24: Tmux connection → server sends `{ type: "setup", mode: "tmux" }` text frame
- T25: Tmux exit code 1 → server sends fallback setup message before fallback shell is wired

---

## Task 2: Hook — Handle `setup` messages, expose `terminalMode` and `isFallback`

- **Status:** Not started
- **Complexity:** Small
- **Dependencies:** Task 1
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
Modify `src/hooks/use-terminal.ts`:

**A. Add new state variables** (alongside `status` and `error`):
```typescript
const [terminalMode, setTerminalMode] = useState<"unknown" | "tmux" | "shell">("unknown");
const [isFallback, setIsFallback] = useState(false);
```

**B. Reset state at the top of `connect()`** (alongside `setError(null)`):
```typescript
setTerminalMode("unknown");
setIsFallback(false);
```

**C. Extend `ws.onmessage` handler** — in the `typeof event.data === "string"` branch, after parsing JSON, add a handler for `type: "setup"`:
```typescript
if (msg.type === "setup") {
  setTerminalMode(msg.mode ?? "shell");
  if (msg.fallback) {
    setIsFallback(true);
    term.clear();
  }
}
```

**D. Extend `UseTerminalReturn` interface and return value:**
```typescript
terminalMode: "unknown" | "tmux" | "shell";
isFallback: boolean;
```

### Acceptance Criteria
- [ ] `UseTerminalReturn` exports `terminalMode` (default `"unknown"`) and `isFallback` (default `false`)
- [ ] On receiving `{ type: "setup", mode: "tmux" }`, `terminalMode` updates to `"tmux"`
- [ ] On receiving `{ type: "setup", mode: "shell", fallback: true }`, `isFallback` is `true` and `term.clear()` is called
- [ ] `terminalMode` resets to `"unknown"` and `isFallback` resets to `false` on each new `connect()` call
- [ ] Existing `error` message handling is unchanged
- [ ] Stale generation messages are still rejected (existing `gen !== generationRef.current` guard)

### Test Coverage
- H-T1: Setup message with `mode: "tmux"` → `terminalMode` is `"tmux"`
- H-T2: Setup message with `fallback: true` → `isFallback` is `true`, `term.clear()` called
- H-T3: `terminalMode` resets to `"unknown"` on reconnect

---

## Task 3: Component — Mode badge and fallback notification

- **Status:** Not started
- **Complexity:** Small
- **Dependencies:** Task 2
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005

### Description
Modify `src/components/terminal-panel.tsx`:

**A. Destructure new fields from `useTerminal`:**
```typescript
const { ..., terminalMode, isFallback } = useTerminal({ slug });
```

**B. Add mode badge in header** (after the status dot/label div, inside the header bar):
```tsx
{terminalMode !== "unknown" && (
  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground uppercase tracking-wide">
    {terminalMode}
  </span>
)}
```

**C. Add fallback notification** — a transient informational overlay or toast shown when `isFallback` is `true`. The notification should auto-dismiss after ~3 seconds or use `sonner` toast per CORE-COMPONENT-0005 pattern. A simple approach:
```tsx
{isFallback && (
  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 rounded bg-yellow-900/90 px-3 py-1 text-xs text-yellow-200">
    tmux session unavailable — using shell
  </div>
)}
```
Use an `useEffect` with a 3-second timer to auto-dismiss by setting a local `showFallbackNotice` state.

### Acceptance Criteria
- [ ] When `terminalMode` is `"tmux"` or `"shell"`, a mode badge appears in the terminal header
- [ ] When `terminalMode` is `"unknown"`, no badge is rendered
- [ ] When `isFallback` is `true`, a transient notification is shown (auto-dismisses after ~3s)
- [ ] Badge and notification use existing design tokens (`bg-muted`, `text-muted-foreground`, etc.)
- [ ] Existing status overlays (connecting, reconnecting, failed, unauthorized) are unchanged

### Test Coverage
- C-T1: Mode badge renders when `terminalMode` is `"shell"` or `"tmux"`
- C-T2: Mode badge does not render when `terminalMode` is `"unknown"`
- C-T3: Fallback notification appears when `isFallback` is `true`
- C-T4: Fallback notification auto-dismisses after timeout

---

## Task 4: Server tests — T23, T24, T25

- **Status:** Not started
- **Complexity:** Small
- **Dependencies:** Task 1
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
Add three tests to `src/server/terminal-server.test.ts`, following the existing test patterns (using `createFakePty`, `createServer`, `connectClientWithSlug`, and `tick()` helpers):

**T23** — Shell-only connection sends `{ type: "setup", mode: "shell" }`:
- Connect without tmux socket → wait for text frame → parse JSON → assert `type === "setup"` and `mode === "shell"`

**T24** — Tmux attach path sends `{ type: "setup", mode: "tmux" }`:
- Set up tmux socket mocks → connect with slug → wait for text frame → assert `mode === "tmux"`

**T25** — Tmux exit code 1 sends fallback setup message:
- Set up tmux socket mocks → connect → trigger `fakePty._emitExit(1, 0)` → capture text frames → assert `{ type: "setup", mode: "shell", fallback: true, reason: "tmux-attach-failed" }` is received → assert client is still connected

### Acceptance Criteria
- [ ] T23 passes: shell connection receives setup message with `mode: "shell"`
- [ ] T24 passes: tmux connection receives setup message with `mode: "tmux"`
- [ ] T25 passes: tmux failure sends fallback setup message, client remains open
- [ ] All existing tests continue to pass

### Test Coverage
- Self-referential: these ARE the tests for Task 1

---

## Task 5: Hook tests — H-T1, H-T2, H-T3

- **Status:** Not started
- **Complexity:** Small
- **Dependencies:** Task 2
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
Add three tests to `src/hooks/use-terminal.test.ts`, using the existing `MockWS`, `fakeTerminal`, and `renderHook` test infrastructure:

**H-T1** — Setup message with `mode: "tmux"` updates `terminalMode`:
- Render hook → get WS → call `onopen` → call `onmessage` with `JSON.stringify({ type: "setup", mode: "tmux" })` as string data → assert `result.current.terminalMode === "tmux"`

**H-T2** — Fallback setup message sets `isFallback` and clears terminal:
- Render hook → get WS → call `onopen` → call `onmessage` with `{ type: "setup", mode: "shell", fallback: true }` → assert `result.current.isFallback === true` and `fakeTerminal.clear` was called (need to add `clear` mock to `fakeTerminal`)

**H-T3** — Mode resets on reconnect:
- Render hook → set `terminalMode` to `"tmux"` via setup message → trigger close → wait for reconnect → assert `terminalMode` resets to `"unknown"`

### Acceptance Criteria
- [ ] H-T1 passes: `terminalMode` updates to `"tmux"` on setup message
- [ ] H-T2 passes: `isFallback` is `true` and `term.clear()` called on fallback
- [ ] H-T3 passes: mode state resets on reconnect
- [ ] `fakeTerminal` mock includes a `clear` mock function
- [ ] All existing hook tests continue to pass

### Test Coverage
- Self-referential: these ARE the tests for Task 2

---

## Task 6: Component tests — Mode badge and fallback UI

- **Status:** Not started
- **Complexity:** Small
- **Dependencies:** Task 3
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005

### Description
Create `src/components/terminal-panel.test.tsx` with tests for the new UI elements. Mock `useTerminal` to control return values:

**C-T1** — Mode badge renders for known modes:
- Mock `useTerminal` returning `terminalMode: "shell"` → render `TerminalPanel` → assert badge text "shell" is present

**C-T2** — Mode badge hidden for unknown:
- Mock `useTerminal` returning `terminalMode: "unknown"` → assert no badge element

**C-T3** — Fallback notification appears:
- Mock `useTerminal` returning `isFallback: true` → assert "tmux session unavailable" text present

**C-T4** — Fallback notification auto-dismisses:
- Mock `useTerminal` returning `isFallback: true` → advance timers by 3s → assert notification gone

### Acceptance Criteria
- [ ] C-T1 passes: badge visible for `"shell"` and `"tmux"` modes
- [ ] C-T2 passes: no badge for `"unknown"` mode
- [ ] C-T3 passes: fallback notification shown
- [ ] C-T4 passes: notification auto-dismisses after timeout
- [ ] Tests properly mock `useTerminal` hook

### Test Coverage
- Self-referential: these ARE the tests for Task 3
