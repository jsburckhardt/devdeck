# Task Breakdown: Issue #37 — Copilot CLI Status Indicators

## Task 1: Add CopilotCliState type and extend PerProjectWorkspaceState

- **Status:** Not Started
- **Complexity:** Small
- **Dependencies:** None
- **Related ADRs:** ADR-0005
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0008

### Description
Add the `CopilotCliState` type alias to `src/lib/types.ts` and add the optional `copilotStatus` field to `PerProjectWorkspaceState`.

```typescript
export type CopilotCliState = "idle" | "running" | "waiting";
```

Add `copilotStatus?: CopilotCliState` to the `PerProjectWorkspaceState` interface.

### Acceptance Criteria
- `CopilotCliState` type is exported from `src/lib/types.ts`
- `PerProjectWorkspaceState` includes `copilotStatus?: CopilotCliState`
- Existing code that uses `PerProjectWorkspaceState` compiles without changes (optional field)
- `npm run build` passes

### Test Coverage
- Type-level: TypeScript compilation validates the type is correct
- No runtime tests needed for this task alone

---

## Task 2: Implement detectCopilotState() and status frame emission in terminal-server.mts

- **Status:** Not Started
- **Complexity:** Large
- **Dependencies:** Task 1 (type definition reference, but inlined in .mts)
- **Related ADRs:** ADR-0005
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
In `src/server/terminal-server.mts`:

1. **Inline the `CopilotCliState` type** (cannot use `@/` imports in standalone .mts):
   ```typescript
   type CopilotCliState = "idle" | "running" | "waiting";
   ```

2. **Implement `stripAnsi(text: string): string`** — remove ANSI escape sequences from raw PTY output.

3. **Implement `detectCopilotState(strippedOutput: string): CopilotCliState | null`** — pure function that:
   - Returns `"running"` for spinner characters (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) or active streaming patterns
   - Returns `"waiting"` for input prompt patterns (`> ` at end of output, `? ` prompts)
   - Returns `"idle"` for shell prompt patterns (`$`, `%`, `#`, `❯` at end of line)
   - Returns `null` when no pattern matches

4. **Add per-connection state** in `handleConnection`:
   - `copilotState: CopilotCliState = "idle"`
   - `idleTimer: ReturnType<typeof setTimeout> | null = null`
   - Idle timeout constant: `COPILOT_IDLE_TIMEOUT_MS = 30_000`

5. **Integrate into `wirePty` `onData`**: After sending binary PTY output, call `detectCopilotState(stripAnsi(data))`. If result is non-null and differs from current `copilotState`, update state and send `{ type: "status", copilotState }` JSON text frame. Reset/start idle timer on every match.

6. **Idle timeout handler**: When timer fires, set `copilotState = "idle"` and send `{ type: "status", copilotState: "idle" }`.

7. **Clean up idle timer** in `cleanupPty`.

### Acceptance Criteria
- `detectCopilotState()` is exported for testing
- `stripAnsi()` is exported for testing
- Status frame is only sent when state changes (no duplicate frames)
- Idle timer reverts to `"idle"` after 30s of no Copilot CLI pattern matches
- Idle timer is cleared on connection close
- Existing terminal functionality unchanged (binary frames, setup frames, error frames)
- `npm run build` passes

### Test Coverage
- Unit tests for `detectCopilotState()` with various inputs (spinner, prompt, shell, mixed, empty, null cases)
- Unit tests for `stripAnsi()` with ANSI-laden strings
- Idle timeout behavior tested via timer mocks

---

## Task 3: Extend useTerminal hook with copilotStatus

- **Status:** Not Started
- **Complexity:** Small
- **Dependencies:** Task 2 (server sends status frames)
- **Related ADRs:** ADR-0005
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
In `src/hooks/use-terminal.ts`:

1. Import `CopilotCliState` from `@/lib/types`.
2. Add `const [copilotStatus, setCopilotStatus] = useState<CopilotCliState>("idle")` state.
3. Reset `copilotStatus` to `"idle"` at the start of each `connect()` attempt (alongside `terminalMode` and `isFallback` resets).
4. In `ws.onmessage`, add a case for `msg.type === "status"`:
   ```typescript
   } else if (msg.type === "status") {
     setCopilotStatus((msg.copilotState as CopilotCliState) ?? "idle");
   }
   ```
5. Add `copilotStatus` to `UseTerminalReturn` interface and return object.

