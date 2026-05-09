# Action Plan: Mermaid Diagram Rendering in Markdown Preview

## Feature
- **ID:** 18
- **Research Brief:** project/issues/18/research/00-research.md

## ADRs Created
- None — no new architectural decisions required. The mermaid feature fits within the existing tech stack (ADR-0002) and theming system (CORE-COMPONENT-0004).

## Core-Components Updated
- **CORE-COMPONENT-0004 (Theming)** — Updated to add third-party renderer theming rule: libraries with their own theme systems (e.g., mermaid) must consume `useTheme()` and map app theme values to their native theme tokens. Added mermaid-specific mapping guidance (`dark` → `'dark'`, `light` → `'default'`).

## Implementation Tasks

### Task 1: Install mermaid dependency
Add `mermaid` as a runtime dependency via `npm install mermaid`. Verify it appears in `package.json`.

### Task 2: Extend `renderer.code` for mermaid placeholders
Modify the custom `marked.Renderer.code` in `file-viewer.tsx` to detect `lang === "mermaid"` and emit a safe HTML placeholder `<div class="mermaid-block" data-mermaid-source="...">` that survives DOMPurify sanitization.

### Task 3: Refactor `MarkdownView` to stateful component with mermaid rendering
Convert `MarkdownView` from a pure function to a stateful component with `useRef`, `useTheme()`, `useMemo`, and `useEffect`. Implement `renderMermaidBlocks()` helper that dynamically imports mermaid, initializes with correct theme, renders each placeholder to SVG, and handles errors inline.

### Task 4: Add mermaid CSS styles
Add `.mermaid-block`, `.mermaid-block svg`, and `.mermaid-error` styles to `globals.css` for proper diagram display and error fallback.

### Task 5: Write tests for mermaid rendering
Add tests to `file-viewer.test.tsx` covering: mermaid block renders diagram container, invalid syntax shows error, theme integration, raw mode shows mermaid source. Mock the mermaid library.

### Task 6: Update LLM.txt
Update `LLM.txt` to document the mermaid rendering capability if applicable.
