# Test Plan — Issue #19: Terminal Input Issues

## Test T22: ClipboardAddon is loaded on the terminal

- **Type:** Unit
- **Task:** Task 1
- **Priority:** High

### Setup
- Render `useTerminal` hook with existing mocks
- Add `@xterm/addon-clipboard` mock: `vi.mock("@xterm/addon-clipboard", () => ({ ClipboardAddon: function() { return { dispose: vi.fn() }; } }))`

### Steps
1. Render the hook with `{ wsUrl: "ws://test:3100" }`
2. Wait for terminal initialization
3. Inspect `fakeTerminal.loadAddon` calls

### Expected Result
- `term.loadAddon()` is called with an instance of the mocked `ClipboardAddon` (4 addons total: FitAddon, WebLinksAddon, Unicode11Addon, ClipboardAddon)

---

## Test T23: customKeyEventHandler is registered

- **Type:** Unit
- **Task:** Task 1
- **Priority:** High

### Setup
- Add `attachCustomKeyEventHandler` mock to `fakeTerminal`: `attachCustomKeyEventHandler: vi.fn()`

### Steps
1. Render the hook
2. Wait for terminal initialization
3. Check `fakeTerminal.attachCustomKeyEventHandler` was called

### Expected Result
- `attachCustomKeyEventHandler` is called exactly once with a function argument

---

## Test T24: Terminal constructor includes screenReaderMode: true

- **Type:** Unit
- **Task:** Task 2
- **Priority:** High

### Setup
- Modify Terminal mock constructor to capture constructor options: store the options argument in a variable accessible to tests

### Steps
1. Render the hook
2. Wait for terminal initialization
3. Assert on captured constructor options

### Expected Result
- Constructor options include `screenReaderMode: true`
- Constructor options still include `allowProposedApi: true`

---

## Test T25: WebSocket URL contains cols and rows query params

- **Type:** Unit
- **Task:** Task 3
- **Priority:** High

### Setup
- Standard hook render with mocks
- `fakeTerminal.cols = 120`, `fakeTerminal.rows = 40` (to test non-default values)

### Steps
1. Set `fakeTerminal.cols` and `fakeTerminal.rows` before rendering
2. Render the hook
3. Wait for WebSocket creation
4. Inspect `ws.url`

### Expected Result
- `ws.url` contains `cols=` and `rows=` query parameters
- Values match `fakeTerminal.cols` and `fakeTerminal.rows`

---

## Test T26: onResize is registered before fitAddon.fit() is called

- **Type:** Unit
- **Task:** Task 3
- **Priority:** High

### Setup
- Track call order: create a shared call-order array, push `"onResize"` from the `fakeTerminal.onResize` mock and `"fit"` from the `FitAddon.fit` mock

### Steps
1. Set up order-tracking mocks
2. Render the hook
3. Wait for terminal initialization
4. Check the order array

### Expected Result
- `"onResize"` appears before `"fit"` in the call order array (i.e., `term.onResize` is registered before `fitAddon.fit()` is called)

---

## Test T27: Server reads cols/rows from upgrade URL query params

- **Type:** Unit
- **Task:** Task 3
- **Priority:** Medium

### Setup
- This tests server-side logic in `terminal-server.mts`
- Either: extract the dimension-parsing logic into a testable function, or test via integration
- Mock `node-pty.spawn` to capture args

### Steps
1. Create a WebSocket connection with URL containing `?cols=132&rows=43`
2. Observe the `spawn` call arguments

### Expected Result
- PTY is spawned with `cols: 132` and `rows: 43` (not the default 80×24)
- Values are clamped within valid ranges (1–500 for cols, 1–200 for rows)
