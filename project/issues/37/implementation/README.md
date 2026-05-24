# Implementation Notes: Issue #37 — Copilot CLI Status Indicators

## Summary

Implemented per-project Copilot CLI status indicators on sidebar tabs. The server detects Copilot CLI state (idle/running/waiting) via PTY output pattern matching and communicates changes to the client via WebSocket JSON text frames.

## Tasks Completed

### Task 1: CopilotCliState type + PerProjectWorkspaceState extension
- **Status:** Complete
- **Files:** `src/lib/types.ts`
- Added `CopilotCliState` type and `copilotStatus?` field to `PerProjectWorkspaceState`

### Task 2: detectCopilotState() + stripAnsi() in terminal-server.mts
- **Status:** Complete
- **Files:** `src/server/terminal-server.mts`
- Implemented `stripAnsi()` to remove ANSI escape sequences
- Implemented `detectCopilotState()` to detect spinner (running), prompt (waiting), and shell (idle) patterns
- Added per-connection copilot state tracking with 30s idle timeout
- Status frames emitted only on state transitions (no duplicates)
- Idle timer cleaned up on connection close

### Task 3: useTerminal hook copilotStatus
- **Status:** Complete
- **Files:** `src/hooks/use-terminal.ts`
- Added `copilotStatus` state, defaults to `"idle"`
- Handles `"status"` message type in `ws.onmessage`
- Resets to `"idle"` at start of each `connect()` call
- Validates incoming copilotState values

### Task 4: OpenProjectsProvider copilot status methods
- **Status:** Complete
- **Files:** `src/lib/open-projects-context.tsx`
- Added `copilotStatuses` state (`Map<string, CopilotCliState>`)
- `updateCopilotStatus()` — deduplicates identical updates
- `getCopilotStatus()` — returns cached status or `"idle"` default
- `closeProject()` clears copilot status for closed project

### Task 5: TerminalPanel propagation
- **Status:** Complete
- **Files:** `src/components/terminal-panel.tsx`
- useEffect propagates `copilotStatus` to context via `updateCopilotStatus`
- Only propagates when `slug` is defined

### Task 6: Sidebar status indicator
- **Status:** Complete
- **Files:** `src/components/project-sidebar.tsx`
- Running: pulsing green dot (`animate-pulse bg-green-500`)
- Waiting: steady amber dot (`bg-amber-500`)
- Idle: no indicator rendered
- Full accessibility: `aria-label`, `title`, `role="status"`

### Tasks 7-10: Tests
- **Status:** Complete
- **Files:** `src/server/terminal-server.test.ts`, `src/hooks/use-terminal.test.ts`, `src/lib/open-projects-context.test.tsx`, `src/components/project-sidebar.test.tsx`, `src/components/terminal-panel.test.tsx`
- 18 new test cases covering all test plan items T1-T18

## Test Results

- **All 362 tests pass** (29 test files)
- `npm run lint` — 0 errors
- `npm run format:check` — all files formatted
- `npm run build` — successful

## Architecture Compliance

- Follows ADR-0005: PTY output inference + protocol extension
- Follows CORE-COMPONENT-0003: JSON text frame protocol extended with `"status"` type
- Follows CORE-COMPONENT-0008: Per-project state management via OpenProjectsProvider
- No new dependencies added
- Types inlined in terminal-server.mts (no `@/` path aliases)
