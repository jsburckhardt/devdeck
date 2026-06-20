# Test Plan: Reduce Terminal Font Size Responsively

## Test 94-UT1: Responsive font-size helper policy table

- **Type:** Unit
- **Task:** 94-T1
- **Priority:** High

### Setup
Use Vitest with explicit helper inputs or mocked browser globals for layout viewport width, `(pointer: coarse)`, `(any-pointer: coarse)`, `navigator.maxTouchPoints`, and `visualViewport`.

### Steps
1. Exercise threshold edges for `600`, `601`, `1024`, `1025`, `1366`, and `1367`.
2. Exercise primary coarse pointer, fallback any-coarse pointer, fallback `maxTouchPoints > 0`, non-touch narrow desktop, and large desktop cases.
3. Exercise missing `window`, missing `navigator`, missing `matchMedia`, and conflicting `visualViewport.width`.

### Expected Result
The helper returns `11`, `12`, or `13` exactly per CORE-COMPONENT-0003, with layout viewport width as the only width source for tiering.

## Test 94-UT2: Initial xterm constructor font size and dimensions

- **Type:** Unit / Hook
- **Task:** 94-T1
- **Priority:** High

### Setup
Extend `src/hooks/use-terminal.test.ts` xterm and FitAddon mocks to capture constructor options and fit/connect ordering.

### Steps
1. Render `useTerminal` under mocked viewport/touch conditions for phone, tablet, and desktop tiers.
2. Inspect captured `Terminal` constructor options.
3. Verify the existing initial forced fit and WebSocket URL `cols`/`rows` behavior remains intact.

### Expected Result
The constructor receives the computed `fontSize` before initial fit/connect while preserving `lineHeight: 1.0`, `customGlyphs: true`, `screenReaderMode: true`, theme, addons, and initial dimensions.

## Test 94-UT3: Runtime font-size tier change updates xterm without reconnect

- **Type:** Unit / Hook
- **Task:** 94-T2
- **Priority:** High

### Setup
Use fake timers and mocks for container size, media-query listeners, `window.resize`, and WebSocket instances.

### Steps
1. Mount `useTerminal`, open the WebSocket, and record the active WebSocket instance count.
2. Simulate a runtime change from desktop `13` to tablet `12`, then from tablet `12` to phone `11`.
3. Trigger the relevant listener callbacks and flush debounce timers.
4. Inspect `fakeTerminal.options.fontSize`, FitAddon calls, resize messages, and WebSocket instance count.

### Expected Result
The hook updates `term.options.fontSize`, force-fits xterm, sends resize messages only when terminal dimensions change, and does not create or reconnect a WebSocket solely for font-size changes.

## Test 94-UT4: Listener cleanup and visualViewport refit-only behavior

- **Type:** Unit / Hook
- **Task:** 94-T2
- **Priority:** High

### Setup
Mock `addEventListener`/`removeEventListener`, media-query `addEventListener`/`removeEventListener`, legacy `addListener`/`removeListener`, and optional `visualViewport` listeners.

### Steps
1. Mount and unmount `useTerminal`, then rerender with changed slug/worktree context.
2. Verify all registered listeners are removed.
3. Simulate `visualViewport.resize` where only `visualViewport.width` changes and layout viewport width does not.

### Expected Result
No listeners leak across unmounts or context changes, legacy media-query APIs are cleaned up when used, and `visualViewport` changes do not change the font-size tier.

## Test 94-UT5: Existing terminal protocol and lifecycle regressions

- **Type:** Unit / Regression
- **Task:** 94-T3
- **Priority:** High

### Setup
Run the existing `src/hooks/use-terminal.test.ts` suite through the harness.

### Steps
1. Run the hook tests after responsive font-size changes.
2. Confirm coverage still includes ClipboardAddon, binary input, setup/fallback frames, Copilot status frames, 4401 handling, slug/worktree URL params, duplicate resize suppression, zero-size skip/refit behavior, and runtime theme updates without reconnect.

### Expected Result
All existing terminal hook regressions pass with no protocol, auth, theme, worktree, or reconnect behavior regressions.

## Test 94-CT1: TerminalPanel layout and helper stability

- **Type:** Component / Regression
- **Task:** 94-T3
- **Priority:** Medium

### Setup
Run existing `src/components/terminal-panel.test.tsx` coverage, adding focused assertions only if `TerminalPanel` or layout markup changes.

### Steps
1. Verify the terminal container remains bounded and unpadded.
2. Verify keyboard helper and voice helper interactions do not remount the terminal host.
3. Verify disconnected helper controls no-op safely.

### Expected Result
Terminal panel markup and helper behavior remain stable while responsive font size is owned by the terminal hook.

## Test 94-E2E1: Touch/tablet terminal renders at 12px without overflow

- **Type:** Browser / Playwright
- **Task:** 94-T4
- **Priority:** High

### Setup
Use Playwright with a touch/tablet-capable context or equivalent reliable simulation, authenticated with the existing E2E token and project fixture.

### Steps
1. Open the first project terminal in a qualifying touch/tablet viewport.
2. Wait for the terminal to show `Connected`.
3. Read computed font size from `.xterm`, `.xterm-rows`, or an equivalent non-invasive rendered xterm element.
4. Run the existing horizontal-overflow check.
5. Optionally execute a simple command to prove terminal input/output still works.

### Expected Result
The rendered xterm font size is `12px`, the terminal remains connected, command I/O still works if exercised, and no terminal container/xterm horizontal overflow is detected.

## Test 94-V1: Harness verification

- **Type:** Verification
- **Task:** 94-T5
- **Priority:** High

### Setup
Use the repository harness from the project root after implementation and tests are complete.

### Steps
1. Run `./harness test` during iteration as needed.
2. Run `./harness verify` before implementation handoff.
3. If any direct command is used because the harness lacks needed detail, record it with `./harness friction add`.

### Expected Result
Harness verification passes according to CORE-COMPONENT-0009, covering lint, format check, build, tests, and smoke verification.
