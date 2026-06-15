# Research Brief — Issue #80 (Revised)

## Issue

- **Number:** #80
- **Title:** feat(terminal): add browser microphone voice input for xterm
- **Repository:** jsburckhardt/devdeck
- **Revision note:** The first research pass was title-only because `gh` authentication was invalid. This revised brief supersedes it with the authenticated issue body and the full checklist requirements.

## Scope Classification

- **scope_type:** `issue`
- **Rationale:** Voice input remains a browser-only terminal helper built on the Web Speech API and the existing `useTerminal.sendInput(data)` / `useTerminal.focusTerminal()` contract. It does not require server-side audio handling, new WebSocket messages, new endpoints, persistence, or third-party speech services.
- **ADR required:** No. The issue explicitly says a new ADR is only expected if the implementation adds server-side speech-to-text, raw audio transport, persistent transcripts, third-party speech SDKs, CSP/Permissions-Policy changes, third-party APIs, or secrets.
- **Core-component update required:** Yes. CORE-COMPONENT-0003 was partially amended for basic voice input, but it must also describe the review-and-send workflow, state model, error normalization, focus rules, disclosure copy, and cleanup requirements.

## Corrected Issue Summary

Add a first-class browser microphone workflow to the xterm terminal panel. The feature must be safe for terminal command input: speech recognition starts only from an explicit user gesture, final transcripts populate an editable labelled review field, and text reaches the terminal only after the user explicitly chooses **Send text** or **Send + Enter**.

The UI must be accessible and panel-local. It needs a keyboard-reachable microphone control, live status text, assertive permission/error alerts, an editable review panel, validation for empty and over-500-character text, explicit cancel and Escape behavior, and inline copy explaining browser/vendor speech processing plus shell-history implications.

## Existing Architecture

| Requirement | Status | Source |
|-------------|--------|--------|
| `sendInput(data: string): boolean` on `useTerminal` | Implemented | `src/hooks/use-terminal.ts`; Decision #154 |
| `focusTerminal(): boolean` on `useTerminal` | Implemented | `src/hooks/use-terminal.ts`; Decision #157 |
| `screenReaderMode: true` in xterm constructor | Implemented | `src/hooks/use-terminal.ts`; Decision #56 |
| Authenticated binary WebSocket terminal input path | Implemented | CORE-COMPONENT-0003; Decision #155 |
| `sendInput` returns `false` when no socket is open | Implemented | CORE-COMPONENT-0003; Decision #156 |
| Partial `useVoiceInput` hook and mic button | Partial | Current Issue #80 implementation |

## Full Architecture Constraints

1. Use browser-side `SpeechRecognition` / `webkitSpeechRecognition`; do not send raw audio to DevDeck.
2. Do not add HTTP/WebSocket endpoints, server-side speech processing, third-party SDKs, persistence, telemetry, or logs for audio/transcripts/permission state/errors.
3. Start recognition only from an explicit user gesture.
4. Detect browser support safely during SSR, hydration, and jsdom tests.
5. Treat a missing Permissions API as unknown support, not failure. Normalize denied/site-policy errors from Permissions API or Web Speech errors where available.
6. Guard `window.isSecureContext` before starting recognition and surface an actionable inaccessible-context error.
7. Keep voice helper state panel-local; do not store it in OpenProjects, localStorage, or sessionStorage.
8. Preserve existing terminal container mounting and WebSocket connection while opening/closing/listening/sending/cancelling voice UI.
9. Track session generation or terminal context so late recognition callbacks after stop/unmount/project/worktree change cannot update stale UI or send to a stale terminal.
10. Render transcript text as text only; never use HTML injection.
11. Preserve reviewed spacing and shell metacharacters exactly when sending non-empty text.
12. Use existing UI/icon patterns (`@phosphor-icons/react`, native `title` attributes, no tooltip dependency).

## Required Voice States

The implementation must expose enough state/copy for:

| State | Meaning |
|-------|---------|
| `unsupported` | Browser lacks `SpeechRecognition` / `webkitSpeechRecognition` |
| `insecure-context` | Secure context requirement is not met |
| `permission-needed` | Recognition can be started by user gesture, permission result unknown |
| `listening` | Recognition session active and waiting for speech |
| `transcribing` | Interim speech text is available |
| `ready-to-send` | Final transcript populated the editable review field |
| `denied` | Permission or speech service denied (`not-allowed`, `service-not-allowed`) |
| `errored` | Other recognition errors (`no-speech`, `audio-capture`, `network`, `aborted`, unknown) |

## Required Transcript Flow

1. User activates the mic control; focus stays on the active mic/stop control.
2. Interim transcript text is displayed as plain text with polite live semantics.
3. Final transcript text populates an editable labelled review field.
4. Focus moves to the review field or first send action after final transcript.
5. User may edit transcript text before sending.
6. **Send text** calls `sendInput(reviewText)` exactly.
7. **Send + Enter** calls `sendInput(`${reviewText}\r`)` exactly.
8. Empty or whitespace-only reviewed text cannot be sent and shows validation.
9. Reviewed text longer than 500 characters cannot be sent and shows validation.
10. If `sendInput` returns `false`, retain the review text, show a retryable terminal-unavailable error, and do not call `focusTerminal()`.
11. Successful send clears voice state and calls `focusTerminal()`.
12. Cancel and Escape clear transient state, stop recognition, and call `focusTerminal()` when possible.
13. Disconnect, project change, worktree change, and unmount stop recognition and clear transient voice state.

