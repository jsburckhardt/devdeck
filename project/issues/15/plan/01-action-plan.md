# Action Plan: Open terminal in project directory with optional tmux session attachment

## Feature
- **ID:** 15
- **Research Brief:** project/issues/15/research/00-research.md

## ADRs Created
None — existing ADRs (ADR-0003, ADR-0004) already cover the relevant decisions.

## Core-Components Updated
- **CORE-COMPONENT-0003** (WebSocket Terminal Communication) — added rules for `slug` query parameter, per-connection CWD resolution via `resolveProjectPath`, `.devcontainer/.tmux-shared` detection for tmux session attachment, slug sanitization, and fallback behavior.

## Approach

The terminal server currently resolves CWD once at startup and applies it to every PTY spawn. This change makes CWD resolution per-connection by extracting an optional `slug` query parameter from the WebSocket upgrade URL, resolving it server-side via the existing `resolveProjectPath(slug)` function, and optionally attaching to a tmux shared session if `.devcontainer/.tmux-shared` exists in the resolved project directory.

The frontend passes the project slug through the component hierarchy: `WorkspaceLayout → TerminalPanel → useTerminal → buildWsUrl`.

## Implementation Tasks

1. **Task 1: Update CORE-COMPONENT-0003** — Document new slug, tmux, and security rules *(done)*
2. **Task 2: Update terminal-server.mts** — Per-connection CWD resolution, tmux detection, fallback logic
3. **Task 3: Update use-terminal.ts** — Add `slug` option, update `buildWsUrl()` to append slug param
4. **Task 4: Update terminal-panel.tsx** — Accept and forward `slug` prop
5. **Task 5: Update workspace-layout.tsx** — Pass `project.slug` to `TerminalPanel`
6. **Task 6: Write terminal-server tests** — T16–T21 covering slug CWD, tmux, fallbacks, sanitization
7. **Task 7: Write use-terminal tests** — T20–T21 covering slug in WS URL
8. **Task 8: Verify all existing tests pass** — Backward compatibility check
