# Research Brief - Issue #29: Tmux Session Fallback

## Metadata

| Field | Value |
|-------|-------|
| Issue | GitHub Issue #29 |
| Title | If no .tmux-shared exists, create tmux session named after repo; fallback to repo shell |
| scope_type | `core_component` |
| ADR required | No |
| Core-component change required | Yes - CORE-COMPONENT-0003 (WebSocket Terminal Communication) |
| Stage | Research -> Plan |

## 1. Problem Statement

When opening a project terminal, DevDeck should prefer a tmux-backed session even when
the shared devcontainer tmux socket (`<repo>/.devcontainer/.tmux-shared`) is not present.
Today the server immediately opens a regular shell whenever that socket is missing.

Requested behavior:

1. If `.tmux-shared` exists and the expected session exists, attach to it (unchanged).
2. If `.tmux-shared` does not exist, try to create or attach to a system-default tmux
   session named after the repo/project (`tmux new-session -A -s <sanitizedSlug>`).
3. If tmux is unavailable or cannot start, fall back to a regular login shell in the
   repo path.

## 2. Codebase Inspection

### 2.1 Primary implementation file

`src/server/terminal-server.mts` owns the server-side terminal session behavior.

| Symbol | Role |
|--------|------|
| `sanitizeSlug()` | Strips non-`[a-zA-Z0-9_-]` characters from project slugs. |
| `tmuxSessionName()` | Calls `sanitizeSlug()` and caps names at 64 characters. |
| `tmuxHasSession()` | Runs `tmux -S <socket> has-session -t <session>` and returns a boolean. |
| `resolveTerminalSetup()` | Selects the PTY command, args, cwd, and mode for a connection. |
| `wirePty()` | Wires PTY I/O and already falls back to a shell when tmux exits non-zero. |
| `handleConnection()` | Resolves setup, spawns the PTY, and catches spawn-time failures. |

Current tmux dispatch logic:

```typescript
const tmuxSocketPath = path.join(resolvedCwd, ".devcontainer", ".tmux-shared");
try {
  const socketStat = await fs.stat(tmuxSocketPath);
  if (socketStat.isSocket()) {
    const sessionName = tmuxSessionName(slug);
    if (sessionName && (await tmuxHasSession(tmuxSocketPath, sessionName))) {
      return {
        command: "tmux",
        args: ["-S", tmuxSocketPath, "attach-session", "-t", sessionName],
        cwd: resolvedCwd,
        mode: "tmux",
      };
    }
  }
} catch {
  // No tmux socket - fall through to regular shell
}

return { command: shell, args: shellArgs, cwd: resolvedCwd, mode: "shell" };
```

Observed outcomes today:

| Condition | Result |
|-----------|--------|
| `.tmux-shared` is a socket and `tmuxHasSession()` succeeds | Spawns `tmux -S <socket> attach-session -t <slug>`. |
| `.tmux-shared` is a socket but the session is absent | Falls through to a shell. |
| `.tmux-shared` does not exist | The `fs.stat()` error is swallowed and the server falls through to a shell. |

Issue #29 targets the missing-socket case: it should attempt a system-default tmux
session before falling back to a shell.

### 2.2 Spawn-failure behavior

Two failure paths matter for the requested fallback:

| Path | Trigger | Current behavior |
|------|---------|------------------|
| PTY exit path in `wirePty()` | tmux starts but exits non-zero | Already falls back to a shell. |
| Spawn-throws path in `handleConnection()` | `spawn("tmux", ...)` throws, for example ENOENT when tmux is unavailable | Sends an error and closes the WebSocket. |

The spawn-throws path must be extended for tmux setup so "tmux unavailable" still falls
back to a shell.

### 2.3 Existing documentation contract

`CORE-COMPONENT-0003-websocket-terminal.md` currently states:

> If `<resolvedCwd>/.devcontainer/.tmux-shared` exists, the server SHOULD spawn
> `tmux -S <socketPath> attach-session -t <sanitizedSlug>` instead of a login shell.

`DECISION-LOG.md` Decision 44 currently states:

> Detect `.devcontainer/.tmux-shared` to decide between tmux attach and fresh shell spawn.

Both describe a binary decision: shared socket means tmux, otherwise shell. Issue #29
changes this global WebSocket Terminal Communication contract to a three-branch decision
tree: shared-socket tmux, system-default tmux, then login shell fallback.

### 2.4 Tests

`src/server/terminal-server.test.ts` already contains direct coverage for:

