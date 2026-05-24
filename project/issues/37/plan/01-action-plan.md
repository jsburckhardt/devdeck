# Action Plan: Copilot CLI Status Indicators on Open Project Tabs

## Feature
- **ID:** 37
- **Research Brief:** project/issues/37/research/00-research.md

## ADRs Created
- **ADR-0005-copilot-cli-status-detection-strategy.md** — Documents the selection of PTY output pattern matching (Strategy 1) combined with WebSocket protocol extension (Strategy 3) for detecting Copilot CLI state. Rejects process inspection (Strategy 2) and defers user-configured patterns (Strategy 4).

## Core-Components Updated
- **CORE-COMPONENT-0003-websocket-terminal.md** — Extended with `{ type: "status", copilotState }` JSON text frame, `detectCopilotState()` pure function contract, idle timeout rules, and `useTerminal` hook `copilotStatus` return field.
- **CORE-COMPONENT-0008-multi-project-tabs.md** — Extended with `copilotStatus` in `PerProjectWorkspaceState`, `updateCopilotStatus()`/`getCopilotStatus()` context methods, and sidebar status indicator rendering/accessibility rules.

## Implementation Tasks

### Phase 1: Types & Detection (Server-Side)
1. **Task 1:** Add `CopilotCliState` type to `src/lib/types.ts` and `PerProjectWorkspaceState`
2. **Task 2:** Implement `detectCopilotState()` and status frame emission in `terminal-server.mts`

### Phase 2: Client-Side Plumbing
3. **Task 3:** Extend `useTerminal` hook to handle `"status"` frames and expose `copilotStatus`
4. **Task 4:** Extend `OpenProjectsProvider` with `updateCopilotStatus()` and `getCopilotStatus()`
5. **Task 5:** Wire `TerminalPanel` to propagate `copilotStatus` to `OpenProjectsProvider`

### Phase 3: UI Rendering
6. **Task 6:** Render Copilot CLI status indicator on sidebar project tabs

### Phase 4: Testing
7. **Task 7:** Write unit tests for `detectCopilotState()` pure function
8. **Task 8:** Write unit tests for `useTerminal` copilotStatus handling
9. **Task 9:** Write unit tests for `OpenProjectsProvider` copilot status methods
10. **Task 10:** Write component tests for sidebar status indicator rendering and accessibility
