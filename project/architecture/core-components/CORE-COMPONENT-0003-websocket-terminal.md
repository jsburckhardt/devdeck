# CORE-COMPONENT-0003: WebSocket Terminal Communication

## Status

Adopted (updated) - 2026-06-11

## Purpose

Establish the communication pattern between the browser-based terminal (xterm.js) and the server-side PTY process (node-pty). This is the core architectural concern that enables the real terminal experience in DevDeck.

## Scope

- Frontend: xterm.js terminal widget and WebSocket client
- Backend: WebSocket server, PTY process lifecycle management
- Communication protocol between frontend and backend
- Terminal input helper controls, including keyboard helpers and browser-only microphone review input, that inject raw input through `useTerminal.sendInput(data)`

## Definition

### Rules
- Every terminal session MUST be backed by a real PTY process spawned via node-pty
- Communication between xterm.js and node-pty MUST use WebSocket (ws library)
- The backend MUST clean up PTY processes when the WebSocket connection closes
- Terminal resize events MUST be propagated from xterm.js to node-pty
- The WebSocket endpoint MUST be served from the Next.js backend (API route or custom server)
- The WebSocket upgrade request MUST include a valid bearer token as a `token` query parameter or via the `devdeck_token` HTTP cookie
- The server MUST validate the token BEFORE spawning a PTY process
- Invalid or missing tokens MUST result in WebSocket close code 4401 ("Unauthorized") with no PTY spawned
- The frontend MUST detect close code 4401 and surface an "Unauthorized" error without reconnecting
- The client MAY pass `slug=<project-slug>` as a query parameter on the WebSocket upgrade URL to request a project-specific terminal session
- The server MUST resolve the CWD server-side using `resolveProjectPath(slug)` — the filesystem path MUST NOT be exposed to the client in any WebSocket message
- The server MUST sanitize the slug before passing it to `resolveProjectPath` or using it as a tmux session name
- The server MUST use this terminal spawn decision tree for project slugs:
  1. If `<resolvedCwd>/.devcontainer/.tmux-shared` exists and is a socket, and `tmux -S <socketPath> has-session -t <sanitizedSlug>` succeeds, spawn `tmux -S <socketPath> attach-session -t <sanitizedSlug>` using the shared socket.
  2. If `.devcontainer/.tmux-shared` is absent, attempt `tmux new-session -A -s <sanitizedSlug>` on the system default tmux socket. System-default tmux sessions are visible to processes for the same host user.
  3. If tmux attach/create fails, tmux exits non-zero, or tmux cannot be spawned, fall back to a regular shell in the resolved project directory.
