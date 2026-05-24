# Test Plan: Issue #37 — Copilot CLI Status Indicators

## Test T1: detectCopilotState returns "running" for spinner characters

- **Type:** Unit
- **Task:** Task 7 (covers Task 2)
- **Priority:** High

### Setup
- Import `detectCopilotState` from `terminal-server.mts`
- Use `// @vitest-environment node` pragma

### Steps
1. Call `detectCopilotState("⠋ Thinking...")` 
2. Call `detectCopilotState("⠙ Processing...")` 
3. Call with each braille spinner character: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`

### Expected Result
- All calls return `"running"`

---

## Test T2: detectCopilotState returns "waiting" for input prompts

- **Type:** Unit
- **Task:** Task 7 (covers Task 2)
- **Priority:** High

### Setup
- Import `detectCopilotState` from `terminal-server.mts`

### Steps
1. Call `detectCopilotState("some text\n> ")`
2. Call `detectCopilotState("? Do you want to continue? ")`

### Expected Result
- All calls return `"waiting"`

---

## Test T3: detectCopilotState returns "idle" for shell prompts

- **Type:** Unit
- **Task:** Task 7 (covers Task 2)
- **Priority:** High

### Setup
- Import `detectCopilotState` from `terminal-server.mts`

### Steps
1. Call `detectCopilotState("user@host:~$ ")`
2. Call `detectCopilotState("% ")`
3. Call `detectCopilotState("# ")`
4. Call `detectCopilotState("❯ ")`

### Expected Result
- All calls return `"idle"`

---

## Test T4: detectCopilotState returns null for unrecognized output

- **Type:** Unit
- **Task:** Task 7 (covers Task 2)
- **Priority:** High

### Setup
- Import `detectCopilotState` from `terminal-server.mts`

### Steps
1. Call `detectCopilotState("some random text")`
2. Call `detectCopilotState("")`
3. Call `detectCopilotState("ls -la output here")`

### Expected Result
- All calls return `null`

---

## Test T5: stripAnsi removes ANSI escape sequences

- **Type:** Unit
- **Task:** Task 7 (covers Task 2)
- **Priority:** High

### Setup
- Import `stripAnsi` from `terminal-server.mts`

### Steps
1. Call `stripAnsi("\x1b[31mred text\x1b[0m")`
2. Call `stripAnsi("\x1b[1;32;40mcolored\x1b[0m plain")`
3. Call `stripAnsi("no ansi")`
4. Call `stripAnsi("")`
5. Call with cursor movement sequences `\x1b[H\x1b[2J`

### Expected Result
1. Returns `"red text"`
2. Returns `"colored plain"`
3. Returns `"no ansi"`
4. Returns `""`
5. Returns `""`

---

## Test T6: useTerminal copilotStatus defaults to idle

- **Type:** Unit
- **Task:** Task 8 (covers Task 3)
- **Priority:** High

### Setup
- Render `useTerminal` hook with mocked WebSocket
- Use jsdom environment (default)

### Steps
1. Render hook with default options
2. Read `copilotStatus` from result

### Expected Result
- `copilotStatus` is `"idle"`

---

## Test T7: useTerminal copilotStatus updates on status frame

- **Type:** Unit
- **Task:** Task 8 (covers Task 3)
- **Priority:** High

### Setup
- Render `useTerminal` hook with mocked WebSocket

### Steps
1. Render hook and establish mocked WS connection
2. Simulate receiving text message: `JSON.stringify({ type: "status", copilotState: "running" })`
3. Read `copilotStatus`
4. Simulate receiving: `JSON.stringify({ type: "status", copilotState: "waiting" })`
5. Read `copilotStatus`

### Expected Result
- After step 3: `copilotStatus` is `"running"`
- After step 5: `copilotStatus` is `"waiting"`

---

## Test T8: useTerminal copilotStatus resets to idle on reconnect

- **Type:** Unit
- **Task:** Task 8 (covers Task 3)
- **Priority:** Medium

### Setup
- Render `useTerminal` hook with mocked WebSocket

### Steps
1. Establish connection and set copilotStatus to `"running"` via status frame
2. Trigger reconnection (close WebSocket with non-4401 code)
3. Read `copilotStatus` after reconnect starts

### Expected Result
- `copilotStatus` resets to `"idle"` at start of reconnect

---

## Test T9: OpenProjectsProvider getCopilotStatus returns idle for unknown slug

- **Type:** Unit
- **Task:** Task 9 (covers Task 4)
- **Priority:** High

### Setup
- Render `OpenProjectsProvider` with test consumer component

### Steps
1. Call `getCopilotStatus("nonexistent-slug")`

### Expected Result
- Returns `"idle"`

---

## Test T10: OpenProjectsProvider updateCopilotStatus and getCopilotStatus round-trip

- **Type:** Unit
- **Task:** Task 9 (covers Task 4)
- **Priority:** High

### Setup
- Render `OpenProjectsProvider` with test consumer component

### Steps
1. Call `updateCopilotStatus("my-project", "running")`
2. Call `getCopilotStatus("my-project")`

### Expected Result
- Returns `"running"`

---

## Test T11: OpenProjectsProvider closeProject clears copilot status

- **Type:** Unit
- **Task:** Task 9 (covers Task 4)
- **Priority:** High

### Setup
- Render `OpenProjectsProvider` with an open project and copilot status set

### Steps
1. Open a project with slug `"my-project"`
2. Call `updateCopilotStatus("my-project", "waiting")`
3. Call `closeProject("my-project")`
4. Call `getCopilotStatus("my-project")`

### Expected Result
- Returns `"idle"` after close (status cleared)

---

## Test T12: Multiple projects maintain independent copilot statuses

- **Type:** Unit
- **Task:** Task 9 (covers Task 4)
- **Priority:** Medium

### Setup
- Render `OpenProjectsProvider` with two open projects

### Steps
1. Call `updateCopilotStatus("project-a", "running")`
2. Call `updateCopilotStatus("project-b", "waiting")`
3. Call `getCopilotStatus("project-a")`
4. Call `getCopilotStatus("project-b")`

### Expected Result
- project-a returns `"running"`
- project-b returns `"waiting"`

---

## Test T13: Sidebar renders status indicator for "running" project

- **Type:** Component
- **Task:** Task 10 (covers Task 6)
- **Priority:** High

### Setup
- Mock `useOpenProjects` to return a project with `getCopilotStatus` returning `"running"`
- Render `ProjectSidebar`

### Steps
1. Query for status indicator element within the project tab

### Expected Result
- Status indicator is visible
- Has `aria-label` containing "running" (case-insensitive)
- Has `title` attribute
- Has animation class (e.g., `animate-pulse`)

---

## Test T14: Sidebar renders status indicator for "waiting" project

- **Type:** Component
- **Task:** Task 10 (covers Task 6)
- **Priority:** High

### Setup
- Mock `useOpenProjects` to return a project with `getCopilotStatus` returning `"waiting"`
- Render `ProjectSidebar`

### Steps
1. Query for status indicator element within the project tab

### Expected Result
- Status indicator is visible
- Has `aria-label` containing "waiting" (case-insensitive)
- Has `title` attribute
- Does NOT have `animate-pulse` class

---

## Test T15: Sidebar hides status indicator for "idle" project

- **Type:** Component
- **Task:** Task 10 (covers Task 6)
- **Priority:** High

### Setup
- Mock `useOpenProjects` to return a project with `getCopilotStatus` returning `"idle"`
- Render `ProjectSidebar`

### Steps
1. Query for status indicator element within the project tab

### Expected Result
- No status indicator element is present in the DOM

---

## Test T16: TerminalPanel propagates copilotStatus to context

- **Type:** Component
- **Task:** Task 10 (covers Task 5)
- **Priority:** High

### Setup
- Mock `useTerminal` to return `copilotStatus: "running"`
- Mock `useOpenProjects` to provide `updateCopilotStatus` spy
- Render `TerminalPanel` with `slug="test-project"`

### Steps
1. Render the component
2. Check if `updateCopilotStatus` was called

### Expected Result
- `updateCopilotStatus` called with `("test-project", "running")`

---

## Test T17: TerminalPanel does not propagate when slug is undefined

- **Type:** Component
- **Task:** Task 10 (covers Task 5)
- **Priority:** Medium

### Setup
- Mock `useTerminal` to return `copilotStatus: "running"`
- Mock `useOpenProjects` to provide `updateCopilotStatus` spy
- Render `TerminalPanel` without `slug` prop

### Steps
1. Render the component
2. Check if `updateCopilotStatus` was called

### Expected Result
- `updateCopilotStatus` was NOT called

---

## Test T18: Sidebar status indicator accessibility — non-color semantics

- **Type:** Accessibility
- **Task:** Task 10 (covers Task 6)
- **Priority:** High

### Setup
- Mock `useOpenProjects` to return projects with `"running"` and `"waiting"` statuses
- Render `ProjectSidebar`

### Steps
1. Query all status indicators
2. Verify each has `aria-label`
3. Verify each has `title`
4. Verify aria-label text differentiates between running and waiting states

### Expected Result
- Every status indicator has both `aria-label` and `title` attributes
- Labels clearly differentiate the states (e.g., "Copilot CLI running" vs "Copilot CLI waiting for input")
- A screen reader user can distinguish the states without seeing colors
