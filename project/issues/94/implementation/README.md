# Implementation Notes: Issue #94 Reduce Terminal Font Size Responsively

## Task 94-T1: Add responsive terminal font-size policy helper and initial constructor integration

- **Status:** Complete
- **Files Changed:** `src/hooks/use-terminal.ts`, `src/hooks/use-terminal.test.ts`
- **Tests Passed:** 46 targeted hook tests; full Vitest suite via `./harness test`
- **Tests Failed:** 0

### Changes Summary

- Added exported `getTerminalFontSize(input?)` helper in `src/hooks/use-terminal.ts`.
- Implemented the exact 11px/12px/13px policy using layout viewport width plus primary coarse pointer, any-coarse pointer, and `navigator.maxTouchPoints`.
- Kept the helper SSR/jsdom-safe and ignored `visualViewport.width` for tier selection.
- Applied the computed font size in the xterm `Terminal` constructor before the first forced fit and WebSocket connection.

### Test Results

- `npx vitest run src/hooks/use-terminal.test.ts` — pass, 46 tests.
- `./harness test` — pass.

### Notes

- No new helper file was added; `LLM.txt` did not need an update.

## Task 94-T2: Handle runtime font-size tier changes without WebSocket reconnects

- **Status:** Complete
- **Files Changed:** `src/hooks/use-terminal.ts`, `src/hooks/use-terminal.test.ts`
- **Tests Passed:** 46 targeted hook tests; full Vitest suite via `./harness test`
- **Tests Failed:** 0

### Changes Summary

- Added per-hook-instance listeners for `window.resize`, `orientationchange`, `(pointer: coarse)`, `(any-pointer: coarse)`, and `visualViewport.resize`.
- Runtime tier changes update `term.options.fontSize` and force a fit through the existing resize path.
- Same-tier media-query events do not refit or reconnect.
- `visualViewport.resize` only schedules refit work and does not affect the selected font-size tier.
- Listener cleanup covers unmount, slug/worktree rerender, modern media-query APIs, and legacy `addListener`/`removeListener`.

### Test Results

- `npx vitest run src/hooks/use-terminal.test.ts` — pass, 46 tests.
- `./harness test` — pass.

### Notes

- WebSocket reconnect logic was not changed; responsive font-size changes reuse the active connection.

## Task 94-T3: Preserve terminal panel, layout, helper, and protocol guardrails

- **Status:** Complete
- **Files Changed:** `src/hooks/use-terminal.ts`, `src/hooks/use-terminal.test.ts`
- **Tests Passed:** Full Vitest suite via `./harness test`; terminal Playwright spec
- **Tests Failed:** 0

### Changes Summary

- Kept the implementation hook-scoped; no `TerminalPanel`, layout, or viewport metadata changes were required.
- Preserved `lineHeight: 1.0`, `customGlyphs: true`, `screenReaderMode: true`, ClipboardAddon loading, theme behavior, setup/status frames, auth/4401 behavior, slug/worktree query parameters, `sendInput`, `focusTerminal`, duplicate resize suppression, and zero-size resize behavior.

### Test Results

- `./harness test` — pass.
- `DEVDECK_E2E_WEB_PORT=18070 DEVDECK_E2E_TERMINAL_PORT=13100 npx playwright test e2e/terminal.spec.ts` — pass, 6 tests.

### Notes

- Existing `terminal-panel.test.tsx` coverage remains unchanged because no terminal panel markup or layout source changed.

## Task 94-T4: Add browser-level responsive terminal coverage

- **Status:** Complete
- **Files Changed:** `e2e/terminal.spec.ts`
- **Tests Passed:** 6 terminal Playwright tests
- **Tests Failed:** 0

### Changes Summary

- Added touch/tablet Playwright coverage that emulates coarse pointer and `maxTouchPoints`.
- Asserts a connected terminal renders a 12px xterm font size and has no horizontal overflow.

### Test Results

- `DEVDECK_E2E_WEB_PORT=18070 DEVDECK_E2E_TERMINAL_PORT=13100 npx playwright test e2e/terminal.spec.ts` — pass, 6 tests.

### Notes

- An initial Playwright run reused a server on the default E2E port with a mismatched token and failed at authentication; rerunning on isolated ports passed.

## Task 94-T5: Complete verification and documentation alignment

- **Status:** Complete
- **Files Changed:** `project/issues/94/implementation/README.md`
- **Tests Passed:** `./harness verify`
- **Tests Failed:** 0

### Changes Summary

- Added implementation handoff notes for all Issue #94 tasks.
- Recorded harness bypass friction for targeted Vitest diagnostics because the harness test verb runs the full suite only.

### Test Results

- `npx prettier --check src/hooks/use-terminal.ts src/hooks/use-terminal.test.ts e2e/terminal.spec.ts` — pass.
- `./harness verify` — pass (lint, format check, build, test, smoke).

### Notes

- No deviations from CORE-COMPONENT-0003 or the approved plan were required.
- A first verify run was degraded because port 9999 was already occupied by an existing Next server; after stopping that specific process, `./harness verify` passed.