### Acceptance Criteria
- `UseTerminalReturn` includes `copilotStatus: CopilotCliState`
- `copilotStatus` defaults to `"idle"`
- `copilotStatus` resets to `"idle"` at start of `connect()`
- `copilotStatus` updates when a `"status"` frame is received
- Invalid `copilotState` values in the frame fall back to `"idle"`
- `npm run build` passes

### Test Coverage
- Unit test: `copilotStatus` defaults to `"idle"`
- Unit test: `copilotStatus` updates on receiving `{ type: "status", copilotState: "running" }`
- Unit test: `copilotStatus` resets to `"idle"` on reconnect

---

## Task 4: Extend OpenProjectsProvider with copilot status methods

- **Status:** Not Started
- **Complexity:** Small
- **Dependencies:** Task 1 (CopilotCliState type)
- **Related ADRs:** ADR-0005
- **Related Core-Components:** CORE-COMPONENT-0008

### Description
In `src/lib/open-projects-context.tsx`:

1. Import `CopilotCliState` from `./types`.
2. Add `copilotStatusMap` ref: `useRef<Map<string, CopilotCliState>>(new Map())` — separate from `workspaceCache` to avoid triggering re-renders on status updates for non-active projects.
3. Add `updateCopilotStatus(slug: string, status: CopilotCliState)` — updates the map and triggers a state update to cause re-render (use a version counter `useState` or store the map in state).
4. Add `getCopilotStatus(slug: string): CopilotCliState` — returns the cached status or `"idle"`.
5. In `closeProject`, clear the copilot status for the closed slug.
6. Add both methods to `OpenProjectsContextValue` interface.
7. Add both methods to the context value.

**Design note:** Since the sidebar needs to re-render when any project's copilot status changes, `copilotStatusMap` should be stored as state (not just ref) so that updates trigger re-renders. Use a `Record<string, CopilotCliState>` state object.

### Acceptance Criteria
- `updateCopilotStatus(slug, status)` stores the status and triggers re-render
- `getCopilotStatus(slug)` returns the stored status or `"idle"` if not set
- `closeProject(slug)` clears the copilot status for that slug
- All existing context methods continue to work unchanged
- `npm run build` passes

### Test Coverage
- Unit test: `updateCopilotStatus` stores status retrievable via `getCopilotStatus`
- Unit test: `getCopilotStatus` returns `"idle"` for unknown slugs
- Unit test: `closeProject` clears copilot status for the closed slug
- Unit test: multiple projects maintain independent copilot statuses

---

## Task 5: Wire TerminalPanel to propagate copilotStatus

- **Status:** Not Started
- **Complexity:** Small
- **Dependencies:** Task 3, Task 4
- **Related ADRs:** ADR-0005
- **Related Core-Components:** CORE-COMPONENT-0003, CORE-COMPONENT-0008

### Description
In `src/components/terminal-panel.tsx`:

1. Import `useOpenProjects` from `@/lib/open-projects-context`.
2. Destructure `copilotStatus` from `useTerminal(...)`.
3. Call `updateCopilotStatus(slug, copilotStatus)` in a `useEffect` that depends on `slug` and `copilotStatus`.
4. Only propagate when `slug` is defined (no-op for non-project terminals).

```typescript
const { updateCopilotStatus } = useOpenProjects();

useEffect(() => {
  if (slug) {
    updateCopilotStatus(slug, copilotStatus);
  }
}, [slug, copilotStatus, updateCopilotStatus]);
```

### Acceptance Criteria
- `TerminalPanel` propagates `copilotStatus` to `OpenProjectsProvider` via `updateCopilotStatus`
- Propagation only occurs when `slug` is defined
- Propagation updates on every `copilotStatus` change
- Existing terminal panel rendering unchanged
- `npm run build` passes

### Test Coverage
- Component test: `TerminalPanel` calls `updateCopilotStatus` when copilotStatus changes
- Component test: `TerminalPanel` does not call `updateCopilotStatus` when slug is undefined

---

## Task 6: Render Copilot CLI status indicator on sidebar tabs

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 4
- **Related ADRs:** ADR-0005
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description
In `src/components/project-sidebar.tsx`:

1. Import `CopilotCliState` from `@/lib/types`.
2. Destructure `getCopilotStatus` from `useOpenProjects()`.
3. For each sidebar tab, get `const copilotStatus = getCopilotStatus(project.slug)`.
4. When `copilotStatus !== "idle"`, render a small status indicator adjacent to the language badge:
   - `"running"`: pulsing/animated dot with theme color (e.g., `var(--color-primary)` or green accent)
   - `"waiting"`: steady dot with theme color (e.g., `var(--color-warning)` or yellow/amber accent)
