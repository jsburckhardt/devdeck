# Action Plan: feat(terminal): add browser microphone voice input for xterm

## Feature
- **ID:** 80
- **Research Brief:** project/issues/80/research/00-research.md

## ADRs Created
- None. Keep the solution browser-only with no server-side speech/audio processing, no raw audio transport, no persistence, no third-party speech SDK/API/secrets, no CSP or Permissions-Policy changes, and no new endpoints.
- Relevant existing ADRs: [ADR-0002: Next.js + xterm.js + node-pty Tech Stack](../../../architecture/ADR/ADR-0002-tech-stack.md) and [ADR-0004: Token-Based Authentication](../../../architecture/ADR/ADR-0004-token-authentication.md).

## Core-Components Created
- None created.
- Amended [CORE-COMPONENT-0003: WebSocket Terminal Communication](../../../architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md) for the authenticated browser voice review workflow.
- Added Decision Log records [#175-#189](../../../architecture/ADR/DECISION-LOG.md) covering browser-only speech recognition, review-before-send, interim transcript display, validation, focus, alert semantics, panel-local state, cleanup, and stale-callback guards.

## Implementation Tasks
1. Replace the partial `useVoiceInput` contract with a browser-only stateful hook that exposes full status, interim/final transcript state, normalized errors, optional Permissions API advisory checks, cancel/clear actions, cleanup, and generation/context guards.
2. Replace direct transcript dispatch in `TerminalPanel` with a panel-local transcript review workflow: labelled editable review field, interim display, **Send text**, **Send + Enter** using `\r`, Cancel/Escape, validation, retryable `sendInput(false)` behavior, disclosure copy, ARIA/status/alert semantics, focus rules, and cleanup on disconnect, slug/worktree change, and unmount.
3. Update hook and component tests to cover the authenticated checklist, including exact send strings, live/alert semantics, focus behavior, terminal container stability, SSR/jsdom safety, and stale callback guards.
4. Record implementation notes with deterministic E2E coverage if feasible; otherwise document manual checks for allow/deny permission, unsupported browser, mobile viewport, and terminal connection preservation. Use `./harness verify` as the implementation completion gate.
