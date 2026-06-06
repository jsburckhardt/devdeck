# Research Brief - Issue #67

**Issue Title:** fix(terminal): stabilize terminal sizing and eliminate horizontal scrollbar  
**Issue URL:** https://github.com/jsburckhardt/devdeck/issues/67  
**Scope Type:** `issue`  
**Date:** 2026-06-05

## Problem Summary

Issue #67 covers two related terminal rendering defects:

1. The terminal viewport can visibly jump or resize repeatedly during initial project workspace load and later layout changes.
2. A horizontal scrollbar can appear inside the terminal area even though terminal content should fit the active xterm/PTY column width.

The behavior appears local to the existing terminal mount, xterm fit lifecycle, and shell panel layout. It does not require a new API endpoint, a new architectural decision, or a new global core-component.

## Scope Classification

`issue`

No new ADR or core-component is required. The fix should preserve existing terminal and shell layout contracts from:

- `project/architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md`
- `project/architecture/core-components/CORE-COMPONENT-0007-shell-layout.md`
- `project/architecture/ADR/DECISION-LOG.md`

## Current Behavior Findings

### Terminal size instability

Likely implementation hotspots:

- `src/hooks/use-terminal.ts` owns xterm construction, `FitAddon` setup, initial fitting, `ResizeObserver`, WebSocket URL construction with `cols`/`rows`, and resize message propagation.
- `src/components/workspace-layout.tsx` owns the `react-resizable-panels` layout and imperative expand/collapse/resize behavior for Explorer, File Preview, and Terminal panels.
- `src/app/project/layout.tsx` and project page layout wrappers must preserve `min-h-0`, `min-w-0`, and `overflow-hidden` constraints so terminal sizing uses a stable bounded box.

The issue is likely caused by a combination of:

- an immediate `fitAddon.fit()` after `term.open()`,
- a `ResizeObserver` callback shortly after observation begins,
- layout changes from mounted/collapsible panels and sidebar width changes,
- duplicate resize propagation when calculated terminal columns/rows do not meaningfully change.

The fix should avoid resize feedback loops where fitting changes xterm DOM dimensions, triggers another observer callback, and sends redundant PTY resize messages.

### Horizontal scrollbar

`src/components/terminal-panel.tsx` likely mounts xterm into a terminal host with padding. Padding on the same element measured by `FitAddon` can make xterm calculate columns from a larger `clientWidth` than the drawable content box, causing the xterm canvas or screen element to overflow horizontally.

The terminal mount should be a stable bounded element with full width/height, `min-w-0`, and `overflow-hidden`. If visual padding is needed, it should live on an outer wrapper while the measured xterm mount node remains unpadded.

## Code and Documentation References

| Path | Relevance |
| --- | --- |
| `src/components/terminal-panel.tsx` | Terminal panel shell, xterm host node, status overlays, theme picker, and accessibility controls. |
| `src/hooks/use-terminal.ts` | xterm setup, FitAddon lifecycle, ResizeObserver, WebSocket `cols`/`rows`, resize messages, worktree scoping, setup/status frame handling. |
| `src/components/workspace-layout.tsx` | Resizable panel tree, mounted-collapse behavior, panel toggle behavior, sidebar-adjacent layout changes. |
| `src/app/project/layout.tsx` | Project route containment and outer overflow behavior. |
| `src/app/globals.css` | Global CSS and any xterm overflow overrides. |
| `src/hooks/use-terminal.test.ts` | Unit coverage for terminal fit, initial dimensions, resize messages, reconnect behavior, setup/status frames, and worktree query params. |
| `src/components/terminal-panel.test.tsx` | Component coverage for terminal panel rendering and accessible controls. |
| `src/components/workspace-layout.test.tsx` | Layout coverage for panel toggles, mounted-collapse behavior, separators, and visibility guards. |
| `e2e/terminal.spec.ts` | Browser-level terminal connection and terminal DOM overflow behavior. |
| `CORE-COMPONENT-0003` | Requires terminal resize support, initial `cols`/`rows`, `screenReaderMode`, binary WebSocket I/O, setup/status frames, and worktree terminal scoping. |
| `CORE-COMPONENT-0007` | Requires the shell to fill `100vh`, avoid outer scroll, keep resource-owning panels mounted, and use collapsible panel behavior. |

## Constraints and Risks

- Preserve `screenReaderMode: true`, ClipboardAddon behavior, terminal theme behavior, binary I/O, setup/status messages, tmux/shell mode state, and worktree query behavior.
- Preserve initial `cols`/`rows` query parameters in the WebSocket URL so the PTY starts with accurate dimensions.
- Keep resize propagation accurate while suppressing duplicates; do not mask incorrect sizing with CSS alone.
- Avoid changing `react-resizable-panels` mounted-collapse semantics required by `CORE-COMPONENT-0007`.
- Ensure error overlays, unauthorized state, retry controls, theme picker, mode badge, and fallback notice remain visible and accessible.

## Acceptance Criteria Alignment

The planned fix should satisfy:

- No horizontal scrollbar appears in the terminal mount, `.xterm`, `.xterm-viewport`, or `.xterm-screen` during normal use.
- Initial project workspace load fits the terminal once the container has usable dimensions without visible repeated reflow.
- Panel drags, panel toggles, sidebar collapse/expand, project switches, worktree switches, and reconnects do not leave stale terminal dimensions.
- Zero-width or zero-height states are skipped safely while hidden/collapsed, then fitted when visible again.
- Initial WebSocket `cols`/`rows` and later resize messages remain accurate.
- Project-root and worktree terminals share the corrected behavior.

## Testing Guidance

- Extend `src/hooks/use-terminal.test.ts` for stable duplicate resize suppression, zero-dimension skip, and fit-after-visible behavior.
- Extend `src/components/terminal-panel.test.tsx` to assert the terminal mount structure uses bounded sizing and no padded measured host.
- Extend `src/components/workspace-layout.test.tsx` only if layout-level changes are needed.
- Extend `e2e/terminal.spec.ts` with DOM measurements asserting `scrollWidth <= clientWidth` for terminal elements on initial load and after a layout change where practical.
- Run repository verification commands from `.github/soft-factory/verification.yml` if present; otherwise run package lint, format check, build, unit tests, and relevant Playwright terminal tests.

## ADR / Core-Component Updates Required

No ADR or core-component updates are required.

This is an issue-scoped bugfix within the existing terminal and shell layout contracts. `CORE-COMPONENT-0003` and `CORE-COMPONENT-0007` already define the expected terminal resize and mounted panel behavior, and the implementation should conform to those existing decisions.
