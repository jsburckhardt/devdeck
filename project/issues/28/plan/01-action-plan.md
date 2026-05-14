# Action Plan: Render Excalidraw Files in File Preview

## Feature
- **ID:** 28
- **Research Brief:** project/issues/28/research/00-research.md

## ADRs Created
- None — ADR-0002 already covers the tech stack and npm package additions.

## Core-Components Updated
- **CORE-COMPONENT-0004 (Theming)** — Amended to add Excalidraw theme mapping rule and integration guideline. Decision #65 added to DECISION-LOG.md.

## Implementation Tasks

### Overview

Render `.excalidraw` files as interactive Excalidraw diagrams in the file preview pane using the official `@excalidraw/excalidraw` React component. The implementation follows the existing Markdown raw/preview toggle pattern but uses a dedicated top-level render branch (not embedded in Markdown like Mermaid).

### Task Sequence

1. **Task 1: Add `@excalidraw/excalidraw` dependency** — Install the npm package.
2. **Task 2: Add language mapping** — Register `excalidraw` extension in `languageMap` in `src/lib/file-utils.ts`.
3. **Task 3: Import Excalidraw CSS** — Add the CSS import before Tailwind in `src/app/globals.css`.
4. **Task 4: Create `ExcalidrawView` component** — New file `src/components/excalidraw-view.tsx` with `next/dynamic`, JSON validation, error state, view-only mode, and theme mapping.
5. **Task 5: Integrate into FileViewer** — Extend `src/components/file-viewer.tsx` with import, detection, toggle condition, and render branch.
6. **Task 6: Write tests** — Add 9 test cases to `src/components/file-viewer.test.tsx` covering rendering, errors, theme mapping, raw toggle, and edit mode.

### Key Design Decisions

- **`next/dynamic({ ssr: false })`** — Excalidraw depends on browser APIs (`window`, `document`, canvas). Dynamic import prevents SSR crashes.
- **`parseScene()` validation** — Validates JSON and checks for `elements` array. Shows inline error for invalid files.
- **Shared `showRaw` state** — Reuses the existing `showRaw` toggle state from the Markdown pattern. Reset on file change is already handled.
- **Theme mapping** — `dark` → `"dark"`, `light` → `"light"` (per CORE-COMPONENT-0004, Decision #65).
- **Render tree insertion** — ExcalidrawView branch inserted before the Markdown branch in the conditional render tree.
