# Test Plan: Issue #29

## Test TP1: Absent shared socket uses system-default tmux

- **Type:** Server unit test
- **Task:** T1
- **Priority:** High

### Setup

Mock project path resolution by registering `/workspaces/system-tmux` as a directory and
do not register `/workspaces/system-tmux/.devcontainer/.tmux-shared`.

### Steps

1. Connect to the terminal WebSocket with `slug=system-tmux`.
2. Wait for setup to complete.
3. Inspect the latest `node-pty.spawn` call.

### Expected Result

The server spawns `tmux` with args containing `new-session`, `-A`, `-s`, and
`system-tmux`, using `/workspaces/system-tmux` as cwd.

---

## Test TP2: Tmux spawn throw falls back to shell

- **Type:** Server unit test
- **Task:** T2
- **Priority:** High

### Setup

Use the absent shared-socket setup. Mock the first `node-pty.spawn` call to throw and the
second call to return a fake PTY.

### Steps

1. Connect to the terminal WebSocket with a project slug.
2. Wait for setup and fallback.
3. Inspect the first and second spawn calls.

### Expected Result

The first call attempts `tmux`. The second call uses the configured shell with the same
resolved project cwd. The WebSocket remains open.

---

## Test TP3: System-default tmux exit falls back to shell

- **Type:** Server unit test
- **Task:** T2
- **Priority:** High

### Setup

Use the absent shared-socket setup and let the initial tmux PTY spawn successfully.

### Steps

1. Connect to the terminal WebSocket with a project slug.
2. Verify the first spawn call uses system-default tmux.
3. Emit a non-zero exit from the fake tmux PTY.
4. Inspect the latest spawn call.

### Expected Result

The server spawns a shell fallback in the resolved project cwd and keeps the WebSocket open.

---

## Test TP4: Empty sanitized slug skips tmux

- **Type:** Server unit test
- **Task:** T1
- **Priority:** Medium

### Setup

Use a slug that sanitizes to an empty string.

### Steps

1. Connect to the terminal WebSocket with the unsafe slug.
2. Wait for setup.
3. Inspect the latest spawn call.

### Expected Result

The server does not spawn `tmux`; it falls back to the configured default cwd shell.

---

## Test TP5: Existing shared-socket behavior is unchanged

- **Type:** Regression test
- **Task:** T1
- **Priority:** High

### Setup

Use the existing shared-socket test setup where `.tmux-shared` is a socket and
`tmuxHasSession()` succeeds.

### Steps

1. Run the existing terminal server tmux tests.
2. Inspect the shared-socket spawn command.

### Expected Result

The server still spawns `tmux -S <socketPath> attach-session -t <sanitizedSlug>`.

---

## Test TP6: Full verification suite

- **Type:** Verification
- **Task:** T4
- **Priority:** High

### Steps

1. Run `npm run lint`.
2. Run `npm run format:check`.
3. Run `npm run build`.
4. Run `npm run test`.

### Expected Result

All commands pass.
