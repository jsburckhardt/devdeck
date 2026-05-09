# Implementation Notes — Issue #18: Mermaid Diagram Rendering

## Summary

Added mermaid diagram rendering support to the markdown preview in the file viewer component. Mermaid fenced code blocks (` ```mermaid `) are now rendered as interactive SVG diagrams.

## Tasks Completed

### Task 1: Install mermaid dependency
- **Status:** ✅ Complete
- **Files Changed:** `package.json`, `package-lock.json`
- Added `mermaid@^11.14.0` as a runtime dependency

### Task 2: Extend `renderer.code` for mermaid placeholders
- **Status:** ✅ Complete
- **Files Changed:** `src/components/file-viewer.tsx`
- Modified the `marked.Renderer.code` function to detect `lang === "mermaid"` and emit a `<div class="mermaid-block" data-mermaid-source="...">` placeholder
- Mermaid source is base64-encoded in the `data-mermaid-source` attribute to survive DOMPurify sanitization (DOMPurify strips attributes containing `-->` patterns which are common in mermaid graph syntax)
- Non-mermaid code blocks continue to use hljs highlighting unchanged

### Task 3: Refactor `MarkdownView` to stateful component with mermaid rendering
- **Status:** ✅ Complete
- **Files Changed:** `src/components/file-viewer.tsx`
- Added `useRef` for article element, `useMemo` for HTML generation, `useEffect` for mermaid rendering
- Integrated `useTheme()` hook to pass theme to mermaid (`dark` → `'dark'`, `light` → `'default'`)
- Mermaid is dynamically imported only when mermaid blocks are present (lazy loading)
- Each block renders with a unique ID using `Date.now()` + index to avoid collisions
- Error handling: invalid syntax shows inline error with `.mermaid-error` class
- Cleanup flag (`cancelled`) prevents updates after unmount

### Task 4: Add mermaid CSS styles
- **Status:** ✅ Complete
- **Files Changed:** `src/app/globals.css`
- Added `.mermaid-block` styles (centered, responsive SVG)
- Added `.mermaid-error` styles using `--destructive` CSS variable for theme-aware error display

### Task 5: Write tests for mermaid rendering
- **Status:** ✅ Complete
- **Files Changed:** `src/components/file-viewer.test.tsx`
- Added `describe("4d. Mermaid Rendering")` block with 9 tests:
  1. Mermaid placeholder survives sanitization
  2. Mermaid renders SVG diagram
  3. Invalid mermaid syntax shows inline error
  4. Theme mapping — dark theme
  5. Theme mapping — light theme
  6. Raw mode shows mermaid source as text
  7. Non-mermaid code blocks are unaffected
  8. Multiple mermaid blocks in one document
  9. No mermaid import when no mermaid blocks present

### Task 6: Update LLM.txt
- **Status:** ✅ Complete
- **Files Changed:** `LLM.txt`
- Updated file-viewer entry to mention mermaid diagram rendering

## Key Design Decisions

### Base64 encoding for data attributes
DOMPurify strips `data-*` attributes whose values contain `-->` patterns (HTML comment end delimiter). Since `-->` is extremely common in mermaid graph syntax (e.g., `A --> B`), the mermaid source is base64-encoded before storage in the `data-mermaid-source` attribute and decoded at render time. This ensures the placeholder survives sanitization regardless of mermaid content.

### TextEncoder/TextDecoder for base64 (post-review fix)
The initial implementation used `btoa(unescape(encodeURIComponent(text)))` and `decodeURIComponent(escape(atob(encoded)))` for base64 encode/decode. The Copilot PR reviewer flagged that `escape`/`unescape` are deprecated globals not guaranteed in all JS runtimes. Replaced with `TextEncoder`/`TextDecoder`-based `toBase64()`/`fromBase64()` helpers for safe Unicode handling.

### SVG sanitization (post-review fix)
Mermaid's `render()` returns SVG markup that was originally inserted via `innerHTML` without sanitization, bypassing DOMPurify. Fixed to sanitize SVG output with `DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })` before DOM insertion to prevent XSS from unexpected SVG content.

### Error message escaping (post-review fix)
Mermaid parse errors can include user-controlled content from diagram source. Error messages are now HTML-escaped via `escapeHtml()` before interpolation into `innerHTML` to prevent HTML injection.

### Base64 decode error handling (post-review fix)
The `fromBase64()` call is wrapped in a `try/catch` to gracefully handle malformed `data-mermaid-source` attributes (e.g., injected via raw HTML in markdown). On decode failure, the mermaid placeholder is left as-is rather than crashing the entire preview.

### Dynamic import
Mermaid (~200KB) is only loaded when the markdown actually contains mermaid code blocks, avoiding unnecessary bundle size impact for non-mermaid markdown files.

## Test Results

- **Test Files:** 17 passed (17)
- **Tests:** 159 passed (159)
- **Lint:** 0 errors (1 pre-existing warning in unrelated file)
- **Format:** All files use Prettier code style
- **Build:** Successful
