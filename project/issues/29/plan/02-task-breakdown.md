# Task Breakdown: Issue #29

## Task T1: Resolve absent shared socket to system-default tmux

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0006

### Description

Update `src/server/terminal-server.mts` so `resolveTerminalSetup()` attempts
`tmux new-session -A -s <sanitizedSlug>` when the resolved project path exists but
`.devcontainer/.tmux-shared` is absent.

### Acceptance Criteria

- Existing shared-socket tmux attach behavior remains unchanged.
- Missing `.tmux-shared` returns a tmux spawn config using `new-session -A -s`.
- Empty sanitized tmux session names skip tmux and fall back to shell.
- Missing or invalid project paths still fall back to the configured default cwd.

### Test Coverage

- Add a test for absent `.tmux-shared` spawning system-default tmux.
- Add a test for empty sanitized session names falling back to shell.
- Existing T17, T19, T20, and T21 continue to pass.

---

## Task T2: Fall back to shell when tmux spawn throws

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005, CORE-COMPONENT-0006

### Description

Update `handleConnection()` so spawn-time errors for `setup.mode === "tmux"` trigger a
regular shell PTY fallback in `setup.cwd` instead of immediately sending an error and
closing the WebSocket.

### Acceptance Criteria

- Tmux spawn errors attempt one shell fallback in the resolved project directory.
- The WebSocket remains open when the fallback shell is spawned successfully.
- Existing non-tmux spawn failure behavior still sends the structured error message.
- If the fallback shell also fails, the connection closes with the existing failure path.

### Test Coverage

- Add a test where the first tmux spawn throws and the second shell spawn succeeds.
- Existing T8 still verifies shell spawn failures send an error.
- Existing tmux non-zero-exit fallback still passes.

---

## Task T3: Extend terminal server tests

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1, T2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0006

### Description

Add focused Vitest coverage in `src/server/terminal-server.test.ts` for Issue #29.

### Acceptance Criteria

- New tests cover system-default tmux creation/attach command selection.
- New tests cover tmux spawn-throws shell fallback.
- New tests cover system-default tmux non-zero exit shell fallback.
- New tests cover empty sanitized tmux session names.
- Mock setup remains isolated between tests.

### Test Coverage

- Add T23 through T26 or equivalent named cases.
- Run `npm run test -- src/server/terminal-server.test.ts`.

---

## Task T4: Document implementation result and verify

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T1, T2, T3
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0006

### Description

Create `project/issues/29/implementation/README.md` and run verification commands.

### Acceptance Criteria

- Implementation notes summarize changed behavior and tests.
- `npm run lint` passes.
- `npm run format:check` passes.
- `npm run build` passes.
- `npm run test` passes.

### Test Coverage

- Full configured verification suite passes.
