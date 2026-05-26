# Action Plan: fix(terminal): tmux pane borders render as dashed lines due to excessive lineHeight

## Feature
- **ID:** 54
- **Research Brief:** project/issues/54/research/00-research.md

## ADRs Created
- None. Existing ADR-0002 already establishes xterm.js as the browser terminal emulator.

## Core-Components Created
- None. Existing CORE-COMPONENT-0003, CORE-COMPONENT-0004, and CORE-COMPONENT-0007 cover the relevant terminal, theme, and layout boundaries.

## Implementation Tasks
1. Update `src/hooks/use-terminal.ts` Terminal constructor options:
   - Change `lineHeight` from `1.5` to `1.0`.
   - Add `customGlyphs: true`.
   - Preserve existing theme, accessibility, addon, resize, and WebSocket behavior.

2. Add/update unit coverage in `src/hooks/use-terminal.test.ts`:
   - Use existing `terminalConstructorOptions` mock capture.
   - Assert `lineHeight: 1.0`.
   - Assert `customGlyphs: true`.
   - Keep existing assertions for `screenReaderMode`, `allowProposedApi`, theme, resize, and reconnect behavior passing.
