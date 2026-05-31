# Task Breakdown: Issue #69

## Task T1: Update Separator 1 adjacency condition

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** None
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description

Update `src/components/workspace-layout.tsx` so `Separator 1` is visible and enabled whenever Terminal is visible and at least one left-side workspace panel is visible.

The condition should change from:

```tsx
showFileViewer && showTerminal
```

to:

```tsx
showTerminal && (showFileViewer || showExplorer)
```

### Acceptance Criteria

- `Separator 1` is visible when `showExplorer=true`, `showFileViewer=false`, and `showTerminal=true`.
- `Separator 1` remains visible when `showExplorer=false`, `showFileViewer=true`, and `showTerminal=true`.
- `Separator 1` is hidden when Terminal is not visible.
- `Separator 1` is hidden when Terminal is the only visible panel.
- `Separator 0` remains governed by `showExplorer && showFileViewer`.
- Panels remain mounted and use collapse/expand behavior.

### Test Coverage

- Unit coverage asserts `Separator 1` is visible and enabled for Explorer + Terminal adjacency.
- Existing separator tests continue to cover all visible-panel combinations.

## Task T2: Update separator adjacency tests

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T1
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description

Update `src/components/workspace-layout.test.tsx`, especially the existing separator adjacency test, so `showExplorer=true`, `showFileViewer=false`, and `showTerminal=true` expects `Separator 1` to be visible and enabled.

### Acceptance Criteria

- Tests explicitly cover all three panels visible, File Preview + Terminal, Explorer + Terminal, Explorer + File Preview, and Terminal only.
- The Explorer + Terminal state expects `separator-0` hidden/disabled and `separator-1` visible/enabled.
- Tests verify pairwise adjacency rather than raw DOM order.

### Test Coverage

- Use Vitest/Testing Library assertions in `src/components/workspace-layout.test.tsx`.
- Assertions inspect both CSS visibility (`hidden` class) and disabled state (`data-disabled`).

## Task T3: Add regression test for File Preview hidden then Explorer hidden sequence

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1, T2
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description

Add a regression test for Issue #69 that simulates:

1. Explorer visible, File Preview visible, Terminal visible.
2. File Preview hidden.
3. Explorer hidden.

The intermediate state must keep `Separator 1` enabled because Explorer and Terminal are adjacent.

### Acceptance Criteria

- Test starts with all three panels visible.
- After File Preview is hidden, File Preview remains mounted and collapses, Explorer and Terminal remain visible, and `Separator 1` is visible/enabled.
- After Explorer is hidden, Terminal remains mounted and both separators are hidden/disabled.

### Test Coverage

- Add a dedicated unit test in `src/components/workspace-layout.test.tsx`.
- Use rerendered mocked workspace context states to model the sequence.
- Assert panel collapse/expand calls where available from the existing mock.

## Task T4: Run verification commands

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T1, T2, T3
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0007, CORE-COMPONENT-0008

### Description

Run verification commands configured in `.github/soft-factory/verification.yml`.

### Acceptance Criteria

- `npm run lint` passes.
- `npm run format:check` passes.
- `npm run build` passes.
- `npm run test` passes.
- Any failure is investigated before moving to Verify stage.

### Test Coverage

- Full Vitest suite passes through `npm run test`.
- Build validation passes through `npm run build`.
- Static quality gates pass through lint and format checks.
