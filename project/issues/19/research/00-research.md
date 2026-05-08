# Research Brief — Issue #19: Terminal Input Issues

## 1. Scope Classification

**Type:** `issue`

These are three concrete input-handling bugs in the existing xterm.js terminal implementation.
No new architectural decision is needed. CORE-COMPONENT-0003 requires a minor update to
document the new patterns introduced by the fixes (clipboard addon, initial-dimensions URL
parameter, screenReaderMode). No new ADR is warranted.

## 2. Problem Statement

The terminal panel (`src/components/terminal-panel.tsx` / `src/hooks/use-terminal.ts`) has
three distinct input-handling failures:

1. **Clipboard paste** — Ctrl+V and right-click paste do not work reliably in the xterm.js terminal.
2. **Voice-to-text / IME** — Windows voice-to-text (Win+H) and other accessibility input methods cannot type into the terminal.
3. **Tab completion duplication** — Pressing Tab to complete a shell command produces `cdcd folder/` instead of `cd folder/`.

## 3. Current State Analysis

### 3.1 Terminal Hook — `src/hooks/use-terminal.ts`

**xterm.js Terminal constructor options (lines 100–107):**
- `cursorBlink: true`, `fontSize: 13`, font family, `lineHeight: 1.5`, theme, `allowProposedApi: true`
- **No `screenReaderMode`** option set
- **No `customKeyEventHandler`** registered

**Addons loaded (lines 109–116):**
- `FitAddon` — container resize → terminal fit ✅
- `WebLinksAddon` — clickable hyperlinks ✅
- `Unicode11Addon` — Unicode 11 character widths ✅
- **`ClipboardAddon` — NOT loaded** ❌

**Input pipeline (lines 243–247):**
- `term.onData()` sends data to WS via `encoder.encode(data)`
- No explicit paste handling

**fitAddon.fit() timing issue (line 123):**
- `fitAddon.fit()` is called after `term.open()` at line 123
- This fires `term.onResize` synchronously
- But `term.onResize` is only registered at lines 249–253 — AFTER `fitAddon.fit()`
- **The fit-triggered resize event is silently discarded**

### 3.2 Terminal Server — `src/server/terminal-server.mts`

**Default dimensions (lines 216–217):**
- `initialCols = 80`, `initialRows = 24` (hardcoded defaults)

**PTY spawn timing:**
- For no-slug connections, `resolveTerminalSetup` resolves in a Node.js microtask (sub-millisecond)
- PTY spawns with default 80×24 before client's resize message arrives over the network

### 3.3 Existing Tests — `src/hooks/use-terminal.test.ts`

Tests T10–T21 cover: initial state, WebSocket connect/disconnect, binary input, resize,
reconnection, cleanup, 4401, and slug URL. **No tests exist for clipboard, IME, or tab completion.**

## 4. Root Cause Analysis

### 4.1 Clipboard Paste

**Root cause:** No explicit paste intercept for Ctrl+V. xterm.js's built-in textarea paste
handler is unreliable across platforms. No `ClipboardAddon` loaded for OSC 52 support.
No `customKeyEventHandler` to intercept Ctrl+V and use `navigator.clipboard.readText()`.

### 4.2 Voice-to-Text / IME

**Root cause:** `screenReaderMode` not enabled. Without it, the hidden textarea lacks proper
ARIA attributes required by Windows voice-to-text and IME input methods. `allowProposedApi: true`
is already set (line 106), which is the prerequisite for `screenReaderMode`.

### 4.3 Tab Completion Duplication

**Root cause:** Confirmed PTY dimension race condition.

1. `fitAddon.fit()` fires at line 123 but `term.onResize` registered at line 249 → resize event lost
2. Client sends resize in `ws.onopen` but PTY already spawned at 80×24 in a microtask
3. PTY with wrong column count causes readline cursor position math to be off
4. Tab completion redraws produce `cdcd folder` because cursor Y position is wrong

## 5. Proposed Solutions

### 5.1 Clipboard: Add `ClipboardAddon` + `customKeyEventHandler`
1. Add `@xterm/addon-clipboard` dependency
2. Load `ClipboardAddon` in `use-terminal.ts`
3. Register `customKeyEventHandler` that intercepts Ctrl+V → `navigator.clipboard.readText()` → `term.paste()`
4. `ClipboardAddon` handles OSC 52 escape sequences from tmux/vim

### 5.2 Voice-to-Text: Add `screenReaderMode: true`
One-line change in Terminal constructor options. `allowProposedApi: true` already set.

### 5.3 Tab Completion: Pass initial dimensions in WebSocket URL
1. Pass `cols`/`rows` as WebSocket URL query params from client
2. Server reads them during upgrade, before PTY spawn
3. Also: register `term.onResize` BEFORE `fitAddon.fit()` as defensive fix

## 6. CORE-COMPONENT-0003 Updates Required

1. Document initial dimensions in URL pattern (cols/rows query params)
2. Document ClipboardAddon requirement for OSC 52
3. Document `screenReaderMode: true` requirement for accessibility

No new ADR needed. DECISION-LOG.md needs 3 new decision entries.

## 7. Files to Change

| File | Change |
|------|--------|
| `src/hooks/use-terminal.ts` | Add `screenReaderMode: true`; add `ClipboardAddon`; add `customKeyEventHandler` for Ctrl+V; pass `cols`/`rows` in WS URL; register `onResize` before `fitAddon.fit()` |
| `src/server/terminal-server.mts` | Read `cols`/`rows` from upgrade URL query params for `initialCols`/`initialRows` |
| `package.json` | Add `@xterm/addon-clipboard` dependency |
| `src/hooks/use-terminal.test.ts` | Add tests for clipboard, screenReaderMode, and initial dimension passing |

## 8. Risks

| ID | Risk | Severity |
|----|------|----------|
| R1 | Clipboard API requires HTTPS or localhost | Medium |
| R2 | `screenReaderMode` DOM overhead | Low |
| R3 | `cols`/`rows` URL params injection | Low (clamped server-side) |
| R4 | Tab fix may not cover all shells | Medium (race fix is shell-agnostic) |
| R5 | `@xterm/addon-clipboard` adds `js-base64` transitive dep | Low |

## 9. References

| Document | Path |
|----------|------|
| GitHub Issue #19 | https://github.com/jsburckhardt/devdeck/issues/19 |
| Terminal hook | `src/hooks/use-terminal.ts` |
| Terminal panel | `src/components/terminal-panel.tsx` |
| Terminal server | `src/server/terminal-server.mts` |
| Hook tests | `src/hooks/use-terminal.test.ts` |
| CORE-COMPONENT-0003 | `project/architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md` |
| ADR-0002 | `project/architecture/ADR/ADR-0002-tech-stack.md` |