| Scenario | Existing coverage |
|----------|-------------------|
| Shared tmux socket and session exist | Attach via `tmux -S <socket> attach-session`. |
| Shared socket exists but session is absent | Fall back to a shell. |
| Slug sanitization before tmux session use | Sanitized session name is passed to tmux. |
| tmux PTY exits non-zero | Fallback shell is spawned. |
| Resolved project path is missing | Default cwd shell is spawned. |

Additional tests are needed for the no-shared-socket system tmux branch and spawn-throws
fallback behavior.

### 2.5 Frontend

`src/hooks/use-terminal.ts` already sends `slug`, `cols`, and `rows` in the WebSocket URL.
No frontend change is required.

## 3. Scope Classification

`scope_type: core_component`

Rationale: the behavior is explicitly captured by CORE-COMPONENT-0003 and Decision 44 in
the decision log. Changing how terminal sessions choose between tmux and shell modifies the
global WebSocket Terminal Communication contract.

ADR required: no. This extends an existing tmux CLI integration and does not introduce a
new technology or architectural direction.

Core-component change required: yes. CORE-COMPONENT-0003 and DECISION-LOG.md must be
updated during the Plan stage before implementation.

## 4. Change Surfaces

### 4.1 `src/server/terminal-server.mts` - `resolveTerminalSetup()`

Replace the missing-socket fall-through with a system-default tmux attempt:

```typescript
} catch {
  const sessionName = tmuxSessionName(slug);
  if (sessionName) {
    return {
      command: "tmux",
      args: ["new-session", "-A", "-s", sessionName],
      cwd: resolvedCwd,
      mode: "tmux",
    };
  }
}
```

`tmux new-session -A -s <name>` creates the named session when absent and attaches to it
when it already exists. If the sanitized session name is empty, the server should fall
through to the regular shell path.

### 4.2 `src/server/terminal-server.mts` - spawn-throws fallback

When `handleConnection()` catches a spawn error for `setup.mode === "tmux"`, it should
attempt a regular shell PTY in the same cwd instead of closing the WebSocket immediately.
If the fallback shell also fails, keep the existing error/close behavior.

The planner should commit to one of two viable designs:

1. Catch-and-fallback in `handleConnection()`.
2. Pre-check tmux availability in `resolveTerminalSetup()` before returning a system-tmux
   setup.

Catch-and-fallback is the narrower change because it also covers shared-socket tmux spawn
failures.

### 4.3 `CORE-COMPONENT-0003-websocket-terminal.md`

Update the tmux rule to describe:

1. Shared socket exists and session exists: attach via
   `tmux -S <socketPath> attach-session -t <sanitizedSlug>`.
2. Shared socket is absent: attempt
   `tmux new-session -A -s <sanitizedSlug>` on the system default socket.
3. tmux attach/create fails or tmux is unavailable: fall back to a login shell in the
   resolved project directory.

### 4.4 `project/architecture/ADR/DECISION-LOG.md`

Update Decision 44 and add a new decision entry recording the system-default tmux branch.

## 5. Test Recommendations

Add tests in `src/server/terminal-server.test.ts`:

| Test | Scenario | Key assertions |
|------|----------|----------------|
| T23 | `.tmux-shared` absent | `spawn("tmux", ["new-session", "-A", "-s", <sanitizedSlug>])` is used. |
| T24 | `.tmux-shared` absent and tmux spawn throws | A shell PTY is spawned and the WebSocket remains open. |
| T25 | `.tmux-shared` absent and system tmux exits non-zero | Existing `wirePty()` fallback spawns a shell. |
| T26 | Slug sanitizes to an empty tmux session name | The server skips tmux and spawns a shell. |

Existing tmux tests should remain valid.

## 6. Proposed Plan-Stage Outputs

1. Update CORE-COMPONENT-0003 and DECISION-LOG.md to document the three-branch tmux
   decision tree.
2. Patch `resolveTerminalSetup()` to return a system-default tmux setup when the shared
   socket is absent and the sanitized session name is non-empty.
3. Patch spawn-time error handling so tmux spawn failures fall back to a shell before
   closing the WebSocket.
4. Add unit tests covering the new branch and fallback behavior.

## 7. Gaps and Uncertainties

| Gap | Recommendation |
|-----|----------------|
| Spawn-throws fallback design | Prefer catch-and-fallback in `handleConnection()` because it covers both shared-socket and system-default tmux spawn failures. |
| `.tmux-shared` exists but is not a socket | Leave unchanged; issue #29 only addresses absent shared socket. |
| System tmux session visibility | Note in CORE-COMPONENT-0003 that system-default sessions are visible to processes for the same host user. |
| Session name collisions | No new decision needed; existing sanitization behavior already governs tmux names. |
