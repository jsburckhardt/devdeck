# Task Breakdown: Reduce Terminal Font Size Responsively

## Task 94-T1: Add responsive terminal font-size policy helper and initial constructor integration

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0006, CORE-COMPONENT-0009

### Description
Implement a small, testable, SSR/jsdom-safe terminal font-size resolver in `src/hooks/use-terminal.ts` or a nearby helper. Use it when constructing xterm.js so the initial terminal fit and WebSocket URL `cols`/`rows` are based on the responsive font size.

### Acceptance Criteria
- Return `11` when `layoutViewportWidth <= 600`, regardless of touch capability.
- Return `12` when `(pointer: coarse)` is true and `layoutViewportWidth <= 1366`.
- Return `12` when fallback touch detection (`(any-pointer: coarse)` or `navigator.maxTouchPoints > 0`) is true and `layoutViewportWidth <= 1024`.
- Return `13` for all remaining cases, including non-touch `layoutViewportWidth <= 1200` and large desktop layouts.
- Use layout viewport width (`window.innerWidth` or document element layout width), not `visualViewport.width`, for tier selection.
- Apply the computed `fontSize` in the `Terminal` constructor before the first forced fit and before creating the WebSocket.
- Preserve `lineHeight: 1.0`, `customGlyphs: true`, `screenReaderMode: true`, ClipboardAddon loading, theme constructor behavior, and binary terminal I/O.
- If a new helper file is introduced, update `LLM.txt` so agents can find it.
- Use `./harness test` or a narrower harness-supported test command during implementation; reserve full `./harness verify` for final verification.

### Test Coverage
- Add unit tests for the exact policy table, threshold edges, rule precedence, missing browser globals, and `visualViewport.width` not influencing tier selection.
- Add hook tests asserting the xterm constructor receives the computed `fontSize` while keeping existing constructor options unchanged.
- Keep existing tests for initial `cols`/`rows` query parameters and `onResize` before `fit()` behavior passing.

## Task 94-T2: Handle runtime font-size tier changes without WebSocket reconnects

- **Status:** Pending
- **Complexity:** High
- **Dependencies:** 94-T1
- **Related ADRs:** ADR-0002, ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0004, CORE-COMPONENT-0005, CORE-COMPONENT-0007, CORE-COMPONENT-0009

### Description
Add per-hook-instance runtime handling for viewport/orientation/pointer/touch changes. When the computed font-size tier changes, update the existing xterm instance, force a fit, and let the existing terminal resize path send any changed PTY dimensions.

### Acceptance Criteria
- Register SSR-safe listeners for relevant `window.resize`, `orientationchange`, and media-query changes such as `(pointer: coarse)` and `(any-pointer: coarse)`.
- Clean up listeners on unmount, reconnect, slug/worktree changes, and React Strict Mode remounts, supporting both modern and legacy media-query listener APIs.
- On font-size tier changes, update `term.options.fontSize` and force `fitAddon.fit()` even when container dimensions did not change.
- Propagate resulting terminal `cols`/`rows` through the existing `term.onResize` handler and duplicate resize suppression.
- Do not create a new WebSocket or reconnect solely because the font-size tier changed.
- Treat `visualViewport.resize` as refit-only if used; it must not lower the font-size tier during zoom.
- Preserve setup/status frame handling, 4401 unauthorized behavior, automatic reconnect behavior, worktree query handling, `sendInput`, and `focusTerminal`.
- Prefer `./harness test` while iterating and record any harness bypass reason with `./harness friction add` if raw commands are needed.

### Test Coverage
- Add hook lifecycle tests that simulate runtime tier changes and assert `term.options.fontSize`, forced fit, resize message behavior, and unchanged WebSocket instance count.
- Add listener cleanup tests covering unmount and rerender/context changes, including media-query `addEventListener/removeEventListener` and legacy `addListener/removeListener`.
- Add tests proving repeated same-tier events do not refit or reconnect unnecessarily.
- Add tests proving `visualViewport.width` changes alone do not change the font-size tier.