- If no slug is provided, the server MUST fall back to the configured default CWD (`DEVDECK_WORKSPACE_ROOT`, `options.cwd`, or `os.homedir()`)
- Terminal server token, bind host, bind port, projects directory, data directory, and workspace root MUST be resolved by the centralized startup config flow and forwarded to `src/server/terminal-server.mts` through environment variables; the standalone `.mts` server MUST remain env-driven and MUST NOT import the config loader.
- The client MUST pass initial terminal dimensions as `cols` and `rows` query parameters on the WebSocket upgrade URL so the server can spawn the PTY at the correct size before any resize message arrives
- The frontend MUST load `@xterm/addon-clipboard` (ClipboardAddon) to support OSC 52 clipboard escape sequences from programs like tmux and vim
- The frontend MUST set `screenReaderMode: true` in the Terminal constructor options to enable accessibility input methods (IME, voice-to-text)
- After the PTY is successfully spawned (and before flushing any pending input messages), the server MUST send a JSON text frame `{ type: "setup", mode: "tmux" | "shell" }` to the client to communicate the active session mode
- When tmux attach exits with a non-zero code and the server falls back to a regular shell, the server MUST send `{ type: "setup", mode: "shell", fallback: true, reason: "tmux-attach-failed" }` before wiring the fallback PTY
- The client MUST handle `setup` messages: update `terminalMode` state, and call `term.clear()` when `fallback: true` is received to erase any error output the failed tmux process may have written to the terminal buffer
- The client MUST reset `terminalMode` to `"unknown"` and `isFallback` to `false` at the start of each `connect()` attempt
- The client MAY pass `worktree=<relative-path>` (e.g. `.trees/feature-branch`) as a query parameter on the WebSocket upgrade URL to open a terminal scoped to a git worktree directory
- When `worktree` is present, the server MUST resolve CWD to `<resolvedProjectRoot>/<relativeWorktreePath>` and MUST bypass the tmux decision tree entirely, spawning a plain login shell in the worktree directory
- The server MUST reject `worktree` paths containing `..` segments or resolving outside the project root; on rejection, fall back to the project root shell
- An `extractWorktree(req: IncomingMessage): string | null` function MUST be added to `terminal-server.mts` to extract and sanitize the `worktree` query param before it reaches `resolveTerminalSetup`
- Worktree terminal sessions MUST always result in `{ type: "setup", mode: "shell" }` sent to the client
- The server MAY send `{ type: "status", copilotState: CopilotCliState }` JSON text frames to communicate Copilot CLI state changes detected via PTY output pattern matching (see ADR-0005)
- A pure function `detectCopilotState(strippedOutput: string): CopilotCliState | null` MUST be implemented in `terminal-server.mts` to detect Copilot CLI state from PTY output
- `detectCopilotState()` MUST strip ANSI escape sequences from PTY output before pattern matching
- The server MUST maintain a per-project Copilot CLI status cache keyed by project slug so newly connected browser clients can receive the current known `"running"` or `"waiting"` state without waiting for fresh PTY output
- The server MUST broadcast detected Copilot CLI status changes to every connected WebSocket client for the same project slug
- The server MUST only emit a `"status"` frame when the detected state differs from the current per-connection `copilotState` or cached per-project state
- The server MUST maintain a per-connection idle timeout (default 30 seconds) that reverts `copilotState` and the per-project status cache to `"idle"` when no Copilot CLI output pattern is matched within the timeout window
- The server MUST reset the idle timer on every `onData` call that matches a Copilot CLI pattern
- The `useTerminal` hook MUST handle `"status"` messages in its `onmessage` dispatch and expose `copilotStatus: CopilotCliState` on its return type
- The `useTerminal` hook MUST reset `copilotStatus` to `"idle"` at the start of each `connect()` attempt
- The `useTerminal` hook MUST expose `sendInput(data: string): boolean` for UI helpers to send raw terminal input through the existing authenticated binary WebSocket frame path
- `sendInput(data)` MUST encode strings with `TextEncoder` and send only when the active WebSocket is open
- `sendInput(data)` MUST return `false` without throwing when the active WebSocket is absent or not open, and MUST NOT queue stale input across reconnects
- The `useTerminal` hook MUST expose `focusTerminal(): boolean` so terminal helper controls can restore xterm focus after touch or pointer activation
- Browser microphone voice input MUST be implemented as a standalone `useVoiceInput` hook that owns the `SpeechRecognition` lifecycle outside `TerminalPanel`
- Browser microphone voice input MUST use only browser-provided `SpeechRecognition` / `webkitSpeechRecognition` and MUST NOT introduce raw audio transport, server-side speech processing, new endpoints, third-party speech SDKs/APIs, secrets, persistence, telemetry, or transcript/permission/error logging
- `useVoiceInput` MUST remain SSR, hydration, and jsdom safe by resolving browser globals behind `typeof window !== "undefined"` and treating missing Web Speech support as `unsupported`
- `useVoiceInput` MUST expose a voice status model that can represent `unsupported`, `insecure-context`, `permission-needed`, `listening`, `transcribing`, `ready-to-send`, `denied`, and `errored`
- `useVoiceInput` MAY query the browser Permissions API for microphone permission state, but missing Permissions API support MUST be treated as unknown permission state rather than failure
- Browser speech recognition MUST start only from an explicit user gesture and MUST check `window.isSecureContext` immediately before starting recognition
- Browser speech recognition MUST run one-shot recognition with `continuous = false`, `interimResults = true`, and `lang = navigator.language || "en-US"`
- Interim voice transcripts MUST be displayed as plain text with polite live semantics and MUST NOT be sent to the terminal
- Final voice transcripts MUST populate a labelled editable review field and MUST NOT be sent to the terminal automatically
- Terminal voice review UI MUST stay panel-local and MUST NOT persist voice status, permission state, transcripts, or review text in OpenProjects, `localStorage`, or `sessionStorage`
- Terminal voice review UI MUST disclose that browser/vendor speech processing may occur and that sent text may enter shell history
- TerminalPanel MUST render the microphone entry point visibly by default and communicate unsupported or inaccessible states accessibly
- Terminal microphone controls MUST expose accessible `aria-label`, `title`, `aria-pressed`, and `aria-controls` when the review panel is rendered
- Voice status copy MUST use `role="status"` with polite live semantics for idle/listening/transcribing/ready states, and voice permission/recognition/send errors MUST use assertive alert semantics
- Permission and recognition errors MUST be normalized to actionable messages for `not-allowed`, `service-not-allowed`, `no-speech`, `audio-capture`, `network`, `aborted`, and unknown errors
- Voice review send actions MUST validate non-empty reviewed text and reject reviewed text longer than 500 characters before terminal dispatch
- `Send text` MUST call `sendInput(reviewText)` exactly, preserving reviewed spacing and shell metacharacters
- `Send + Enter` MUST call ``sendInput(`${reviewText}\r`)`` exactly and MUST be the only voice action that appends an enter sequence
- If `sendInput(data)` returns `false`, TerminalPanel MUST retain the reviewed text, show a retryable terminal-unavailable alert, and MUST NOT call `focusTerminal()`
- Successful voice review sends MUST clear transient voice state and restore xterm focus by calling `focusTerminal()`
- Cancel and Escape handling MUST stop active recognition, clear transient voice state, and call `focusTerminal()` when possible
- Disconnect, slug change, worktree change, and unmount MUST stop active recognition and clear transient voice state
- Voice recognition callbacks MUST use a generation or terminal-context guard so late callbacks after stop, cancel, unmount, disconnect, slug change, or worktree change cannot update stale UI or send to a stale terminal
- Voice transcript and review text MUST be rendered as text only; HTML injection mechanisms such as `dangerouslySetInnerHTML` MUST NOT be used
- Terminal microphone controls MUST be disabled while terminal input is unavailable and MUST NOT start recognition when disconnected

