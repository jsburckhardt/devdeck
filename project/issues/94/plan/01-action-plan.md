# Action Plan: Reduce Terminal Font Size Responsively

## Feature
- **ID:** 94
- **Research Brief:** project/issues/94/research/00-research.md

## ADRs Created
- None. This issue stays within ADR-0002's existing Next.js, xterm.js, node-pty, and WebSocket stack.

## Core-Components Created
- None created.
- Updated [CORE-COMPONENT-0003: WebSocket Terminal Communication](../../../architecture/core-components/CORE-COMPONENT-0003-websocket-terminal.md) to define the responsive terminal font-size contract.

## Plan of Attack
1. Implement an SSR/jsdom-safe terminal font-size helper in or near `src/hooks/use-terminal.ts` that uses layout viewport width and touch capability, not `visualViewport.width`, to return `11`, `12`, or `13`.
2. Apply the computed font size in the xterm.js `Terminal` constructor before the initial forced fit and WebSocket connection so initial `cols` and `rows` are accurate.
3. Add per-hook-instance runtime listeners for layout viewport, orientation, and pointer/touch capability changes. On tier changes, update `term.options.fontSize`, force-fit xterm, and rely on the existing `onResize` and duplicate-suppression path to send PTY resize messages without reconnecting the WebSocket solely for font changes.
4. Preserve current terminal behavior: `lineHeight: 1.0`, `customGlyphs: true`, `screenReaderMode: true`, ClipboardAddon, auth/4401 handling, setup/status frames, slug/worktree query handling, mounted terminal panel behavior, helper controls, and overflow containment.
5. Add unit coverage for the helper and hook lifecycle, plus browser-level tablet/touch coverage that verifies 12px rendered terminal text, active connection, and no horizontal overflow.

## Non-Goals
- Do not change xterm.js, node-pty, WebSocket transport, auth, terminal theme selection, tmux setup, or worktree scoping.
- Do not change application layout strategy or remount the terminal panel to change font size.
- Do not disable browser zoom or add viewport metadata unless DOM inspection proves a necessary non-conflicting change.

## Implementation Tasks
- **94-T1:** Add responsive terminal font-size policy helper and initial constructor integration.
- **94-T2:** Handle runtime font-size tier changes without WebSocket reconnects.
- **94-T3:** Preserve terminal panel, layout, helper, and protocol guardrails.
- **94-T4:** Add browser-level responsive terminal coverage.
- **94-T5:** Complete verification and documentation alignment.
