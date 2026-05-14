# Task Breakdown — Issue #28: Render Excalidraw Files

## Task 1: Add `@excalidraw/excalidraw` dependency

- **Status:** Pending
- **Complexity:** Low
- **Dependencies:** None
- **Related ADRs:** ADR-0002 (tech stack sanctions npm additions)
- **Related Core-Components:** None

### Description
Install the `@excalidraw/excalidraw` npm package as a runtime dependency. The package ships its own TypeScript declarations — no separate `@types/*` package is needed.

```bash
npm install @excalidraw/excalidraw
```

### Acceptance Criteria
- `@excalidraw/excalidraw` appears in `dependencies` in `package.json`.
- `npm ls @excalidraw/excalidraw` resolves without errors.
- `npm run build` completes successfully (no type or import errors).

### Test Coverage
- No dedicated test — verified by successful build and by downstream tests in Task 6.

---

## Task 2: Add language mapping for `.excalidraw` extension

- **Status:** Pending
- **Complexity:** Low
- **Dependencies:** None
- **Related ADRs:** ADR-0002
- **Related Core-Components:** None

### Description
Add `excalidraw: "excalidraw"` to the `languageMap` object in `src/lib/file-utils.ts`. This causes `getLanguageFromFilename("diagram.excalidraw")` to return `"excalidraw"` instead of `"plaintext"`, enabling detection in FileViewer.

### Acceptance Criteria
- `getLanguageFromFilename("foo.excalidraw")` returns `"excalidraw"`.
- `isBinaryFile("foo.excalidraw")` returns `false` (no change to binary list).
- Existing language mappings are unchanged.

### Test Coverage
- Unit test: call `getLanguageFromFilename("test.excalidraw")` and assert result is `"excalidraw"`.
- Regression: existing file-utils tests pass unchanged.

---

## Task 3: Import Excalidraw CSS

- **Status:** Pending
- **Complexity:** Low
- **Dependencies:** Task 1
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004

### Description
Prepend `@import "@excalidraw/excalidraw/index.css";` to `src/app/globals.css` **before** the existing `@import "tailwindcss"` line. This ensures Tailwind utility classes can override Excalidraw's broad selectors via specificity.

### Acceptance Criteria
- `src/app/globals.css` starts with `@import "@excalidraw/excalidraw/index.css";` on the first line.
- The `@import "tailwindcss" source("../");` line follows on the next line.
- `npm run build` completes successfully (CSS resolves).

### Test Coverage
- Visual verification via build. No unit test needed for CSS import order.

---

## Task 4: Create `ExcalidrawView` component

- **Status:** Pending
- **Complexity:** High
- **Dependencies:** Task 1, Task 3
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004 (theme mapping), CORE-COMPONENT-0007 (shell layout — `h-full` constraint)

### Description
Create `src/components/excalidraw-view.tsx` — a `"use client"` component that:

1. **Dynamically imports** `@excalidraw/excalidraw` via `next/dynamic({ ssr: false })` with a loading spinner.
2. **Parses and validates** the JSON content via a `parseScene()` function:
   - Catches `JSON.parse` errors.
   - Validates that `elements` is an array.
   - Returns either `{ scene }` or `{ error }`.
