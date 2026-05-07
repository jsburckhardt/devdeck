# Test Plan — Issue #15

## Server Tests (terminal-server.test.ts)

### T16: slug in URL resolves project CWD
- Mock `resolveProjectPath("my-project")` → `/workspaces/my-project`
- Mock `fs.access` to succeed for project dir, reject for tmux socket
- Connect with `?slug=my-project`
- Expect `node-pty.spawn` with `cwd: "/workspaces/my-project"`

### T17: tmux shared session detected and spawned
- Mock `resolveProjectPath("tmux-proj")` → `/workspaces/tmux-proj`
- Mock `fs.access` to succeed for both project dir and `.devcontainer/.tmux-shared`
- Connect with `?slug=tmux-proj`
- Expect `node-pty.spawn` with `"tmux"` command, `-S` socket path, `-t` session name

### T18: no slug falls back to homedir
- Connect without `slug` param
- Expect `resolveProjectPath` NOT called
- Expect `node-pty.spawn` with `cwd: os.homedir()`

### T19: resolved path doesn't exist falls back to homedir
- Mock `resolveProjectPath("missing")` → `/workspaces/missing`
- Mock `fs.access` to throw ENOENT
- Connect with `?slug=missing`
- Expect `node-pty.spawn` with `cwd: os.homedir()`

### T20: tmux spawn fails falls back to shell
- Mock tmux socket to exist
- Configure fake PTY to exit immediately with non-zero code
- Expect second `spawn` call with regular shell and project CWD

### T21: tmux session name sanitized
- Connect with slug containing special characters
- Expect tmux `-t` argument sanitized to `[a-zA-Z0-9_-]` only

## Client Tests (use-terminal.test.ts)

### T20: slug option appends slug to WS URL
- Render `useTerminal({ slug: "my-proj" })`
- Expect WebSocket URL contains `?slug=my-proj`

### T21: no slug means no slug param in URL
- Render `useTerminal()` with no slug
- Expect WebSocket URL does NOT contain `slug=`

## Coverage Requirements

| File | Target |
|------|--------|
| `src/server/terminal-server.mts` | 80%+ |
| `src/hooks/use-terminal.ts` | 80%+ |
