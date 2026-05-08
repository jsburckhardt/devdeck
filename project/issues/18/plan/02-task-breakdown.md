# Task Breakdown — Issue #18: Mermaid Diagram Rendering

## Task 1: Install mermaid dependency

- **Status:** Not Started
- **Complexity:** Trivial
- **Dependencies:** None
- **Related ADRs:** ADR-0002 (tech stack)
- **Related Core-Components:** None

### Description
Add the `mermaid` library as a runtime dependency. Run `npm install mermaid` and verify the dependency appears in `package.json` and `package-lock.json`.

### Acceptance Criteria
- `mermaid` is listed in `dependencies` in `package.json`
- `package-lock.json` is updated
- `npm install` completes without errors
- No other dependencies are modified

### Test Coverage
- Manual: verify `package.json` contains `"mermaid"` in dependencies
- Run `npm ls mermaid` to confirm it resolves

---

## Task 2: Extend `renderer.code` for mermaid placeholders

- **Status:** Not Started
- **Complexity:** Low
- **Dependencies:** None (no runtime mermaid import needed here)
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0005 (error handling)

### Description
In `src/components/file-viewer.tsx`, modify the custom `marked.Renderer.code` function (line 47-53). When `lang === "mermaid"`, emit a placeholder `<div>` instead of a highlighted code block:

```html
<div class="mermaid-block" data-mermaid-source="<HTML-escaped mermaid source>">
  <pre><code class="language-mermaid">raw source</code></pre>
</div>
```

The `<div>`, `<pre>`, `<code>`, and `data-*` attributes all pass through DOMPurify's default sanitization. The raw source inside `<pre>` serves as a loading fallback shown while mermaid renders asynchronously.

HTML-escape the source stored in `data-mermaid-source` to prevent attribute injection.

### Acceptance Criteria
- Mermaid fenced code blocks produce a `<div class="mermaid-block">` with `data-mermaid-source` attribute
- Non-mermaid code blocks continue to render with hljs highlighting (no regression)
- The `data-mermaid-source` attribute contains properly HTML-escaped mermaid source
- DOMPurify does not strip the placeholder elements or the data attribute

### Test Coverage
- Unit test: render markdown containing a mermaid code block, verify the sanitized HTML contains `mermaid-block` class and `data-mermaid-source` attribute
- Unit test: render markdown containing a TypeScript code block, verify hljs highlighting still works
- Unit test: verify mermaid source with special characters (`<`, `>`, `"`, `&`) is properly escaped in the data attribute

---

## Task 3: Refactor `MarkdownView` to stateful component with mermaid rendering

- **Status:** Not Started
- **Complexity:** High
- **Dependencies:** Task 1 (mermaid installed), Task 2 (placeholders emitted)
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004 (theming), CORE-COMPONENT-0005 (error handling)

### Description
Refactor the `MarkdownView` component in `src/components/file-viewer.tsx`:

1. **Add imports:** `useRef` (already imported), `useTheme` from `@/components/theme-provider`
2. **Add `useTheme()`** call to read current theme
3. **Add `articleRef`** — `useRef<HTMLElement>(null)` on the `<article>` element
4. **Wrap HTML generation in `useMemo`** — `marked.parse()` + `DOMPurify.sanitize()` memoized on `[content]`
5. **Add `useEffect`** — dependency array `[rawHtml, theme]`:
   - Query `articleRef.current.querySelectorAll('[data-mermaid-source]')`
   - If no elements found, return early (no mermaid blocks)
   - Dynamically `import('mermaid')` — lazy load only when needed
   - Call `mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme === 'dark' ? 'dark' : 'default' })`
   - For each element, call `mermaid.render(`mermaid-diagram-${index}`, source)` 
   - On success: replace element's `innerHTML` with the returned SVG string
   - On error: replace element's `innerHTML` with an error fallback div (`.mermaid-error` class) showing the error message and preserving the raw source in a `<pre>` block
   - Use a cleanup flag (`let cancelled = false`) to avoid updating unmounted components

### Acceptance Criteria
- `MarkdownView` consumes `useTheme()` and passes theme to mermaid
- Mermaid is only imported dynamically when mermaid blocks are present
- Each mermaid block renders as an SVG diagram in the DOM
- Invalid mermaid syntax shows an inline error with the raw source preserved
- Theme changes trigger re-rendering of mermaid diagrams (dark ↔ light)
- Non-mermaid markdown content continues to render correctly (no regression)
- `mermaid.initialize()` is called before each render batch (not once at module level) to handle theme changes
- Unique IDs are generated for each `mermaid.render()` call using index-based pattern