3. **Renders an error state** when parsing fails — shows `WarningCircle` icon, "Invalid Excalidraw file" heading, and the error detail.
4. **Renders Excalidraw** in view-only mode:
   - `viewModeEnabled={true}`
   - `theme` mapped from `useTheme()` per CORE-COMPONENT-0004 (Decision #65): `dark` → `"dark"`, `light` → `"light"`.
   - `initialData` with `elements`, `appState`, `files`, and `scrollToContent: true`.
5. **Wrapper div** uses `className="h-full w-full"` to fill the flex parent (per CORE-COMPONENT-0007).

### Acceptance Criteria
- Component file exists at `src/components/excalidraw-view.tsx`.
- Component exports `ExcalidrawView` with a `{ content: string }` prop.
- Valid `.excalidraw` JSON renders the Excalidraw component with `viewModeEnabled={true}`.
- Invalid JSON renders an inline error with "Invalid Excalidraw file" text.
- JSON missing `elements` array renders an error mentioning "elements".
- Dark theme passes `theme="dark"` to Excalidraw; light theme passes `theme="light"`.
- `files` field from the parsed JSON is passed through to `initialData.files`.
- `scrollToContent: true` is set in `initialData`.
- No SSR — component is dynamically imported with `ssr: false`.

### Test Coverage
- Covered by test cases T-EX-1 through T-EX-7 in Task 6.

---

## Task 5: Integrate ExcalidrawView into FileViewer

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** Task 2, Task 4
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0007

### Description
Edit `src/components/file-viewer.tsx` to wire up the ExcalidrawView:

1. **Import** `ExcalidrawView` from `@/components/excalidraw-view`.
2. **Add detection** after the `isMarkdown` declaration (~line 490):
   ```typescript
   const isExcalidraw = fileContent.language === "excalidraw";
   ```
3. **Extend the raw/preview toggle condition** (~line 538): change `isMarkdown` to `(isMarkdown || isExcalidraw)` so `.excalidraw` files also show the raw/preview toggle button.
4. **Extend the render tree** (~line 612–618): insert an `isExcalidraw && !showRaw` branch before the `isMarkdown` branch:
   ```tsx
   ) : isExcalidraw && !showRaw ? (
     <ExcalidrawView content={fileContent.content} />
   ) : isMarkdown && !showRaw ? (
   ```
5. Edit mode, diff mode, and binary file paths remain unchanged.

### Acceptance Criteria
- `.excalidraw` files render `ExcalidrawView` in preview mode (default).
- Raw/preview toggle button appears for `.excalidraw` files.
- Toggling to raw mode shows `CodeView` with the JSON source.
- Edit mode shows `EditView` textarea (raw JSON), not ExcalidrawView.
- Markdown, Mermaid, binary, diff, and code rendering are completely unchanged.
- `showRaw` resets to `false` on file change (existing behavior, no change needed).

### Test Coverage
- Covered by test cases T-EX-1, T-EX-4, T-EX-8, T-EX-9 in Task 6.

---

## Task 6: Write tests for Excalidraw rendering

- **Status:** Pending
- **Complexity:** High
- **Dependencies:** Task 4, Task 5
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004, CORE-COMPONENT-0006 (dev standards — co-located tests)

### Description
Add a new `describe("4e. Excalidraw Rendering", ...)` block to `src/components/file-viewer.test.tsx` after the existing `describe("4d. Mermaid Rendering", ...)` block.

**Mocking strategy:**
- Mock `next/dynamic` to return the component factory synchronously (returning a stub that renders `<div data-testid="excalidraw-renderer" />`).
- Mock `@excalidraw/excalidraw` with a stub `Excalidraw` component that captures props via a `vi.fn()`.
- Reuse the existing `useTheme` mock (already in the test file), adjusting its return value per test case.

**Test fixtures:**
- Valid scene: `{ "type": "excalidraw", "version": 2, "elements": [{ "id": "1", "type": "rectangle" }], "appState": {}, "files": { "img1": { "id": "img1" } } }`
- Invalid JSON: `"{ not json"`
- Missing elements: `{ "type": "excalidraw", "version": 2 }`

**9 test cases:** T-EX-1 through T-EX-9 (see Test Plan for details).

### Acceptance Criteria
- All 9 test cases (T-EX-1 through T-EX-9) are implemented and pass.
- Mocks for `next/dynamic` and `@excalidraw/excalidraw` are correctly set up.
- All existing test sections (4a Markdown, 4b Diff, 4c Edit, 4d Mermaid) continue to pass unchanged.
- `npm test` completes with zero failures.

### Test Coverage
- T-EX-1: Valid scene renders Excalidraw component
- T-EX-2: Invalid JSON shows inline error
- T-EX-3: Missing elements shows validation error
- T-EX-4: Raw mode shows source, not renderer
- T-EX-5: Dark theme passes `theme="dark"`
- T-EX-6: Light theme passes `theme="light"`
- T-EX-7: `files` field is passed to `initialData`
- T-EX-8: Edit mode shows textarea, not renderer
- T-EX-9: Existing Markdown/Mermaid tests unaffected (regression)
