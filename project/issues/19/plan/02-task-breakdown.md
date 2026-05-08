# Task Breakdown — Issue #19: Terminal Input Issues

## Task 1: Add ClipboardAddon and Ctrl+V paste handler

- **Status:** TODO
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
Install `@xterm/addon-clipboard` as a dependency. In `src/hooks/use-terminal.ts`, import `ClipboardAddon`, load it on the terminal instance alongside the other addons. Register a `customKeyEventHandler` on the terminal that intercepts Ctrl+V (and Cmd+V on macOS) keydown events, calls `navigator.clipboard.readText()`, and pipes the result into `term.paste()`. Return `false` from the handler to prevent xterm's default handling of Ctrl+V.

### Acceptance Criteria
- [ ] `@xterm/addon-clipboard` is listed in `package.json` dependencies
- [ ] `ClipboardAddon` is imported dynamically and loaded via `term.loadAddon()`
- [ ] `customKeyEventHandler` intercepts Ctrl+V (keydown, `ctrlKey && key === 'v'`) and Cmd+V (`metaKey && key === 'v'`)
- [ ] Handler calls `navigator.clipboard.readText()` and feeds result to `term.paste()`
- [ ] Handler returns `false` for Ctrl+V/Cmd+V to suppress default xterm behavior
- [ ] Handler returns `true` for all other key events

### Test Coverage
- [ ] T22: Verify `ClipboardAddon` is loaded via `term.loadAddon()`
- [ ] T23: Verify `customKeyEventHandler` is registered on the terminal

---

## Task 2: Enable screenReaderMode for accessibility input

- **Status:** TODO
- **Complexity:** Low
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
Add `screenReaderMode: true` to the Terminal constructor options object in `src/hooks/use-terminal.ts`. The prerequisite `allowProposedApi: true` is already set. This enables proper ARIA attributes on the hidden textarea, allowing Windows voice-to-text (Win+H) and IME input methods to work.

### Acceptance Criteria
- [ ] Terminal constructor includes `screenReaderMode: true`
- [ ] `allowProposedApi: true` remains set (already present)
- [ ] No other Terminal options are changed

### Test Coverage
- [ ] T24: Verify Terminal constructor is called with `screenReaderMode: true`

---

## Task 3: Fix PTY dimension race condition

- **Status:** TODO
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
Fix the dimension race condition that causes tab completion duplication. Two changes required:

**Client (`src/hooks/use-terminal.ts`):**
1. Move `term.onResize()` registration to BEFORE the `fitAddon.fit()` call (currently registered ~126 lines later at line 249)
2. Include `cols` and `rows` as query params in the WebSocket URL: update `buildWsUrl()` to accept dimensions, and pass `term.cols`/`term.rows` after `fitAddon.fit()` runs

**Server (`src/server/terminal-server.mts`):**
1. In `handleConnection` (or in the `wss.on('connection')` handler), extract `cols`/`rows` from the upgrade URL query params
2. Use them as `initialCols`/`initialRows` defaults (with clamping) so the PTY spawns at the correct size

### Acceptance Criteria
- [ ] `term.onResize()` is registered before `fitAddon.fit()` is called
- [ ] WebSocket URL includes `cols=<N>&rows=<N>` query params derived from `term.cols`/`term.rows`
- [ ] Server extracts `cols`/`rows` from upgrade URL in `extractSlug`-like function or inline
- [ ] Server clamps cols to [1, 500] and rows to [1, 200], defaulting to 80×24
- [ ] PTY spawns with URL-provided dimensions instead of hardcoded 80×24
- [ ] Early resize messages from WS still override URL-provided dimensions (existing behavior preserved)

### Test Coverage
- [ ] T25: Verify WebSocket URL contains `cols` and `rows` query params
- [ ] T26: Verify `term.onResize` is registered before `fitAddon.fit()` is called
- [ ] T27: (Server) Verify `cols`/`rows` are read from upgrade URL and used for PTY spawn

---

## Task 4: Add unit tests for all three fixes

- **Status:** TODO
- **Complexity:** Medium
- **Dependencies:** Task 1, Task 2, Task 3
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0006

### Description
Add tests T22–T27 to `src/hooks/use-terminal.test.ts` (and optionally a new server test file). Tests must cover:
- ClipboardAddon loading
- customKeyEventHandler registration
- screenReaderMode in Terminal constructor
- cols/rows in WebSocket URL
- onResize registration order relative to fitAddon.fit()

Mock additions needed:
- Add `@xterm/addon-clipboard` mock alongside existing addon mocks
- Capture Terminal constructor arguments to verify options
- Track call order of `onResize` vs `fitAddon.fit()`

### Acceptance Criteria
- [ ] All tests T22–T27 pass
- [ ] No existing tests (T10–T21) are broken
- [ ] `@xterm/addon-clipboard` mock is added to the test file
- [ ] Terminal constructor mock captures options for assertion

### Test Coverage
- [ ] T22: ClipboardAddon loaded
- [ ] T23: customKeyEventHandler registered
- [ ] T24: screenReaderMode: true in constructor
- [ ] T25: WebSocket URL contains cols/rows
- [ ] T26: onResize registered before fitAddon.fit()
- [ ] T27: Server reads cols/rows from URL params
