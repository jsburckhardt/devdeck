# Action Plan: Issue #29 - Tmux Session Fallback

## Feature

- **ID:** 29
- **Research Brief:** project/issues/29/research/00-research.md
- **scope_type:** core_component

## ADRs Created

None required. This extends the existing tmux behavior inside the WebSocket Terminal
Communication component without introducing a new architectural direction.

Relevant ADRs:
- ADR-0002 - Next.js + xterm.js + node-pty Tech Stack
- ADR-0004 - Token-Based Authentication

## Core-Components Updated

- CORE-COMPONENT-0003 - WebSocket Terminal Communication

Decision log updates:
- Decision 44 now records the three-branch terminal spawn decision tree.
- Decision 65 records the system-default tmux branch when `.tmux-shared` is absent.
- Decision 66 records shell fallback for tmux spawn or non-zero exit failures.

## Committed Design

Use catch-and-fallback in `handleConnection()` for tmux spawn failures. This covers both
the new system-default tmux branch and the existing shared-socket tmux branch without
adding an extra tmux availability probe to setup resolution.

The terminal spawn decision tree is:

1. Shared `.devcontainer/.tmux-shared` socket exists and expected session exists: attach
   using `tmux -S <socketPath> attach-session -t <sanitizedSlug>`.
2. Shared socket is absent: attempt `tmux new-session -A -s <sanitizedSlug>` on the
   system default tmux socket.
3. tmux attach/create fails, exits non-zero, or cannot be spawned: fall back to a login
   shell in the resolved project directory.

## Implementation Tasks

1. Patch `resolveTerminalSetup()` to return a system-default tmux config when the shared
   socket is absent and the sanitized session name is non-empty.
2. Patch `handleConnection()` to fall back to a shell when tmux spawn throws.
3. Add unit tests for the new system-default tmux branch, spawn-throws fallback,
   non-zero-exit fallback, and empty sanitized session name.
4. Record implementation notes and run configured verification.

## Non-Goals

- Do not change frontend terminal URL construction.
- Do not add a new tmux availability pre-check.
- Do not change behavior when `.tmux-shared` exists but is not a socket.
