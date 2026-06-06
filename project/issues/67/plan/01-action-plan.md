# Action Plan: fix(terminal): stabilize terminal sizing and eliminate horizontal scrollbar

## Feature

- **ID:** 67
- **Issue:** fix(terminal): stabilize terminal sizing and eliminate horizontal scrollbar
- **Research Brief:** `project/issues/67/research/00-research.md`
- **Scope Type:** `issue`

## Architecture

- **ADRs Created:** None
- **Core-Components Created:** None
- **Architecture Docs Changed:** No
- **Relevant Architecture:** ADR-0002, CORE-COMPONENT-0003, CORE-COMPONENT-0004, CORE-COMPONENT-0006, CORE-COMPONENT-0007

## Chosen Approach

1. Make the xterm measured host unpadded, bounded, `min-w-0`, and `overflow-hidden`.
2. Move any visual padding to an outer wrapper around the measured host.
3. Stabilize `FitAddon` and `ResizeObserver` by skipping zero-dimension fits and suppressing redundant fits for unchanged container dimensions.
4. Suppress duplicate terminal resize messages for unchanged `cols`/`rows` while preserving initial WebSocket `cols`/`rows`.
5. Preserve terminal protocol behavior: binary I/O, setup/status frames, `screenReaderMode`, ClipboardAddon, terminal themes, worktree scoping, and mounted panel lifecycle.

## Non-Goals

- No WebSocket endpoint redesign.
- No server-side PTY protocol changes.
- No replacement of xterm.js, FitAddon, or `react-resizable-panels`.
- No ADR or core-component creation.
- No conditional unmounting of the terminal panel.

## Constraints

- Preserve CORE-COMPONENT-0003 terminal resize and WebSocket contracts.
- Preserve CORE-COMPONENT-0007 mounted/collapsible shell panel behavior.
- Preserve CORE-COMPONENT-0004 runtime terminal theme behavior.
- Do not mask incorrect sizing with CSS alone; calculated terminal dimensions must remain accurate.
- Skip zero-width/zero-height fits but refit once the terminal becomes visible.

## Risks

- JSDOM does not perform real layout; unit tests must mock `getBoundingClientRect`.
- Resize debounce behavior can be flaky without fake timers.
- Padding wrapper changes may affect status overlays if not kept inside the relative terminal body.
- E2E overflow assertions need small pixel tolerance for browser subpixel rounding.

## Acceptance Criteria

- **AC1:** No horizontal scrollbar appears in the terminal host, `.xterm`, `.xterm-viewport`, or `.xterm-screen`.
- **AC2:** Initial load fits once the terminal container has usable dimensions without visible repeated reflow.
- **AC3:** Panel drags, toggles, sidebar collapse/expand, project switches, worktree switches, and reconnects do not leave stale terminal dimensions.
- **AC4:** Zero-dimension hidden/collapsed states are skipped safely, then fitted when visible.
- **AC5:** Initial WebSocket `cols`/`rows` and later resize messages remain accurate.
- **AC6:** Project-root and worktree terminals share corrected sizing behavior.
- **AC7:** Existing terminal accessibility, binary I/O, setup/status frames, theme behavior, and mounted lifecycle remain intact.

## Affected Files

- `src/components/terminal-panel.tsx`
- `src/hooks/use-terminal.ts`
- `src/components/workspace-layout.tsx` only if containment classes need adjustment
- `src/app/project/layout.tsx` only if containment regression is found
- `src/hooks/use-terminal.test.ts`
- `src/components/terminal-panel.test.tsx`
- `src/components/workspace-layout.test.tsx` only if layout behavior changes
- `e2e/terminal.spec.ts`
- `e2e/workspace-layout.spec.ts` as supporting coverage if needed

## Implementation Tasks

- T1: Refactor terminal DOM containment.
- T2: Stabilize FitAddon/ResizeObserver and resize message propagation.
- T3: Verify shell layout integration and mounted panel behavior.
- T4: Add regression tests and run verification.
