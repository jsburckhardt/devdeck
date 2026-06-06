# Test Plan: Issue #67

## Acceptance Criteria Mapping

| AC | Coverage |
| --- | --- |
| AC1 | TP-C1, TP-E1, TP-E2, TP-M1 |
| AC2 | TP-U1, TP-U2, TP-E1, TP-M1 |
| AC3 | TP-U2, TP-C2, TP-E2, TP-M1 |
| AC4 | TP-U1, TP-C2, TP-E2, TP-M1 |
| AC5 | TP-U2, TP-U3 |
| AC6 | TP-U3, TP-E2, TP-M1 |
| AC7 | TP-U3, TP-C1, TP-C2, TP-M1 |

## Test TP-U1: Skip zero-dimension fits and refit when visible

- **Type:** Unit
- **Task:** T2
- **Priority:** P0

### Setup

Use `src/hooks/use-terminal.test.ts` with mocked xterm, FitAddon, ResizeObserver, and fake timers.

### Steps

1. Mount `useTerminal`.
2. Attach a mock container.
3. Mock `getBoundingClientRect()` as `0x0`.
4. Trigger ResizeObserver and advance debounce timer.
5. Mock a non-zero rect.
6. Trigger ResizeObserver and advance debounce timer.

### Expected Result

`fitAddon.fit()` is not called for `0x0`; it is called once the container has usable dimensions.

## Test TP-U2: Suppress redundant fits and duplicate resize messages

- **Type:** Unit
- **Task:** T2
- **Priority:** P0

### Setup

Use mocked ResizeObserver and WebSocket in `src/hooks/use-terminal.test.ts`.

### Steps

1. Trigger ResizeObserver twice with the same non-zero rect.
2. Trigger xterm `onResize` twice with the same `cols`/`rows`.
3. Trigger xterm `onResize` with changed `cols`/`rows`.

### Expected Result

Only one fit occurs for unchanged container dimensions. Only changed terminal dimensions produce a new resize message.

## Test TP-U3: Preserve terminal protocol and lifecycle regressions

- **Type:** Unit
- **Task:** T2
- **Priority:** P0

### Setup

Use existing `use-terminal` tests.

### Steps

1. Run tests for initial WebSocket `cols`/`rows`.
2. Run tests for binary terminal input.
3. Run tests for `screenReaderMode`, ClipboardAddon, setup frames, status frames, theme updates, reconnect, unauthorized close, and worktree query params.

### Expected Result

All existing protocol and lifecycle behavior remains unchanged.

## Test TP-C1: TerminalPanel uses an unpadded bounded measured host

- **Type:** Component
- **Task:** T1
- **Priority:** P0

### Setup

Use `src/components/terminal-panel.test.tsx` with mocked `useTerminal`.

### Steps

1. Render `TerminalPanel`.
2. Locate `data-testid="terminal-container"`.
3. Inspect class/style contract for padding, sizing, `min-w-0`, `min-h-0`, and `overflow-hidden`.
4. Render status/error/fallback states.

### Expected Result

The measured host is unpadded and bounded. Status overlays and terminal controls remain accessible.

## Test TP-C2: Workspace panel semantics remain mounted and bounded

- **Type:** Component
- **Task:** T3
- **Priority:** P1

### Setup

Use `src/components/workspace-layout.test.tsx`.

### Steps

1. Render with terminal visible.
2. Toggle terminal hidden and visible.
3. Test single-panel and multi-panel states.
4. If layout classes change, assert bounded container classes where practical.

### Expected Result

Terminal remains mounted, panel collapse/expand behavior is preserved, and single-panel normalization still works.

## Test TP-E1: No terminal horizontal overflow on initial load

- **Type:** E2E
- **Task:** T4
- **Priority:** P0

### Setup

Use Playwright in `e2e/terminal.spec.ts`.

### Steps

1. Authenticate with token.
2. Open a project.
3. Wait for terminal connected state.
4. Measure `terminal-container`, `.xterm`, `.xterm-viewport`, and `.xterm-screen`.

### Expected Result

For every measured element, `scrollWidth <= clientWidth + 1`.

## Test TP-E2: No stale terminal dimensions after layout changes

- **Type:** E2E
- **Task:** T4
- **Priority:** P0

### Setup

Use Playwright with an existing fixture project.

### Steps

1. Open a project terminal.
2. Toggle File Preview and Explorer.
3. Collapse or expand sidebar where available.
4. Optionally drag panel separators.
5. Re-measure terminal overflow and verify connected state.

### Expected Result

No horizontal overflow appears, terminal remains connected, and terminal dimensions update after layout changes.

## Test TP-M1: Manual terminal sizing QA matrix

- **Type:** Manual
- **Task:** T4
- **Priority:** P1

### Setup

Run the app locally with at least one project and one worktree.

### Steps

1. Open a project-root terminal.
2. Open a worktree terminal.
3. Resize panels repeatedly.
4. Toggle Explorer/File Preview/Terminal.
5. Collapse and expand the sidebar.
6. Switch projects and worktrees.
7. Trigger reconnect if practical.
8. Confirm no horizontal scrollbar and no visible repeated reflow.

### Expected Result

Terminal sizing remains stable across project-root and worktree terminals; no horizontal scrollbar appears; existing terminal features remain functional.
