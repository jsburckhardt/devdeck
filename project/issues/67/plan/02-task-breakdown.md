# Task Breakdown: Issue #67

## Task T1: Refactor terminal DOM containment

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0004, CORE-COMPONENT-0007

### Description

Update `TerminalPanel` so the element passed to `containerRef` is the measured xterm host and has no padding. Apply `min-h-0`, `min-w-0`, full size, and `overflow-hidden` to the terminal body/host chain. If visual padding is retained, place it on an outer wrapper, not the measured host.

### Acceptance Criteria

- The measured `terminal-container` host has no padding classes or styles.
- The measured host is bounded with full width/height, `min-w-0`, `min-h-0`, and `overflow-hidden`.
- Visual padding, if present, is on an outer wrapper.
- Status overlays, retry UI, unauthorized state, fallback notice, mode badge, and theme picker remain visible and accessible.
- Terminal panel background still follows the selected terminal theme.

### Test Coverage

- Add or extend `src/components/terminal-panel.test.tsx` to assert the measured host is unpadded and bounded.
- Cover that the outer panel still renders status overlays and controls.
- Cover AC1 and AC7 at component level.

## Task T2: Stabilize FitAddon/ResizeObserver and resize messages

- **Status:** Planned
- **Complexity:** High
- **Dependencies:** T1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0007

### Description

Update `useTerminal` to centralize fit scheduling. Skip fits when the container rect is zero-sized, reset cached dimensions on hidden states, and refit on the next usable non-zero size. Suppress duplicate `fit()` calls for unchanged normalized container dimensions. Suppress duplicate WebSocket resize messages for unchanged terminal `cols`/`rows`.

### Acceptance Criteria

- Initial WebSocket URL still includes accurate `cols` and `rows`.
- `fitAddon.fit()` is not called for zero-width or zero-height containers.
- After a zero-size state, the next non-zero ResizeObserver event triggers a fit.
- Repeated ResizeObserver events for unchanged dimensions do not trigger repeated fits.
- Repeated xterm resize events with unchanged `cols`/`rows` do not send duplicate resize messages.
- Changed `cols`/`rows` still send resize messages.
- Existing `screenReaderMode`, ClipboardAddon, binary I/O, setup/status frames, worktree query params, reconnect behavior, and runtime theme updates remain intact.

### Test Coverage

- Extend `src/hooks/use-terminal.test.ts`.
- Add tests for duplicate fit suppression.
- Add tests for zero-size skip followed by visible refit.
- Add tests for duplicate resize message suppression.
- Keep existing tests for initial `cols`/`rows`, binary I/O, `screenReaderMode`, setup/status frames, worktree params, and theme updates passing.
- Cover AC2, AC3, AC4, AC5, AC6, and AC7.

## Task T3: Verify shell layout integration and mounted panel behavior

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1, T2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0007

### Description

Audit the terminal containment through `ProjectLayout`, project page content, `WorkspaceLayout`, and `react-resizable-panels`. Add `min-w-0`, `min-h-0`, and `overflow-hidden` classes only where needed to keep the terminal bounded. Do not change mounted-collapse semantics.

### Acceptance Criteria

- The shell still fills the viewport with no outer scroll.
- Terminal remains mounted when hidden/collapsed.
- Single visible panel normalization still resizes the remaining panel to 100%.
- Multi-panel layouts do not reset user proportions.
- Sidebar collapse/expand does not cause stale terminal dimensions.

### Test Coverage

- Extend `src/components/workspace-layout.test.tsx` only if layout code changes.
- Use existing mounted-collapse, separator, and single-panel normalization tests as regression coverage.
- Cover AC3, AC4, and AC7.

## Task T4: Add E2E/manual regression coverage and run verification

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1, T2, T3
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0006, CORE-COMPONENT-0007

### Description

Add browser-level overflow checks and document manual verification for project-root and worktree terminals. Run repository verification commands plus relevant Playwright terminal/layout specs.

### Acceptance Criteria

- E2E checks assert `scrollWidth <= clientWidth + tolerance` for terminal host and xterm elements.
- E2E checks cover initial terminal load and at least one layout change.
- Manual verification covers panel drag/toggle, sidebar collapse/expand, reconnect, project switch, and worktree switch.
- Verification commands pass: `npm run lint`, `npm run format:check`, `npm run build`, `npm run test`, plus targeted Playwright specs where supported.

### Test Coverage

- Extend `e2e/terminal.spec.ts` for terminal overflow assertions.
- Reuse or extend `e2e/workspace-layout.spec.ts` for layout transition coverage if needed.
- Cover AC1 through AC7.