5. Status indicator must have:
   - `aria-label` (e.g., "Copilot CLI running" / "Copilot CLI waiting for input")
   - `title` attribute with same text (Decision #53: native title, no tooltip library)
6. When `copilotStatus === "idle"`, do not render the indicator at all.
7. Use CSS custom properties for colors (Decision #14, CORE-COMPONENT-0004).

**Visual placement:** Small dot (6×6px) positioned at the top-right corner of the language badge, similar to a notification badge.

### Acceptance Criteria
- Status indicator renders when copilotStatus is `"running"` or `"waiting"`
- Status indicator hidden when copilotStatus is `"idle"`
- `"running"` indicator has a pulsing animation
- `"waiting"` indicator is steady (no animation)
- `aria-label` conveys the status textually
- `title` attribute matches the `aria-label`
- Colors use CSS custom properties, not hardcoded hex
- Sidebar layout not disrupted by indicator
- `npm run build` passes

### Test Coverage
- Component test: indicator renders for `"running"` status
- Component test: indicator renders for `"waiting"` status
- Component test: indicator hidden for `"idle"` status
- Component test: `aria-label` contains correct status text
- Component test: `title` attribute present with correct text

---

## Task 7: Write unit tests for detectCopilotState() and stripAnsi()

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 2
- **Related ADRs:** ADR-0005
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
Create `src/server/terminal-server.test.mts` (or colocated test file) with `// @vitest-environment node` pragma.

Test `detectCopilotState()`:
- Returns `"running"` for spinner characters
- Returns `"waiting"` for `"> "` prompt at end
- Returns `"waiting"` for `"? Do you want..."` prompt
- Returns `"idle"` for shell prompts (`$ `, `% `, `# `, `❯ `)
- Returns `null` for generic text with no pattern match
- Returns `null` for empty string

Test `stripAnsi()`:
- Strips standard SGR sequences (colors, bold, etc.)
- Strips cursor movement sequences
- Preserves non-ANSI text
- Handles empty string

### Acceptance Criteria
- All tests pass via `npm run test`
- Tests use `// @vitest-environment node` pragma
- At least 10 test cases covering all state returns and edge cases

### Test Coverage
- This task IS the test coverage for Task 2

---

## Task 8: Write unit tests for useTerminal copilotStatus handling

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 3
- **Related ADRs:** ADR-0005
- **Related Core-Components:** CORE-COMPONENT-0003

### Description
Extend existing `use-terminal.test.ts` (or create if not present) with tests for the `copilotStatus` field. Tests use jsdom environment (default).

Mock WebSocket to send `{ type: "status", copilotState: "running" }` text frames and verify state transitions.

### Acceptance Criteria
- Tests verify `copilotStatus` defaults to `"idle"`
- Tests verify `copilotStatus` updates on `"status"` frame
- Tests verify `copilotStatus` resets on reconnect
- All tests pass via `npm run test`

### Test Coverage
- This task IS the test coverage for Task 3

---

## Task 9: Write unit tests for OpenProjectsProvider copilot status methods

- **Status:** Not Started
- **Complexity:** Small
- **Dependencies:** Task 4
- **Related ADRs:** ADR-0005
- **Related Core-Components:** CORE-COMPONENT-0008

### Description
Extend existing `open-projects-context.test.tsx` (or create if not present) with tests for `updateCopilotStatus` and `getCopilotStatus`.

### Acceptance Criteria
- Tests verify `getCopilotStatus` returns `"idle"` for unknown slug
- Tests verify `updateCopilotStatus` + `getCopilotStatus` round-trip
- Tests verify `closeProject` clears copilot status
- Tests verify independent status per project
- All tests pass via `npm run test`

### Test Coverage
- This task IS the test coverage for Task 4

---

## Task 10: Write component tests for sidebar status indicator

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 6
- **Related ADRs:** ADR-0005
- **Related Core-Components:** CORE-COMPONENT-0008

### Description
Extend existing `project-sidebar.test.tsx` (or create if not present) with tests for the Copilot status indicator.

Mock `useOpenProjects` to return `getCopilotStatus` that returns different statuses per slug.

### Acceptance Criteria
- Tests verify indicator renders for `"running"` with correct aria-label
- Tests verify indicator renders for `"waiting"` with correct aria-label
- Tests verify indicator hidden for `"idle"`
- Tests verify indicator has `title` attribute
- Tests verify `"running"` indicator has animation class
- All tests pass via `npm run test`

### Test Coverage
- This task IS the test coverage for Task 6
