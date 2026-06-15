# Test Plan: Issue #80

## Test TV1: Voice hook reports support, permission, and secure-context status

- **Type:** Unit
- **Task:** T1
- **Priority:** High

### Setup
Use Vitest with `renderHook`. Mock standard `window.SpeechRecognition`, `window.webkitSpeechRecognition`, missing speech APIs, `window.isSecureContext`, and optional `navigator.permissions.query`.

### Steps
1. Render `useVoiceInput` with no speech API.
2. Render with only `webkitSpeechRecognition`, then with standard `SpeechRecognition`.
3. Start with `window.isSecureContext = false`.
4. Mock Permissions API denied, granted, prompt, and unavailable paths.

### Expected Result
The hook is SSR/jsdom safe, reports `unsupported` when no constructor exists, treats missing Permissions API as unknown rather than failure, maps denied permission to `denied`, and blocks insecure starts before constructing recognition.

## Test TV2: Voice hook tracks interim/final transcripts and ignores stale callbacks

- **Type:** Unit
- **Task:** T1
- **Priority:** High

### Setup
Mock a recognition constructor with configurable `start`, `stop`, `onresult`, `onerror`, and `onend` handlers. Track hook state across rerenders and context/generation changes.

### Steps
1. Start recognition in a secure supported context.
2. Fire an interim result event.
3. Fire a final result event.
4. Cancel or clear the session, then fire late result/end/error callbacks.
5. Repeat after unmount or a simulated terminal context key change.

### Expected Result
Recognition is configured with `continuous = false`, `interimResults = true`, and the browser language fallback. Interim text appears only in interim state; final text appears in final/review-ready state; no transcript is sent by the hook; late callbacks cannot update stale transcript, status, or error state.

## Test TV3: Voice hook normalizes errors and cleans up lifecycle handlers

- **Type:** Unit
- **Task:** T1
- **Priority:** High

### Setup
Use the mocked recognition constructor and synthetic Web Speech error events for `not-allowed`, `service-not-allowed`, `no-speech`, `audio-capture`, `network`, `aborted`, and unknown errors.

### Steps
1. Start recognition and fire each error code.
2. Exercise `stop`, `cancel`, and `clear`.
3. Unmount while recognition is active.

### Expected Result
Known errors map to actionable user-facing messages and the correct `denied` or `errored` status. Cleanup detaches all event handlers, stops active recognition when safe, clears transient state only when requested, and does not throw on browser stop errors.

## Test TV4: TerminalPanel microphone, status, and alert accessibility

- **Type:** Component
- **Task:** T2
- **Priority:** High

### Setup
Mock `useTerminal` and `useVoiceInput` in `src/components/terminal-panel.test.tsx`. Use React Testing Library queries by role, label, and test id.

### Steps
1. Render unsupported, permission-needed, insecure, disconnected, listening, transcribing, ready-to-send, denied, and errored states.
2. Inspect the microphone control attributes.
3. Inspect status, interim transcript, review panel, and error regions.

### Expected Result
The microphone entry point is visible by default, keyboard reachable, disabled when terminal input is unavailable, and exposes `aria-label`, `title`, `aria-pressed`, and `aria-controls` when the review panel exists. Polite states use `role="status"`; permission/recognition/validation/send failures use assertive alert semantics; transcript text is rendered as text only.

## Test TV5: TerminalPanel validates review text and sends exact terminal input

- **Type:** Component
- **Task:** T2
- **Priority:** High

### Setup
Mock `sendInput` and `focusTerminal`. Mock `useVoiceInput` final transcript state so the review panel opens with editable text.

### Steps
1. Verify the final transcript populates a labelled editable field and disclosure copy is visible.
2. Edit the field to include spacing and shell metacharacters.
3. Click **Send text**.
4. Reopen the review field and click **Send + Enter**.
5. Attempt whitespace-only and over-500-character sends.
6. Make `sendInput` return `false` and retry.

### Expected Result
**Send text** calls `sendInput(reviewText)` exactly. **Send + Enter** calls ``sendInput(`${reviewText}\r`)`` exactly. Empty and overlong text show validation and do not send. `sendInput(false)` retains the review text, shows a retryable alert, and does not call `focusTerminal()`. Successful sends clear voice state and call `focusTerminal()`.

## Test TV6: TerminalPanel focus, cleanup, and terminal stability

- **Type:** Component
- **Task:** T2
- **Priority:** High

### Setup
Use mocked hook actions (`start`, `stop`, `cancel`, `clear`) and DOM focus assertions. Capture the terminal container element before voice UI changes.

### Steps
1. Start recognition from the microphone control.
2. Fire final transcript state and observe focus movement.
3. Use Cancel and Escape.
4. Rerender with disconnected terminal state, different `slug`, and different `worktree`.
5. Unmount the panel.

### Expected Result
Start keeps focus on the active mic/stop control. Final transcript focuses the review field or first send action. Cancel/Escape and successful send return focus to xterm when possible; failed send keeps review focus. Disconnect, slug/worktree change, and unmount stop/clear voice state. The original terminal container remains mounted during voice UI open/close/listen/review/send/cancel flows.

## Test TV7: SSR and no-browser-API regression

- **Type:** Unit/Component
- **Task:** T1, T2
- **Priority:** Medium

### Setup
Run hook and component tests with browser speech globals deleted and with minimal jsdom globals.

### Steps
1. Render the hook without `window.SpeechRecognition` or `window.webkitSpeechRecognition`.
2. Render and rerender `TerminalPanel` with voice unsupported.
3. Trigger normal terminal helper controls.

### Expected Result
No browser-global crash occurs during render/rerender, unsupported voice state is communicated accessibly, and existing terminal controls continue to work.

## Test TV8: E2E or manual coverage strategy is recorded

- **Type:** E2E/Manual
- **Task:** T3
- **Priority:** Medium

### Setup
Use the existing Playwright `e2e/` harness when deterministic Web Speech mocking is practical; otherwise update `project/issues/80/implementation/README.md`.

### Steps
1. Attempt deterministic browser-level Web Speech mocking for the review workflow.
2. If E2E is not added, document manual checks for permission allow/deny, unsupported browser, insecure-context messaging, mobile viewport, Send text, Send + Enter, Cancel/Escape, disconnect/reconnect, and terminal connection preservation.

### Expected Result
Either Playwright covers the critical review-and-send path deterministically, or implementation notes clearly identify manual coverage and why E2E was not added for browser speech behavior.

## Test TV9: Harness verification passes

- **Type:** Verification
- **Task:** T4
- **Priority:** High

### Setup
Use the repo-local harness.

### Steps
1. Run `./harness test` after implementation and test updates.
2. Run `./harness verify` before completion.
3. Record friction with `./harness friction add` for any direct diagnostic command.

### Expected Result
The harness reports passing verdicts for the test suite and full verification sequence, including the updated hook and TerminalPanel tests.