### Test Coverage
- Unit test: `MarkdownView` renders markdown with mermaid block and produces a container with `data-mermaid-source`
- Unit test: mock `import('mermaid')` and verify `mermaid.initialize` is called with correct theme
- Unit test: mock `mermaid.render` to return SVG, verify SVG appears in the DOM
- Unit test: mock `mermaid.render` to throw, verify error fallback is shown with `.mermaid-error` class
- Unit test: verify theme change triggers re-render (mock `useTheme` to return different values)
- Unit test: verify cleanup flag prevents state update after unmount

---

## Task 4: Add mermaid CSS styles

- **Status:** Not Started
- **Complexity:** Low
- **Dependencies:** Task 3 (component produces these class names)
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004 (theming)

### Description
Add CSS styles to `src/app/globals.css` for mermaid diagram rendering:

```css
/* Mermaid diagram blocks */
.markdown-preview .mermaid-block {
  margin-top: 0;
  margin-bottom: 16px;
  text-align: center;
}

.markdown-preview .mermaid-block svg {
  max-width: 100%;
  height: auto;
}

.markdown-preview .mermaid-error {
  border: 1px solid var(--destructive);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
  background-color: color-mix(in oklch, var(--destructive) 10%, transparent);
}

.markdown-preview .mermaid-error p {
  color: var(--destructive);
  font-size: 13px;
  margin-bottom: 8px;
}

.markdown-preview .mermaid-error pre {
  font-size: 12px;
  opacity: 0.8;
}
```

### Acceptance Criteria
- `.mermaid-block` styles are defined inside `.markdown-preview` scope
- `.mermaid-block svg` has `max-width: 100%` for responsive diagrams
- `.mermaid-error` uses `--destructive` CSS variable for theme-aware error styling
- No existing styles are broken

### Test Coverage
- Visual: verify mermaid diagram renders centered and does not overflow container
- Visual: verify error state shows red-bordered box with readable error text
- Automated: verify the CSS file parses without errors (build step)

---

## Task 5: Write tests for mermaid rendering

- **Status:** Not Started
- **Complexity:** Medium
- **Dependencies:** Task 2, Task 3, Task 4
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0004 (theming), CORE-COMPONENT-0005 (error handling), CORE-COMPONENT-0006 (development standards)

### Description
Add tests to `src/components/file-viewer.test.tsx` in a new `describe("4d. Mermaid Rendering")` block. Mock the mermaid library using `vi.mock()`. Mock `useTheme` to control theme values.

Tests to write:
1. **Mermaid placeholder**: markdown with mermaid block renders a `[data-mermaid-source]` element
2. **Mermaid renders diagram**: mock `mermaid.render` returning SVG, verify SVG appears in DOM
3. **Invalid syntax error**: mock `mermaid.render` throwing, verify `.mermaid-error` element appears
4. **Theme mapping**: verify `mermaid.initialize` is called with `theme: 'dark'` when app theme is dark, and `theme: 'default'` when light
5. **Raw mode shows source**: toggle raw mode, verify mermaid source appears as plain text (not rendered)
6. **Non-mermaid code blocks unchanged**: TypeScript code block still renders with hljs classes

### Acceptance Criteria
- All 6 test cases pass
- Mermaid library is mocked (not imported for real in tests)
- `useTheme` is mocked to control theme values
- Tests follow existing patterns in the file (use `setupWorkspace`, `mockFetchResponse`, `waitFor`)
- Tests are co-located in `file-viewer.test.tsx`

### Test Coverage
- 100% of the mermaid code paths are covered: placeholder creation, successful render, error render, theme mapping, raw mode fallback

---

## Task 6: Update LLM.txt

- **Status:** Not Started
- **Complexity:** Trivial
- **Dependencies:** Task 3
- **Related ADRs:** None
- **Related Core-Components:** None

### Description
Review `LLM.txt` and add a brief mention of mermaid diagram rendering capability in the file viewer section, if such a section exists or is appropriate.

### Acceptance Criteria
- `LLM.txt` documents that markdown preview supports mermaid diagram rendering
- Entry is concise and follows the existing format

### Test Coverage
- Manual: review `LLM.txt` for accuracy