### Interfaces
- **WebSocket endpoint:** `/api/terminal?token=<bearer>&slug=<project-slug>&worktree=<relative-path>&cols=<N>&rows=<N>` — accepts WebSocket upgrade requests with valid token (via query param or cookie); `slug` is optional and selects per-project CWD and tmux session; `worktree` is optional and, when combined with `slug`, overrides CWD to the worktree directory in shell-only mode; `cols`/`rows` are optional initial dimensions (clamped server-side, defaults to 80×24)
- **Token handshake:** On upgrade, server extracts `token` from query string or `devdeck_token` cookie, validates via `crypto.timingSafeEqual`, rejects with close code 4401 if invalid
- **Frontend hook:** `useTerminal(options?: { slug?, worktree?, wsUrl?, theme? })` — manages xterm.js instance, WebSocket connection, token injection, addon lifecycle, and exposes `containerRef`, `terminalMode`, `isFallback`, `sendInput(data)`, and `focusTerminal()` state/actions; when `worktree` is provided, the WebSocket URL includes it as a query parameter
- **Message format:** Raw binary data (ArrayBuffer) for terminal I/O; JSON for control messages (resize, ping)
- **Setup message (server → client):** `{ type: "setup", mode: "tmux" | "shell", fallback?: true, reason?: string }` — sent as a JSON text frame immediately after PTY spawn and on any session mode transition (e.g., tmux fallback to shell)
- **Status message (server → client):** `{ type: "status", copilotState: "idle" | "running" | "waiting" }` — sent as a JSON text frame whenever the server detects a Copilot CLI state change via PTY output pattern matching, broadcasts that change to same-project clients, or replays cached same-project state to a newly connected client
- **CopilotCliState type:** `"idle" | "running" | "waiting"` — inlined in `terminal-server.mts` (no `@/` imports) and exported from `src/lib/types.ts` for client-side use
- **Frontend hook (extended):** `useTerminal(options?)` additionally returns `copilotStatus: CopilotCliState` (`"idle"` by default, updated on `"status"` frames)
- **Helper input actions:** `sendInput(data: string): boolean` returns `true` only after sending encoded bytes to the active open WebSocket; `focusTerminal(): boolean` returns `true` only after focusing the active xterm instance
- **Voice input hook:** `useVoiceInput(...)` encapsulates browser `SpeechRecognition` detection and lifecycle, exposes support/status/interim/final transcript state, normalized errors, start/stop/cancel/clear actions, and a late-callback generation guard without adding a server interface
- **Terminal microphone review action:** `TerminalPanel` uses `useVoiceInput` to start/stop one-shot recognition from a toolbar button, displays interim transcripts, copies final transcripts into an editable review field, and sends only user-reviewed text through `sendInput(data)` or ``sendInput(`${reviewText}\r`)``
- **Terminal server configuration:** startup resolves ADR-0006 config values and forwards them as `DEVDECK_TOKEN`, `TERMINAL_HOST`, `TERMINAL_PORT`, `DEVDECK_PROJECTS_DIR`, `DEVDECK_DATA_DIR`, and `DEVDECK_WORKSPACE_ROOT`; `TerminalServerOptions` remain available for direct test overrides.

