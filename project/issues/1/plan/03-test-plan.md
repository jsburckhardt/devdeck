# Test Plan — Issue #1: Bootstrap DevDeck Shell Layout

## Test T1.1: ThemeProvider defaults to dark theme

- **Type:** Unit
- **Task:** TASK-1.2
- **Priority:** High

### Setup
- Render a test component wrapped in `ThemeProvider`
- Clear localStorage before test

### Steps
1. Render `<ThemeProvider><TestChild /></ThemeProvider>`
2. Inside TestChild, call `useTheme()` and display the `theme` value

### Expected Result
- `theme` value is `"dark"`
- `document.documentElement` has class `"dark"`

---

## Test T1.2: ThemeProvider toggleTheme switches to light

- **Type:** Unit
- **Task:** TASK-1.2
- **Priority:** High

### Setup
- Render a test component wrapped in `ThemeProvider`
- Clear localStorage before test

### Steps
1. Render provider with a button that calls `toggleTheme()`
2. Click the toggle button

### Expected Result
- `theme` value changes to `"light"`
- `document.documentElement` no longer has class `"dark"`
- `localStorage.getItem("theme")` returns `"light"`

---

## Test T1.3: ThemeProvider reads stored preference

- **Type:** Unit
- **Task:** TASK-1.2
- **Priority:** Medium

### Setup
- Set `localStorage.setItem("theme", "light")` before render

### Steps
1. Render `<ThemeProvider><TestChild /></ThemeProvider>`
2. Read theme value from useTheme()

### Expected Result
- `theme` value is `"light"`
- `document.documentElement` does NOT have class `"dark"`

---

## Test T1.4: ErrorBoundary renders children normally

- **Type:** Unit
- **Task:** TASK-1.3
- **Priority:** High

### Setup
- Create a simple child component that renders text

### Steps
1. Render `<ErrorBoundary><div>Hello</div></ErrorBoundary>`

### Expected Result
- "Hello" text is visible in the document
- No fallback UI is shown

---

## Test T1.5: ErrorBoundary catches rendering error

- **Type:** Unit
- **Task:** TASK-1.3
- **Priority:** High

### Setup
- Create a child component that throws an error during render
- Suppress console.error for cleaner test output

### Steps
1. Render `<ErrorBoundary><ThrowingComponent /></ErrorBoundary>`

### Expected Result
- Fallback UI is rendered (e.g., "Something went wrong" text)
- ThrowingComponent's text is NOT visible
- Error is logged to console

---

## Test T1.6: ErrorBoundary retry resets state

- **Type:** Unit
- **Task:** TASK-1.3
- **Priority:** Medium

### Setup
- Create a component that throws on first render but not after reset
- Use a ref or external flag to control throwing behavior

### Steps
1. Render ErrorBoundary with throwing child
2. Verify fallback shows
3. Fix the throw condition
4. Click "Try again" button

### Expected Result
- After clicking retry, children attempt to re-render
- If child no longer throws, normal content is displayed

---

## Test T1.7: Shell page renders DevDeck header

- **Type:** Smoke
- **Task:** TASK-1.7
- **Priority:** High

### Setup
- Import and render the default export from `src/app/page.tsx`
- May need to mock `react-resizable-panels` if it requires browser layout APIs

### Steps
1. Render `<Home />`
2. Query for "DevDeck" text

### Expected Result
- Element containing "DevDeck" is present in the document

---

## Test T1.8: Shell page renders panel placeholders

- **Type:** Smoke
- **Task:** TASK-1.7
- **Priority:** High

### Setup
- Same as T1.7

### Steps
1. Render `<Home />`
2. Query for panel label text: "File Explorer", "Editor", "Terminal"

### Expected Result
- At least the text "File Explorer", "Editor", and "Terminal" are present in the rendered output

---

## Test T1.9: Full pipeline validation

- **Type:** Integration
- **Task:** TASK-1.8
- **Priority:** Critical

### Setup
- All source files from TASK-1.1 through TASK-1.7 are in place

### Steps
1. Run `just check` (lint → format-check → build → test)

### Expected Result
- All four commands exit with code 0
- No lint errors, no format issues, build succeeds, all tests pass