## Task 94-T3: Preserve terminal panel, layout, helper, and protocol guardrails

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** 94-T1, 94-T2
- **Related ADRs:** ADR-0002, ADR-0004, ADR-0005
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0005, CORE-COMPONENT-0007, CORE-COMPONENT-0008, CORE-COMPONENT-0009

### Description
Keep the change scoped to terminal density unless implementation proves a markup change is necessary. Ensure the mounted terminal panel, helper controls, auth behavior, and protocol details remain stable while the font size changes.

### Acceptance Criteria
- Keep `TerminalPanel` mounted under the existing `react-resizable-panels` terminal panel; do not remount the panel solely for font-size changes.
- Preserve `data-testid="terminal-container"`, bounded `min-h-0`/`min-w-0`/`overflow-hidden` containment, and existing helper/voice control reachability.
- Do not add duplicate viewport tags or disable browser zoom.
- Preserve slug and worktree WebSocket query behavior, setup/fallback handling, Copilot status frames, and unauthorized close-code handling.
- If no `TerminalPanel` or layout source changes are required, document that existing component coverage is intentionally unchanged.
- Use `./harness test` for component/unit regressions if any related source changes are made.

### Test Coverage
- Keep existing `terminal-panel.test.tsx` coverage passing for bounded container classes, helper accessibility, helper no-remount behavior, voice panel stability, and disconnected helper no-ops.
- Keep existing `use-terminal.test.ts` coverage passing for ClipboardAddon, setup/status frames, 4401 handling, slug/worktree params, duplicate resize suppression, and runtime theme updates without reconnect.
- Add focused regression tests only if implementation changes `TerminalPanel`, layout markup, or viewport metadata.

## Task 94-T4: Add browser-level responsive terminal coverage

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** 94-T1, 94-T2, 94-T3
- **Related ADRs:** ADR-0002, ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0007, CORE-COMPONENT-0009

### Description
Extend Playwright terminal coverage to verify the browser-rendered xterm font size on a touch/tablet viewport and ensure the terminal remains connected and contained.

### Acceptance Criteria
- Add a browser-level test using a tablet/touch-capable context or equivalent reliable simulation.
- Assert the rendered/computed xterm font size is `12px` for a qualifying touch/tablet viewport.
- Assert the terminal remains connected after load and after the font-size tier is applied.
- Assert no horizontal overflow using the existing overflow helper or an equivalent check.
- Prefer observing `.xterm` or `.xterm-rows` computed style unless implementation exposes a better non-invasive signal.
- Do not depend on disabling browser zoom or changing application viewport metadata.

### Test Coverage
- Add or extend Playwright coverage in `e2e/terminal.spec.ts` for the touch/tablet 12px case.
- Include connection and no-overflow assertions in the same browser-level test.
- Optionally add a non-touch desktop control at 13px if it can run reliably without increasing suite fragility; unit coverage remains the source of truth for the full policy table.

## Task 94-T5: Complete verification and documentation alignment

- **Status:** Pending
- **Complexity:** Low
- **Dependencies:** 94-T1, 94-T2, 94-T3, 94-T4
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0006, CORE-COMPONENT-0009

### Description
Finalize the implementation handoff by ensuring documentation and verification match the changed surface.

### Acceptance Criteria
- Update `LLM.txt` if a new source or test file is added for terminal font-size logic.
- Run `./harness test` for iterative validation and `./harness verify` before implementation completion.
- If a harness-supported command is bypassed, record the reason with `./harness friction add`.
- Ensure no unrelated terminal protocol, auth, layout, or theme behavior changed.
- Capture any implementation-only notes under the issue implementation artifact during the Implement stage, not in application source.

### Test Coverage
- `./harness verify` must pass before the Implement stage is handed off for review.
- Verification should cover lint, format check, build, unit/component tests, and smoke checks through the harness contract.
