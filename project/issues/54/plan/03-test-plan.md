# Test Plan: Issue #54

## Test TP1: Terminal constructor uses tmux-safe glyph rendering options

- **Type:** Unit
- **Task:** T1, T2
- **Priority:** High

### Setup
Use existing Vitest mocks in `src/hooks/use-terminal.test.ts`, especially the `terminalConstructorOptions` capture from the mocked `Terminal` constructor.

### Steps
1. Render `useTerminal({ wsUrl: "ws://test:3100" })`.
2. Wait for the mocked WebSocket/terminal initialization.
3. Assert captured constructor options include:
   - `lineHeight: 1.0`
   - `customGlyphs: true`

### Expected Result
The unit test passes and verifies xterm.js is configured to render tmux box-drawing characters continuously.

## Test TP2: Existing terminal behavior remains unchanged

- **Type:** Regression
- **Task:** T1, T2
- **Priority:** High

### Setup
Run the existing terminal hook test suite.

### Steps
1. Execute `npm test -- src/hooks/use-terminal.test.ts`.
2. Confirm existing tests for resize, theme updates, reconnect behavior, and accessibility constructor options pass.

### Expected Result
All terminal hook tests pass with no regression to WebSocket, resize, theme, or accessibility behavior.

## Test TP3: Full unit test suite remains green

- **Type:** Regression
- **Task:** T1, T2
- **Priority:** Medium

### Setup
Use the repository test command from `package.json`.

### Steps
1. Execute `npm test`.

### Expected Result
The full Vitest suite passes.
