# Test Plan — Issue #28: Render Excalidraw Files

All tests are added to `src/components/file-viewer.test.tsx` under a new `describe("4e. Excalidraw Rendering", ...)` block.

## Fixtures

```typescript
const VALID_EXCALIDRAW_SCENE = JSON.stringify({
  type: "excalidraw",
  version: 2,
  elements: [{ id: "1", type: "rectangle", x: 0, y: 0, width: 100, height: 50 }],
  appState: { viewBackgroundColor: "#ffffff" },
  files: { img1: { id: "img1", dataURL: "data:image/png;base64,abc", mimeType: "image/png" } },
});

const INVALID_JSON = "{ not valid json at all";

const MISSING_ELEMENTS = JSON.stringify({
  type: "excalidraw",
  version: 2,
});
```

## Mock Setup

```typescript
// Mock next/dynamic to return the component synchronously
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: React.ComponentType }>, _opts: unknown) => {
    // Return a stub component that records props
    return function ExcalidrawStub(props: Record<string, unknown>) {
      mockExcalidrawComponent(props);
      return <div data-testid="excalidraw-renderer" />;
    };
  },
}));

const mockExcalidrawComponent = vi.fn();

vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: (props: Record<string, unknown>) => {
    mockExcalidrawComponent(props);
    return <div data-testid="excalidraw-renderer" />;
  },
}));
```

---

## Test T-EX-1: Valid scene renders Excalidraw component

- **Type:** Unit
- **Task:** Task 4, Task 5
- **Priority:** Critical

### Setup
- Mock `useWorkspace` to return `fileContent` with `language: "excalidraw"` and `content: VALID_EXCALIDRAW_SCENE`.
- `useTheme` returns `{ theme: "dark" }`.

### Steps
1. Render `<FileViewer />`.
2. Wait for content to load.

### Expected Result
- `screen.getByTestId("excalidraw-renderer")` is present in the DOM.
- No `CodeView` element is present (the JSON source is not shown).

---

## Test T-EX-2: Invalid JSON shows inline error

- **Type:** Unit
- **Task:** Task 4
- **Priority:** Critical

### Setup
- Mock `fileContent` with `language: "excalidraw"` and `content: INVALID_JSON`.

### Steps
1. Render `<FileViewer />`.
2. Wait for content to load.

### Expected Result
- Text "Invalid Excalidraw file" is present in the DOM.
- `data-testid="excalidraw-renderer"` is **not** present.

---

## Test T-EX-3: Missing elements shows validation error

- **Type:** Unit
- **Task:** Task 4
- **Priority:** High

### Setup
- Mock `fileContent` with `language: "excalidraw"` and `content: MISSING_ELEMENTS`.

### Steps
1. Render `<FileViewer />`.
2. Wait for content to load.

### Expected Result
- Error message text contains "elements".
- `data-testid="excalidraw-renderer"` is **not** present.

---

## Test T-EX-4: Raw mode shows source, not renderer

- **Type:** Unit
- **Task:** Task 5
- **Priority:** High

### Setup
- Mock `fileContent` with `language: "excalidraw"` and `content: VALID_EXCALIDRAW_SCENE`.

### Steps
1. Render `<FileViewer />`.
2. Click the raw/preview toggle button (aria-label "Show raw source").
3. Wait for re-render.

### Expected Result
- `data-testid="excalidraw-renderer"` is **not** present.
- `CodeView` element is present, showing the JSON source.

---

## Test T-EX-5: Dark theme passes theme="dark"

- **Type:** Unit
- **Task:** Task 4
- **Priority:** High

### Setup
- Mock `useTheme` to return `{ theme: "dark" }`.
- Mock `fileContent` with `language: "excalidraw"` and `content: VALID_EXCALIDRAW_SCENE`.

### Steps
1. Render `<FileViewer />`.
2. Wait for content to load.

### Expected Result
- `mockExcalidrawComponent` was called with props containing `theme: "dark"`.

---

## Test T-EX-6: Light theme passes theme="light"

- **Type:** Unit
- **Task:** Task 4
- **Priority:** High

### Setup
- Mock `useTheme` to return `{ theme: "light" }`.
- Mock `fileContent` with `language: "excalidraw"` and `content: VALID_EXCALIDRAW_SCENE`.

### Steps
1. Render `<FileViewer />`.
2. Wait for content to load.

### Expected Result
- `mockExcalidrawComponent` was called with props containing `theme: "light"` (NOT `"default"`).

---

## Test T-EX-7: files field is passed to initialData

- **Type:** Unit
- **Task:** Task 4
- **Priority:** Medium

### Setup
- Mock `fileContent` with `language: "excalidraw"` and `content: VALID_EXCALIDRAW_SCENE` (which includes a `files` object with `img1`).

### Steps
1. Render `<FileViewer />`.
2. Wait for content to load.

### Expected Result
- `mockExcalidrawComponent` was called with `initialData.files` matching the fixture's files object (contains `img1`).

---

## Test T-EX-8: Edit mode shows textarea, not renderer

- **Type:** Unit
- **Task:** Task 5
- **Priority:** High

### Setup
- Mock `fileContent` with `language: "excalidraw"` and `content: VALID_EXCALIDRAW_SCENE`.

### Steps
1. Render `<FileViewer />`.
2. Click the edit button (aria-label "Edit file").
3. Wait for re-render.

### Expected Result
- A `<textarea>` element is present in the DOM.
- `data-testid="excalidraw-renderer"` is **not** present.

---

## Test T-EX-9: Existing Markdown/Mermaid tests unaffected

- **Type:** Regression
- **Task:** Task 5
- **Priority:** Critical

### Setup
- No special setup — uses existing test fixtures and mocks from sections 4a and 4d.

### Steps
1. Run the full test suite: `npm test -- src/components/file-viewer.test.tsx`.

### Expected Result
- All tests in sections 4a (Markdown Rendering), 4b (Diff View), 4c (Edit Mode), and 4d (Mermaid Rendering) pass without modification.
- Zero test failures across the entire file.
