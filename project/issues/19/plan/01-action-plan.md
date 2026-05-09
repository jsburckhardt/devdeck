# Action Plan: Terminal Input Issues

## Feature
- **ID:** 19
- **Research Brief:** project/issues/19/research/00-research.md

## ADRs Created
None — these are bug fixes within the existing architecture (ADR-0002).

## Core-Components Updated
- **CORE-COMPONENT-0003** (WebSocket Terminal Communication) — added 3 new rules:
  1. Pass initial terminal dimensions (`cols`/`rows`) as WebSocket URL query params
  2. Load `@xterm/addon-clipboard` (ClipboardAddon) for OSC 52 support
  3. Set `screenReaderMode: true` in Terminal constructor for accessibility

## Implementation Tasks

### Task 1: Add ClipboardAddon and Ctrl+V handler
- Install `@xterm/addon-clipboard` dependency
- Import and load `ClipboardAddon` in `use-terminal.ts`
- Register `customKeyEventHandler` for Ctrl+V that uses `navigator.clipboard.readText()` → `term.paste()`

### Task 2: Enable screenReaderMode for accessibility input
- Add `screenReaderMode: true` to Terminal constructor options in `use-terminal.ts`

### Task 3: Fix PTY dimension race condition
- Pass `cols`/`rows` as query params in WebSocket URL from client (`use-terminal.ts`)
- Read `cols`/`rows` from upgrade URL query params in server (`terminal-server.mts`)
- Register `term.onResize` BEFORE `fitAddon.fit()` to prevent lost resize events

### Task 4: Add tests for all three fixes
- Test ClipboardAddon loading
- Test screenReaderMode option
- Test cols/rows in WebSocket URL
- Test onResize registered before fitAddon.fit()
