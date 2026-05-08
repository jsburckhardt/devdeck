# Task Breakdown — Issue #15

## Task 1: Update CORE-COMPONENT-0003 with slug and tmux rules

- **Status:** Done
- **Complexity:** Low
- **Dependencies:** None

### Acceptance Criteria
- CORE-COMPONENT-0003 contains 6 new rules covering slug, CWD resolution, tmux detection, sanitization, tmux fallback, and homedir default
- WebSocket endpoint interface updated
- DECISION-LOG.md updated with 5 new decision records (#42–#46)

---

## Task 2: Update terminal-server.mts with per-connection CWD and tmux support

- **Status:** Not started
- **Complexity:** High
- **Dependencies:** Task 1

### Description
Modify the connection handler to support per-connection CWD resolution and tmux session attachment.

### Acceptance Criteria
- Connection with `?slug=my-project` resolves CWD via `resolveProjectPath`
- Connection without `slug` uses `homedir()` (backward compatible)
- `.devcontainer/.tmux-shared` detection spawns tmux instead of shell
- Failed tmux spawn falls back to regular shell in project CWD
- Invalid/missing resolved path falls back to `homedir()`
- Slug sanitized before use as tmux session name

---

## Task 3: Update use-terminal.ts with slug option

- **Status:** Not started
- **Complexity:** Low
- **Dependencies:** None

### Acceptance Criteria
- `UseTerminalOptions` has `slug?: string` field
- `buildWsUrl(slug)` appends `?slug=<encoded>` when slug is provided
- The `connect` callback re-runs when slug changes

---

## Task 4: Update terminal-panel.tsx with slug prop

- **Status:** Not started
- **Complexity:** Low
- **Dependencies:** Task 3

### Acceptance Criteria
- `TerminalPanel` accepts optional `slug` prop
- `slug` is forwarded to `useTerminal({ slug })`

---

## Task 5: Update workspace-layout.tsx to pass slug

- **Status:** Not started
- **Complexity:** Low
- **Dependencies:** Task 4

### Acceptance Criteria
- `<TerminalPanel slug={project.slug} />` is rendered

---

## Task 6: Write terminal-server tests (T16–T21)

- **Status:** Not started
- **Complexity:** High
- **Dependencies:** Task 2

### Test Cases
- T16: slug → resolveProjectPath → PTY with resolved CWD
- T17: .devcontainer/.tmux-shared exists → tmux spawned
- T18: no slug → homedir (backward compat)
- T19: resolved path missing → homedir fallback
- T20: tmux spawn fails → shell fallback
- T21: tmux session name sanitized

---

## Task 7: Write use-terminal tests (T20–T21)

- **Status:** Not started
- **Complexity:** Low
- **Dependencies:** Task 3

### Test Cases
- T20: slug option → WS URL contains slug param
- T21: no slug → WS URL has no slug param

---

## Task 8: Verify all existing tests pass

- **Status:** Not started
- **Complexity:** Low
- **Dependencies:** Tasks 2–7
