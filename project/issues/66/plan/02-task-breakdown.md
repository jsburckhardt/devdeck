# Task Breakdown: Issue #66

## Task T1: Update CodeView scroll-row and code-block layout

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0007

### Description

Update `CodeView` in `src/components/file-viewer.tsx` so long code lines do not
visually wrap in narrow panels. Keep the existing shared `overflow-auto`
container, add `min-w-max` to the inner flex row, and change the `<pre>` from
the shrinkable `flex-1 px-4` contract to explicit non-shrinking no-wrap classes.

### Acceptance Criteria

- The outer `CodeView` scroll container still uses shared `overflow-auto`.
- The inner gutter/code flex row includes `min-w-max`.
- The line-number gutter and code block remain siblings inside the same scroll row.
- The `<pre>` no longer uses `flex-1`.
- The `<pre>` includes `flex-shrink-0` and `whitespace-pre`.
- Existing FileViewer behavior for other modes remains unchanged.

### Test Coverage

- Assert the structural class contract from the rendered `<FileViewer />`.
- Avoid jsdom pixel/layout assertions.

## Task T2: Add gutter line-count and layout-contract tests

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0007

### Description

Extend `src/components/file-viewer.test.tsx` using the existing mocked `fetch`
and `<FileViewer />` pattern. Cover multi-line code, long-line code, and empty
or single-line content through the public component.

### Acceptance Criteria

- A multi-line file renders one gutter entry per logical source line.
- A long unbroken code line renders with the required non-wrapping DOM/class contract.
- Empty content still renders a one-line gutter.
- Single-line content still renders a one-line gutter.
- Tests do not depend on computed pixel width, browser layout, or visual wrapping.

### Test Coverage

- Add colocated tests in `src/components/file-viewer.test.tsx`.
- Query DOM class names and gutter text content only.

## Task T3: Verify the FileViewer fix

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T1, T2
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006, CORE-COMPONENT-0008

### Description

Run targeted and standard project checks after implementation.

### Acceptance Criteria

- FileViewer tests pass.
- Full test suite passes.
- Lint passes.
- Format check passes.
- Production build passes.

### Test Coverage

- Run the targeted FileViewer test command.
- Run `npm run lint`.
- Run `npm run format:check`.
- Run `npm run build`.
- Run `npm run test`.