## Required Accessibility

| Element | Requirement |
|---------|-------------|
| Mic control | Keyboard reachable, visible by default, `aria-label`, `title`, `aria-pressed`, and `aria-controls` when the review panel is rendered |
| Status | `role="status"` with `aria-live="polite"` for idle/listening/transcribing/ready states |
| Errors | `role="alert"` or equivalent assertive semantics for permission and recognition errors |
| Review field | Labelled editable field, focused after final transcript where possible |
| Disabled controls | Accessible disabled semantics while terminal input is unavailable, plus visible explanatory text |
| Focus | Predictable movement: start stays on control; final transcript moves to review; send/cancel returns to terminal; failed send keeps focus in review |

## Error Normalization Requirements

Known Web Speech errors must map to actionable user-facing copy:

| Error code | Meaning |
|------------|---------|
| `not-allowed` | Microphone permission denied; explain site/browser settings may need to change |
| `service-not-allowed` | Speech service blocked by browser/site policy |
| `no-speech` | No speech detected; user may retry |
| `audio-capture` | Microphone unavailable or not detected |
| `network` | Recognition network/service problem |
| `aborted` | Recognition was cancelled |
| unknown | Generic voice input error with retry guidance |

## Current Partial Implementation Gaps

The existing implementation is a useful foundation but does not satisfy the authenticated checklist:

- `useVoiceInput` has only `isAvailable`, `isListening`, and `error`; it lacks a full status model.
- `interimResults` is `false`, but the issue requires interim transcript display.
- Error normalization is incomplete and currently echoes raw browser error codes.
- The hook lacks a generation/context guard for late callbacks.
- `TerminalPanel` sends final transcripts directly to `sendInput()` instead of requiring editable review.
- The review field, **Send text**, **Send + Enter**, Cancel, empty validation, 500-character validation, and `sendInput(false)` retry path are missing.
- Voice errors currently render as polite `role="status"` instead of assertive `role="alert"`.
- The mic button lacks `aria-controls` when the transcript panel is rendered.
- Voice state is not cleared on slug/worktree changes.
- Focus management for final transcript, send, cancel, failed send, and Escape is incomplete.
- Required disclosure copy is missing.
- Component tests do not cover the review-and-send workflow.
- E2E/manual coverage strategy is not yet documented.

## Impacted Files

| File | Change type | Description |
|------|-------------|-------------|
| `src/hooks/use-voice-input.ts` | Modify | Add status model, interim transcript state, final transcript delivery, normalized errors, permission advisory support, generation guard, cancel/clear behavior |
| `src/hooks/use-voice-input.test.ts` | Modify | Cover state model, interim/final events, error normalization, cancellation, cleanup, context guards |
| `src/components/terminal-panel.tsx` | Modify | Add transcript review panel, send/cancel controls, validation, disclosure copy, ARIA/focus behavior, disconnect/context cleanup |
| `src/components/terminal-panel.test.tsx` | Modify | Cover mic accessibility, live/alert semantics, review field, validation, exact send strings, focus restoration, terminal container stability |
| `project/architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md` | Amend | Add authenticated voice review workflow and accessibility/error/focus/cleanup rules |
| `project/architecture/ADR/DECISION-LOG.md` | Append | Add decision records for the review workflow and full voice input safety policy |
| `project/issues/80/implementation/README.md` | Update | Record final implementation and any E2E/manual coverage notes |

## Testing Requirements

- Unit tests: speech support detection, secure context, Permissions API unknown/denied behavior where supported, error normalization, start/stop/cancel, interim/final transcript handling, cleanup on unmount/context change, and late-event guards.
- Component tests: mic accessibility, live status, assertive errors, review field, empty and overlong validation, disconnected-send prevention, disabled states, exact `sendInput(reviewText)` and `sendInput(`${reviewText}\r`)`, focus behavior, and terminal container stability.
- SSR/hydration regression: render/rerender TerminalPanel without speech APIs and ensure no browser-global crash.
- E2E/manual: deterministic mocked speech recognition is preferred; if existing E2E infrastructure is absent or out of scope, implementation notes must document manual checks for allow/deny permission, mobile viewport behavior, and connection preservation.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Recognition callbacks arrive after stop/context change | Medium | Generation/context guard before state updates and send callbacks |
| Voice mistakes execute shell commands | High | Editable review field; no auto-send; distinct Send + Enter action and shell-history warning |
| Browser support/permission behavior varies | Medium | Runtime detection, advisory permissions check, normalized error copy, retryable start |
| Accessibility regressions | Medium | Live regions, assertive alerts, labels, `aria-controls`, focus tests |
| Stale terminal send during reconnect | Medium | Disable sends when terminal input unavailable and handle `sendInput(false)` |

## Planner Handoff

1. Treat the current implementation as partial, not final.
2. Update CORE-COMPONENT-0003 and DECISION-LOG before returning to implementation.
3. Plan a hook expansion plus a TerminalPanel review-panel integration.
4. Preserve no-new-server/no-new-runtime-dependency constraints.
5. Require `./harness verify` before final Verify stage commit/PR.