### Expectations
- Terminal input/output latency MUST be under 50ms on localhost
- PTY processes MUST be killed when the client disconnects
- The terminal MUST support resize (xterm.js addon-fit → resize message → node-pty.resize)
- Connection loss MUST show a visible error state in the terminal UI
- Voice input MUST degrade gracefully when browser speech recognition, microphone permission, secure context, or terminal connectivity is unavailable, without weakening keyboard or xterm input

## Rationale

Raw WebSocket with binary data provides the lowest latency for terminal I/O. xterm.js natively supports binary attachments. node-pty is the standard Node.js PTY library used by VS Code's terminal. This combination is battle-tested and well-documented.

Browser microphone input is intentionally constrained to a review-and-send helper because speech recognition can misrecognize shell commands. Keeping recognition browser-only avoids DevDeck audio custody, while requiring editable review plus explicit send actions prevents final transcripts from executing commands or entering shell history without user confirmation.

## Usage Examples

```typescript
// Frontend: useTerminal hook
const { containerRef, status, isConnected, error, retry } = useTerminal({
  wsUrl: "ws://localhost:3100/api/terminal",
});

// Backend: WebSocket handler (with token validation and initial dimensions)
import { WebSocketServer } from 'ws';
import * as pty from 'node-pty';
import { validateToken } from '../lib/auth';

wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (!token || !validateToken(token)) {
    ws.close(4401, 'Unauthorized');
    return;
  }
  const cols = Math.max(1, Math.min(500, Number(url.searchParams.get('cols')) || 80));
  const rows = Math.max(1, Math.min(200, Number(url.searchParams.get('rows')) || 24));
  const shell = pty.spawn('bash', ['-l'], { cols, rows, cwd: os.homedir() });
  ws.on('message', (data) => shell.write(data));
  shell.onData((data) => ws.send(data));
});
```

## Integration Guidelines

- The WebSocket server setup should be in `src/server/terminal-server.mts` (`.mts` extension required for ESM interop with `tsx` runner)
- Config-file loading belongs in startup code, not in `src/server/terminal-server.mts`; the terminal server consumes resolved values through env vars to preserve standalone `.mts` compatibility.
- The frontend hook should be in `src/hooks/use-terminal.ts`
- xterm.js addons (fit, web-links, unicode11, clipboard) should be loaded in the hook
- PTY shell selection should default to the user's `$SHELL` or fall back to `/bin/bash`
- **Binary framing note:** `node-pty`'s `onData` emits `string`; the server must call `ws.send(Buffer.from(data, 'utf8'))` to produce a binary WebSocket frame. The frontend must set `ws.binaryType = "arraybuffer"` and check `event.data instanceof ArrayBuffer` in `onmessage`.
- Resolve browser speech recognition with an SSR-safe `typeof window !== "undefined"` guard and prefer `window.SpeechRecognition`, falling back to `window.webkitSpeechRecognition`
- Configure browser recognition with `continuous = false`, `interimResults = true`, and `lang = navigator.language || "en-US"`
- Keep microphone activation user-initiated from the terminal toolbar, use native `title` attributes rather than tooltip dependencies, and use the existing `@phosphor-icons/react` icon library
- Keep the voice review panel local to `TerminalPanel`, connect the microphone control with `aria-controls`, and restore focus according to the review workflow rules
- Render interim transcripts and reviewed text through React text/textarea content only; do not inject transcript HTML

## Exceptions

- In test environments, the WebSocket connection may be mocked
- In CI, terminal tests may use a stub PTY instead of real node-pty

## Enforcement

- [x] Automated checks: WebSocket connection tests
- [x] Code review checklist: Verify PTY cleanup on disconnect
- [x] Test coverage requirements: Terminal hook and WebSocket handler must have unit tests
- [x] Automated checks: `use-voice-input.test.ts` covers speech availability, secure-context guard, optional permission checks, start/stop/cancel/clear, interim/final transcript state, error normalization, cleanup, and stale-callback guards
- [x] Automated checks: `terminal-panel.test.tsx` covers microphone accessibility, live status/alert semantics, editable review, validation, exact `Send text` / `Send + Enter` dispatch strings, `sendInput(false)` retry behavior, focus restoration, disconnect/context cleanup, and terminal container stability
- [x] Verification: `./harness verify` passes before implementation completion

## Related ADRs

- [ADR-0002-tech-stack](../ADR/ADR-0002-tech-stack.md)
- [ADR-0004-token-authentication](../ADR/ADR-0004-token-authentication.md)
- [ADR-0005-copilot-cli-status-detection-strategy](../ADR/ADR-0005-copilot-cli-status-detection-strategy.md)
- [ADR-0006-config-file-driven-configuration](../ADR/ADR-0006-config-file-driven-configuration.md)
