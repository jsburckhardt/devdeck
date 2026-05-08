# Test Plan — Issue #18: Mermaid Diagram Rendering

## Test 1: Mermaid placeholder survives sanitization

- **Type:** Unit
- **Task:** Task 2
- **Priority:** High

### Setup
- Mock `useWorkspace` with `selectedFile: "README.md"`
- Mock fetch to return markdown content containing a mermaid fenced code block:
  ````
  ```mermaid
  graph TD
    A --> B
  ```
  ````
- Mock `useTheme` to return `{ theme: 'dark', setTheme: vi.fn(), toggleTheme: vi.fn() }`

### Steps
1. Render `<FileViewer />`
2. Wait for the article element to appear
3. Query the article for `[data-mermaid-source]` elements

### Expected Result
- At least one element with `data-mermaid-source` attribute exists in the DOM
- The `data-mermaid-source` attribute contains the mermaid source text (`graph TD\n  A --> B`)
- The element has class `mermaid-block`

---

## Test 2: Mermaid renders SVG diagram

- **Type:** Unit
- **Task:** Task 3
- **Priority:** High

### Setup
- Mock `useWorkspace` with `selectedFile: "README.md"`
- Mock fetch to return markdown with mermaid block
- Mock `useTheme` to return `{ theme: 'dark' }`
- Mock dynamic `import('mermaid')` to return a mock mermaid object where:
  - `mermaid.initialize` is a no-op
  - `mermaid.render` resolves to `{ svg: '<svg data-testid="mermaid-svg">diagram</svg>' }`

### Steps
1. Render `<FileViewer />`
2. Wait for `useEffect` to run (use `waitFor`)
3. Query the DOM for the rendered SVG

### Expected Result
- The mermaid placeholder's innerHTML is replaced with the SVG returned by `mermaid.render`
- `mermaid.initialize` was called with `{ startOnLoad: false, securityLevel: 'strict', theme: 'dark' }`
- `mermaid.render` was called with a unique ID and the mermaid source

---

## Test 3: Invalid mermaid syntax shows inline error

- **Type:** Unit
- **Task:** Task 3
- **Priority:** High

### Setup
- Mock `useWorkspace` with `selectedFile: "README.md"`
- Mock fetch to return markdown with invalid mermaid block:
  ````
  ```mermaid
  invalid!!!syntax
  ```
  ````
- Mock `import('mermaid')` where `mermaid.render` throws `new Error("Parse error")`

### Steps
1. Render `<FileViewer />`
2. Wait for `useEffect` to complete
3. Query the DOM for `.mermaid-error` elements

### Expected Result
- A `.mermaid-error` element is present in the DOM
- The error message "Parse error" (or similar) is visible
- The raw mermaid source is preserved in a `<pre>` block within the error container

---

## Test 4: Theme mapping — dark theme

- **Type:** Unit
- **Task:** Task 3
- **Priority:** High

### Setup
- Mock `useTheme` to return `{ theme: 'dark' }`
- Mock `import('mermaid')` with spy on `mermaid.initialize`
- Render markdown with mermaid block

### Steps
1. Render `<FileViewer />`
2. Wait for mermaid rendering to complete
3. Inspect the call to `mermaid.initialize`

### Expected Result
- `mermaid.initialize` was called with `theme: 'dark'`

---

## Test 5: Theme mapping — light theme

- **Type:** Unit
- **Task:** Task 3
- **Priority:** High

### Setup
- Mock `useTheme` to return `{ theme: 'light' }`
- Mock `import('mermaid')` with spy on `mermaid.initialize`
- Render markdown with mermaid block

### Steps
1. Render `<FileViewer />`
2. Wait for mermaid rendering to complete
3. Inspect the call to `mermaid.initialize`

### Expected Result
- `mermaid.initialize` was called with `theme: 'default'`

---

## Test 6: Raw mode shows mermaid source as text

- **Type:** Unit
- **Task:** Task 5
- **Priority:** Medium

### Setup
- Mock `useWorkspace` with `selectedFile: "README.md"`
- Mock fetch to return markdown with mermaid block
- Mock `useTheme`

### Steps
1. Render `<FileViewer />`
2. Wait for the article element
3. Click the raw/preview toggle button (aria-label "Show raw source")
4. Verify the view switches to `CodeView`

### Expected Result
- After toggling to raw mode, the article element is removed
- The raw mermaid source text (` ```mermaid `) is visible as plain text in the code view
- No SVG diagram is rendered in raw mode

---

## Test 7: Non-mermaid code blocks are unaffected

- **Type:** Unit
- **Task:** Task 2
- **Priority:** Medium

### Setup
- Mock `useWorkspace` with `selectedFile: "README.md"`
- Mock fetch to return markdown with a TypeScript code block (no mermaid)
- Mock `useTheme`

### Steps
1. Render `<FileViewer />`
2. Wait for the article element
3. Query for hljs-highlighted code elements

### Expected Result
- The article contains `<pre class="hljs">` elements with highlighted TypeScript code
- No `[data-mermaid-source]` elements exist
- No mermaid dynamic import is triggered

---

## Test 8: Multiple mermaid blocks in one document

- **Type:** Unit
- **Task:** Task 3
- **Priority:** Medium

### Setup
- Mock fetch to return markdown with two mermaid code blocks
- Mock `mermaid.render` to return different SVGs for each call

### Steps
1. Render `<FileViewer />`
2. Wait for mermaid rendering
3. Count the rendered SVG containers

### Expected Result
- Two mermaid diagrams are rendered
- Each `mermaid.render` call received a unique ID (`mermaid-diagram-0`, `mermaid-diagram-1`)

---

## Test 9: Mermaid lazy loading — no import when no mermaid blocks

- **Type:** Unit
- **Task:** Task 3
- **Priority:** Low

### Setup
- Mock fetch to return plain markdown (no mermaid blocks)
- Spy on dynamic import

### Steps
1. Render `<FileViewer />`
2. Wait for rendering to complete

### Expected Result
- `import('mermaid')` was never called
- The component renders normally without loading the mermaid library
