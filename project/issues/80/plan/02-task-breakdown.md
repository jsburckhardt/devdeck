# Task Breakdown: Issue #80

## Task T1: Expand `useVoiceInput` state and lifecycle

- **Status:** Planned
- **Complexity:** High
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003 (Decisions #172, #173, #175-#178, #183-#185, #188), CORE-COMPONENT-0006 (Decision #19), CORE-COMPONENT-0009 (Decision #147)

### Description
Replace the partial hook with a browser-only `SpeechRecognition` / `webkitSpeechRecognition` wrapper that owns support detection, status, interim/final transcript state, normalized errors, advisory permission checks, cleanup, cancel/clear behavior, and late-callback protection.

### Acceptance Criteria
- The hook remains SSR, hydration, and jsdom safe and detects standard, vendor-prefixed, and unsupported Web Speech API states.
- The hook exposes states/copy sufficient for `unsupported`, `insecure-context`, `permission-needed`, `listening`, `transcribing`, `ready-to-send`, `denied`, and `errored`.
- `start()` only runs from a caller-triggered user gesture path, checks `window.isSecureContext` immediately before start, and does not construct or start recognition in insecure or unsupported states.
- Optional `navigator.permissions.query({ name: "microphone" })` handling treats unsupported Permissions API behavior as unknown permission state rather than failure.
- Recognition is configured with `continuous = false`, `interimResults = true`, and `lang = navigator.language || "en-US"`.
- Interim transcript text updates hook state for display only; final transcript text updates final/review-ready state and is not sent to the terminal by the hook.
- Known Web Speech errors (`not-allowed`, `service-not-allowed`, `no-speech`, `audio-capture`, `network`, `aborted`, unknown) normalize to actionable error status/copy.
- `stop`, `cancel`, `clear`, unmount cleanup, and context/generation changes detach handlers, stop active recognition when safe, clear transient state when requested, and ignore late callbacks.
- The hook does not persist or log audio, transcripts, permission state, or errors and adds no runtime dependency.

### Test Coverage
- Update `src/hooks/use-voice-input.test.ts` with Vitest `renderHook` coverage for support detection, secure-context guard, Permissions API unknown/denied paths, one-shot configuration with interim results enabled, interim/final transcript state, normalized errors, stop/cancel/clear behavior, unmount cleanup, and generation/late-callback guards.
- Include regression coverage that stale callbacks after cancel/unmount/context change cannot update transcript/error state.
- Use `./harness test` for targeted feedback and `./harness verify` before completion.

## Task T2: Add TerminalPanel transcript review-and-send workflow

- **Status:** Planned
- **Complexity:** High
- **Dependencies:** T1
- **Related ADRs:** ADR-0002, ADR-0004
- **Related Core-Components:** CORE-COMPONENT-0003 (Decisions #154-#157, #175-#189), CORE-COMPONENT-0005 (Decision #26), CORE-COMPONENT-0006 (Decision #19), CORE-COMPONENT-0009 (Decision #147)

### Description
Replace direct final-transcript dispatch in `src/components/terminal-panel.tsx` with a panel-local review UI that lets users inspect/edit speech text before sending it through the existing authenticated terminal input path.

### Acceptance Criteria
- The microphone entry point is keyboard reachable and visible by default, uses existing `@phosphor-icons/react`/native `title` patterns, and exposes `aria-label`, `aria-pressed`, disabled semantics, and `aria-controls` when the voice panel is rendered.
- Starting recognition is only possible from the microphone control; focus stays on the active mic/stop control while recognition starts or stops.
- Status text for idle/listening/transcribing/ready states uses polite `role="status"` semantics; permission, recognition, validation, and terminal-unavailable errors use assertive alert semantics.
- Interim transcript text renders as plain text only and is never sent.
- Final transcript text populates a labelled editable review field; focus moves to the review field or first send action when final text is ready.
- The review panel includes disclosure copy explaining browser/vendor speech processing and shell-history implications.
- **Send text** calls `sendInput(reviewText)` exactly, preserving reviewed spacing, shell metacharacters, and no automatic newline.
- **Send + Enter** calls ``sendInput(`${reviewText}\r`)`` exactly and is the only voice path that appends an enter sequence.
- Empty/whitespace-only review text and review text longer than 500 characters cannot be sent and show validation without clearing the text.
- If `sendInput(...)` returns `false`, the review text is retained, a retryable terminal-unavailable alert is shown, and `focusTerminal()` is not called.
- Successful send clears transient voice state and calls `focusTerminal()`.
- Cancel and Escape stop recognition, clear transient voice state, and call `focusTerminal()` when possible.
- Disconnect, slug change, worktree change, and unmount stop recognition, clear voice state, and prevent late callbacks from affecting stale UI or terminals.
- The terminal container remains mounted/stable while opening, listening, reviewing, sending, cancelling, or clearing voice UI.
- No server file, WebSocket message type, endpoint, CSP, Permissions-Policy, persistence, telemetry, or third-party speech dependency is added.

### Test Coverage
- Update `src/components/terminal-panel.test.tsx` to cover microphone accessibility attributes, unsupported/insecure/disconnected states, status vs alert semantics, `aria-controls`, disclosure copy, interim display, editable review field focus, validation, exact `sendInput(reviewText)` and ``sendInput(`${reviewText}\r`)`` strings, `sendInput(false)` retry behavior, successful focus restoration, failed-send focus retention, Cancel/Escape, disconnect/slug/worktree cleanup, and terminal container stability.
- Include tests that normal xterm keyboard/helper input still works while voice UI is opened or closed.
- Use `./harness test` for targeted feedback and `./harness verify` before completion.

## Task T3: Update coverage strategy and implementation notes

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1, T2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003 (Decisions #175-#189), CORE-COMPONENT-0006 (Decisions #18, #19), CORE-COMPONENT-0009 (Decisions #146-#149)

### Description
Ensure the implementation has deterministic automated coverage for the authenticated checklist and records any E2E/manual coverage gaps in the issue implementation notes.

### Acceptance Criteria
- Hook and component tests are updated before claiming implementation completion.
- If deterministic Playwright coverage can mock Web Speech in the existing `e2e/` harness without flake, add or extend E2E coverage for the voice review workflow.
- If E2E coverage is not added, update `project/issues/80/implementation/README.md` with manual checks for microphone permission allow/deny, unsupported browser behavior, insecure-context messaging, mobile viewport behavior, Send text, Send + Enter, Cancel/Escape, disconnect/reconnect, and terminal connection preservation.
- Implementation notes explicitly state that no DevDeck server audio handling, transcript persistence, telemetry, third-party speech service, CSP/Permissions-Policy change, or new endpoint was introduced.

### Test Coverage
- Automated coverage must map back to T1 and T2 acceptance criteria in `use-voice-input.test.ts` and `terminal-panel.test.tsx`.
- E2E/manual notes must identify any checklist item not covered by Vitest and how it was or should be manually exercised.
- Use `./harness test` after test updates and `./harness verify` before completion.

## Task T4: Verify with the engineering harness

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T3
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0003 (Decisions #175-#189), CORE-COMPONENT-0006 (Decision #18), CORE-COMPONENT-0009 (Decisions #146-#150)

### Description
Run the repository verification surface through the repo-local harness and resolve failures before returning to Verify stage.

### Acceptance Criteria
- `./harness test` passes after hook, component, and any E2E/manual-note updates.
- `./harness verify` passes and is treated as the completion gate.
- Any direct command used for deeper diagnostics is justified with `./harness friction add`.
- The final implementation preserves the no-new-ADR/no-new-server boundary established in the action plan.

### Test Coverage
- Harness verification covers lint, format check, build, unit/component tests, and any configured smoke/E2E steps from `.harness/contract.yml`.
- Final verification evidence must include passing coverage for `src/hooks/use-voice-input.test.ts` and `src/components/terminal-panel.test.tsx`.
