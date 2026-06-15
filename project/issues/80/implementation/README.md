# Implementation Notes: Issue #80

## Summary

Reworked terminal microphone input from the earlier title-only direct-dispatch
implementation into a browser-only review workflow. Speech recognition is owned by
`useVoiceInput`; `TerminalPanel` now displays interim/final transcript state,
requires editable review, and sends only through explicit **Send text** or
**Send + Enter** actions.

## Files Changed

- `src/hooks/use-voice-input.ts`
  - Added SSR/jsdom-safe standard and `webkitSpeechRecognition` support detection.
  - Added status coverage for `unsupported`, `insecure-context`,
    `permission-needed`, `listening`, `transcribing`, `ready-to-send`, `denied`,
    and `errored`.
  - Added advisory Permissions API handling; missing/query failures remain
    `unknown`, while denied maps to actionable denied state.
  - Configures one-shot recognition with `continuous = false`,
    `interimResults = true`, and `lang = navigator.language || "en-US"`.
  - Stores interim/final transcripts in hook state only; the hook does not send
    terminal input.
  - Normalizes Web Speech errors and invalidates late callbacks across
    stop/cancel/clear/unmount/context changes.
- `src/hooks/use-voice-input.test.ts`
  - Covers support detection, secure-context guard, permissions unknown/denied,
    interim/final transcript state, normalized errors, stop/cancel/clear, unmount
    cleanup, and stale callback guards.
- `src/components/terminal-panel.tsx`
  - Replaced direct transcript dispatch with panel-local transcript review UI.
  - Keeps the microphone control visible by default with accessible disabled,
    pressed, title, label, status, and `aria-controls` semantics.
  - Adds interim transcript display, labelled editable review field, disclosure
    copy, **Send text**, **Send + Enter**, Cancel, Escape cleanup, validation,
    `sendInput(false)` retry behavior, focus restoration, and context cleanup.
- `src/components/terminal-panel.test.tsx`
  - Covers microphone accessibility, unsupported/insecure/disconnected states,
    status vs alert semantics, disclosure, interim plain-text rendering, review
    edit/focus, exact send strings, validation, failed-send retention/no focus,
    success focus restore, Cancel/Escape, cleanup, and terminal-container
    stability.

## Architecture Boundary

No DevDeck server audio handling, raw audio transport, transcript persistence,
telemetry/logging, third-party speech SDK/API, secret, CSP/Permissions-Policy
change, WebSocket message type, HTTP endpoint, or ADR change was introduced. Voice
state remains local to `TerminalPanel`/`useVoiceInput`.

## Verification

- `./harness test` — PASS after T1 hook changes.
- `./harness verify` after T1 — lint/format/build/test PASS; smoke DEGRADED
  because port `9999` is held by process `272628` in
  `/workspaces/devdeck/.trees/82-close-project-action`, not this worktree.
- `./harness test` — PASS after T2 TerminalPanel workflow changes.
- `./harness verify` after T2 — lint/format/build/test PASS; smoke DEGRADED for
  the same external port `9999` listener.
- Final `./harness test` — PASS.
- Final `./harness verify` after the approved external stale port listener was
  cleared — PASS: lint, format check, build, test, and smoke all passed.
- Targeted deterministic E2E voice test —
  `DEVDECK_E2E_WEB_PORT=18070 DEVDECK_E2E_TERMINAL_PORT=13100 npx playwright test e2e/terminal.spec.ts --grep "voice input"` —
  PASS.
- Final confirmation `./harness verify` after E2E additions — PASS with
  evidence `.harness/evidence/verify-20260612T001740Z-297664.json`.

## E2E / Manual Coverage Strategy

Deterministic browser-level Web Speech mocking is covered in
`e2e/terminal.spec.ts`. The test injects a mocked `SpeechRecognition` object,
emits interim and final transcripts, edits the review field, clicks
**Send + Enter**, and asserts the reviewed command reaches xterm output. Manual
browser permission and device behavior should still be checked:

1. Supported secure browser: allow microphone, speak a short command, confirm
   interim text appears, final text enters the editable review field, **Send
   text** sends no enter, and **Send + Enter** sends with `\r`.
2. Deny microphone permission and confirm an assertive denied alert with retryable
   browser/site-settings guidance.
3. Unsupported browser or speech API disabled: microphone remains visible but
   disabled with accessible unsupported status.
4. Insecure context: confirm microphone is disabled and secure-context alert is
   shown.
5. Mobile viewport: confirm the visible microphone control and review panel are
   reachable and do not break existing keyboard helper behavior.
6. Validation: whitespace-only and 501-character review text show alerts without
   clearing text.
7. Terminal unavailable: force `sendInput(false)`/disconnect and confirm reviewed
   text is retained, focus stays in review, and no terminal focus restore occurs.
8. Cancel/Escape: confirm recognition stops, transient state clears, and terminal
   focus is restored when possible.
9. Disconnect/reconnect, slug changes, worktree changes, and unmount: confirm
   voice state clears and late recognition callbacks do not affect stale panels.
10. Confirm the xterm container remains mounted while opening/listening/reviewing
    and after sending/cancelling voice input.
