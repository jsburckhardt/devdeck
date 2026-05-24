# Task Breakdown: Issue #54

## Task T1: Configure xterm.js for continuous box-drawing glyph rendering

- **Status:** Planned
- **Complexity:** Low
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0004, CORE-COMPONENT-0007

### Description
Update the `Terminal` constructor in `src/hooks/use-terminal.ts` so tmux pane borders render as continuous lines. Replace `lineHeight: 1.5` with `lineHeight: 1.0` and add `customGlyphs: true`.

### Acceptance Criteria
- `src/hooks/use-terminal.ts` constructs `Terminal` with `lineHeight: 1.0`.
- `src/hooks/use-terminal.ts` constructs `Terminal` with `customGlyphs: true`.
- Existing constructor options remain intact, including `theme`, `allowProposedApi`, and `screenReaderMode`.
- No backend, WebSocket protocol, theme-selection, or shell-layout code is changed.

### Test Coverage
- Covered by Task T2 unit assertions against captured `terminalConstructorOptions`.
- Existing hook tests must continue to cover resize, theme, reconnect, and WebSocket behavior.

## Task T2: Add regression coverage for terminal rendering constructor options

- **Status:** Planned
- **Complexity:** Low
- **Dependencies:** T1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0004, CORE-COMPONENT-0007

### Description
Update `src/hooks/use-terminal.test.ts` using the existing `terminalConstructorOptions` mock capture pattern to verify the xterm.js constructor receives the tmux-safe rendering options.

### Acceptance Criteria
- A unit test asserts `lineHeight: 1.0`.
- A unit test asserts `customGlyphs: true`.
- Existing assertions for `screenReaderMode: true` and `allowProposedApi: true` remain covered.
- Existing theme and resize tests continue to pass.

### Test Coverage
- Run focused hook tests with `npm test -- src/hooks/use-terminal.test.ts`.
- Full test suite should remain green with `npm test`.
