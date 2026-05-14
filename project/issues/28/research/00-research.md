# Research Brief — Issue #28

## Render `.excalidraw` Files in DevDeck's File Preview Pane

**Scope Type:** `issue`
**Issue:** #28
**Date:** 2026-07-19

---

## 1. Problem Statement

DevDeck currently renders `.excalidraw` files as raw JSON in `CodeView` with `"plaintext"` syntax
highlighting (the extension is absent from `languageMap` in `src/lib/file-utils.ts`, so it falls
through to `"plaintext"`). Excalidraw files are structured JSON documents containing diagram
elements, application state, and optionally embedded image assets. Users expect to see the rendered
diagram — not raw JSON — in the preview pane, matching the excalidraw.com experience.

The feature must:
- Render `.excalidraw` files visually using the official `@excalidraw/excalidraw` React component
- Operate in view-only mode (`viewModeEnabled={true}`)
- Map DevDeck's dark/light theme to Excalidraw's native `"dark"` / `"light"` theme tokens
- Support embedded images (`files` field in the JSON)
- Preserve a raw source toggle (same pattern as Markdown's raw/preview toggle)
- Continue to support edit mode (edits the underlying JSON text)
- Degrade gracefully with an inline error when the JSON is invalid or malformed
- Leave existing Markdown, Mermaid, and CodeView rendering entirely unchanged

---

## 2. Scope Classification

**`issue`** — This is a self-contained feature addition confined to the file viewer. It introduces
one new component and extensions to two existing files, with no new cross-cutting pattern. However,
**CORE-COMPONENT-0004 (Theming)** requires a minor amendment to document the Excalidraw-specific
theme mapping rule (parallel to the existing Mermaid mapping in Decision #58), and a new Decision
#65 must be recorded in `DECISION-LOG.md`.

No new ADR is required. ADR-0002 already sanctions the tech stack and package additions.
The `next/dynamic({ ssr: false })` technique is a standard documented Next.js usage pattern —
not a novel architectural decision.

---

## 3. Codebase Analysis

### 3.1 File Viewer Architecture
**Source:** `src/components/file-viewer.tsx`

The `FileViewer` component is a single `"use client"` module (~623 lines). It fetches file content
from `/api/files/content`, then delegates rendering to one of several sub-components via this
decision tree (lines 602–618):

```
editMode               → <EditView>
viewMode === "changes" → <DiffView> (with loading spinner)
fileContent.isBinary   → <BinaryFileView>
isMarkdown && !showRaw → <MarkdownView>
else                   → <CodeView>
```

Where `isMarkdown` is derived at line 490:
```typescript
const isMarkdown = fileContent.language === "markdown";
```

**Header bar** (lines 536–548): The Markdown raw/preview toggle is shown conditionally:
```tsx
{isMarkdown && !editMode && viewMode === "file" && (
  <button
    onClick={() => setShowRaw((v) => !v)}
    aria-label={showRaw ? "Show preview" : "Show raw source"}
    aria-pressed={showRaw}
  >
    {showRaw ? <Eye size={14} /> : <CodeIcon size={14} />}
  </button>
)}
```

**State reset on file change** (lines 305–315): `showRaw`, `viewMode`, `diffContent`, `editMode`,
`editContent`, `originalContent` are reset when `selectedFile` changes — the new Excalidraw toggle
shares `showRaw` and benefits from this reset for free.

### 3.2 The Mermaid Pattern (Precedent)
**Source:** `src/components/file-viewer.tsx:132–205`

Mermaid is embedded *inside* Markdown, so it uses:
1. A marked `Renderer.code()` hook that emits a placeholder `<div data-mermaid-source="...">` with base64-encoded source
2. A `useEffect` that dynamically imports `mermaid`, calls `mermaid.initialize({ theme })`, iterates placeholders, and replaces `innerHTML` with SVG
3. Inline `.mermaid-error` div on failure

**Excalidraw differs fundamentally**: `.excalidraw` files are standalone top-level files (not embedded in Markdown), so they need a new top-level render branch — not an extension of the marked renderer. Excalidraw also requires a **React component** (not DOM manipulation), making `next/dynamic({ ssr: false })` the correct integration pattern rather than `import()` inside `useEffect`.

### 3.3 Language Mapping
**Source:** `src/lib/file-utils.ts:1–39`

`getLanguageFromFilename()` looks up the file extension in `languageMap`. The `excalidraw` key is
**absent** — it falls through to `"plaintext"`. Adding `excalidraw: "excalidraw"` makes the
language signal available to the file viewer without touching the API route.

`isBinaryFile()` (lines 84–87) does not include `excalidraw` — `.excalidraw` files are UTF-8 JSON
and must remain non-binary. **No change needed here.**

### 3.4 API Route
**Source:** `src/app/api/files/content/route.ts:109–187`

`GET /api/files/content` reads the file as UTF-8 text, calls `getLanguageFromFilename(filename)`,
and returns `FileContent`. Once `excalidraw` is in the language map, the API returns
`language: "excalidraw"` automatically. **No API route changes are required.**

### 3.5 Types
**Source:** `src/lib/types.ts:51–59`

`FileContent` has `content: string` and `language: string`. The entire `.excalidraw` JSON is the
`content` field. **No type changes required.**

### 3.6 Theming (CORE-COMPONENT-0004)
**Source:** `project/architecture/core-components/CORE-COMPONENT-0004-theming.md`

Decision #57 (DECISION-LOG.md:87) mandates: *"Require third-party rendering libraries to consume
`useTheme()` and map app theme to their native theme tokens."*

Decision #58 (line 88) documents the Mermaid mapping: `dark` → `'dark'`, `light` → `'default'`.

Excalidraw's `theme` prop accepts `"light" | "dark"` — a direct 1:1 mapping (unlike Mermaid where
`light` maps to `"default"`). CORE-COMPONENT-0004 must be updated to document this, and Decision
#65 must be added to DECISION-LOG.md.

### 3.7 Confirmed `.excalidraw` File Format
**Source:** `.github/rpiv.excalidraw:1–30`, `project/architecture/soft-factory-pipeline.excalidraw`

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "...",
  "elements": [ { "id": "...", "type": "rectangle", ... } ],
  "appState": { ... },
  "files": { }
}
```

Minimum valid scene: object with `Array.isArray(elements)` true. `appState` and `files` are
optional. The `type === "excalidraw"` field can be used as a secondary validation signal.

### 3.8 Shell Layout Constraints
**Source:** `project/architecture/core-components/CORE-COMPONENT-0007-shell-layout.md`

Decision #22: layout must fill 100vh with no outer scroll. The file viewer content area (line 600):
```tsx
className="min-h-0 flex-1 overflow-auto"
```
The `ExcalidrawView` wrapper must use `h-full` so Excalidraw fills 100% of the available flex
child height. The `overflow-auto` on the parent must be removed or set to `overflow-hidden` for the
excalidraw branch, since Excalidraw manages its own scroll internally.

### 3.9 Next.js Config
**Source:** `next.config.ts`

Only `node-pty` is in `serverExternalPackages`. `@excalidraw/excalidraw` does not require any
server-side config — `next/dynamic({ ssr: false })` excludes it from SSR entirely.

### 3.10 CSS Import Location
**Source:** `src/app/layout.tsx`, `src/app/globals.css`

`globals.css` begins with `@import "tailwindcss"`. The Excalidraw CSS should be imported
**before** the Tailwind import in `globals.css` so Tailwind utility classes can override
Excalidraw's broad selectors:
```css
@import "@excalidraw/excalidraw/index.css";
@import "tailwindcss" source("../");
```

---

## 4. Technical Approach

### 4.1 New File: `src/components/excalidraw-view.tsx`

```tsx
"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Spinner, WarningCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/theme-provider";

// Dynamically imported — Excalidraw does not support SSR
const ExcalidrawReact = dynamic(
  () => import("@excalidraw/excalidraw").then((m) => ({ default: m.Excalidraw })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} className="animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

interface ExcalidrawScene {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

function parseScene(content: string): { scene: ExcalidrawScene } | { error: string } {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as Record<string, unknown>).elements)
    ) {
      return { error: "Not a valid Excalidraw scene: missing or invalid 'elements' array." };
    }
    return { scene: parsed as ExcalidrawScene };
  } catch (e) {
    return { error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function ExcalidrawView({ content }: { content: string }) {
  const { theme } = useTheme();
  const parsed = useMemo(() => parseScene(content), [content]);

  if ("error" in parsed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <WarningCircle size={36} className="text-amber-500" />
        <p className="text-sm font-medium text-foreground">Invalid Excalidraw file</p>
        <p className="max-w-sm text-center text-xs font-mono">{parsed.error}</p>
      </div>
    );
  }

  const { elements, appState, files } = parsed.scene;
  return (
    <div className="h-full w-full">
      <ExcalidrawReact
        initialData={{ elements, appState, files, scrollToContent: true }}
        viewModeEnabled={true}
        theme={theme === "dark" ? "dark" : "light"}
      />
    </div>
  );
}
```

### 4.2 Changes to `src/lib/file-utils.ts`

Add to `languageMap` (after line 29, before closing `}`):
```typescript
excalidraw: "excalidraw",
```

### 4.3 Changes to `src/app/globals.css`

Prepend before the existing `@import "tailwindcss"` line:
```css
@import "@excalidraw/excalidraw/index.css";
```

### 4.4 Changes to `src/components/file-viewer.tsx`

**1. Import** (at top of file, with other component imports):
```typescript
import { ExcalidrawView } from "@/components/excalidraw-view";
```

**2. Detect excalidraw** (after line 490, the `isMarkdown` declaration):
```typescript
const isExcalidraw = fileContent.language === "excalidraw";
```

**3. Extend raw/preview toggle** (lines 538–548, change the condition):
```tsx
{/* Raw/Preview toggle — shown for Markdown and Excalidraw */}
{(isMarkdown || isExcalidraw) && !editMode && viewMode === "file" && (
  <button
    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    onClick={() => setShowRaw((v) => !v)}
    aria-label={showRaw ? "Show preview" : "Show raw source"}
    aria-pressed={showRaw}
    title={showRaw ? "Show preview" : "Show raw source"}
  >
    {showRaw ? <Eye size={14} /> : <CodeIcon size={14} />}
  </button>
)}
```

**4. Extend render tree** (lines 612–618, insert before the Markdown branch):
```tsx
} : fileContent.isBinary ? (
  <BinaryFileView name={fileContent.name} size={fileContent.size} />
) : isExcalidraw && !showRaw ? (
  <ExcalidrawView content={fileContent.content} />
) : isMarkdown && !showRaw ? (
  <MarkdownView content={fileContent.content} />
) : (
  <CodeView content={fileContent.content} language={fileContent.language} />
)}
```

**5. Content area overflow**: The content area `<motion.div>` at line 600 uses
`className="min-h-0 flex-1 overflow-auto"`. The `overflow-auto` is needed for CodeView/MarkdownView
but will show a double-scrollbar for Excalidraw (which manages scroll internally). Consider adding
a conditional class or wrapping ExcalidrawView in a sibling div with `overflow-hidden`. The
simplest approach: keep `overflow-auto` on the wrapper and rely on Excalidraw's internal scroll
handling — Excalidraw renders on a canvas and does not generate content taller than its container.

### 4.5 Test Changes (`src/components/file-viewer.test.tsx`)

Add after the `describe("4d. Mermaid Rendering", ...)` block. The mock strategy:

```typescript
// Mock next/dynamic to return the component synchronously in test environment
vi.mock("next/dynamic", () => ({
  default: (_: unknown, __: unknown) => {
    // In tests, return a stub synchronously
    return function ExcalidrawStub(props: Record<string, unknown>) {
      mockExcalidrawComponent(props);
      return <div data-testid="excalidraw-renderer" />;
    };
  },
}));

const mockExcalidrawComponent = vi.fn();

// Mock the excalidraw package itself (belt-and-suspenders)
vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: (props: Record<string, unknown>) => {
    mockExcalidrawComponent(props);
    return <div data-testid="excalidraw-renderer" />;
  },
}));
```

Required test cases:

| ID | Name | Assertion |
|----|------|-----------|
| T-EX-1 | Valid scene renders Excalidraw component | `data-testid="excalidraw-renderer"` present; `CodeView` absent |
| T-EX-2 | Invalid JSON shows inline error | "Invalid Excalidraw file" text present; no renderer |
| T-EX-3 | Missing `elements` shows validation error | Error message contains "elements"; no renderer |
| T-EX-4 | Raw mode shows source, not renderer | Toggle to raw → renderer absent, `CodeView` present |
| T-EX-5 | Dark theme passes `theme="dark"` | `mockExcalidrawComponent` called with `theme: "dark"` |
| T-EX-6 | Light theme passes `theme="light"` | `mockExcalidrawComponent` called with `theme: "light"` (NOT `"default"`) |
| T-EX-7 | `files` field is passed to `initialData` | `initialData.files` matches fixture |
| T-EX-8 | Edit mode shows textarea, not renderer | Edit button → textarea present; renderer absent |
| T-EX-9 | Existing Markdown/Mermaid tests unaffected | All 4a/4d tests pass (no regression) |

---

## 5. Required File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `package.json` | Add dependency | `"@excalidraw/excalidraw": "^0.17.6"` |
| `src/lib/file-utils.ts` | Edit (1 line) | Add `excalidraw: "excalidraw"` to `languageMap` |
| `src/app/globals.css` | Edit (1 line) | Prepend `@import "@excalidraw/excalidraw/index.css"` |
| `src/components/excalidraw-view.tsx` | **Create** | New `ExcalidrawView` component with `next/dynamic`, parse/validate, theme, error state |
| `src/components/file-viewer.tsx` | Edit | Import `ExcalidrawView`; add `isExcalidraw`; extend toggle; extend render tree |
| `src/components/file-viewer.test.tsx` | Edit | Add `describe("4e. Excalidraw Rendering", ...)` with 9 test cases + mocks |
| `project/architecture/core-components/CORE-COMPONENT-0004-theming.md` | Edit | Add Excalidraw theme mapping to Rules and Integration Guidelines |
| `project/architecture/ADR/DECISION-LOG.md` | Edit | Add Decision #65 |

---

## 6. ADR and Core-Component Assessment

### No new ADR required

ADR-0002 already covers the Next.js + TypeScript + Vitest tech stack and sanctions adding npm
packages. The `next/dynamic({ ssr: false })` pattern is a standard Next.js feature — not a novel
architectural decision requiring documentation.

### CORE-COMPONENT-0004 amendment required (planner action)

The planner must amend **CORE-COMPONENT-0004 (Theming)** with:

**Rules section** — Add:
> Excalidraw (`@excalidraw/excalidraw`) MUST receive `theme="dark"` when app theme is `"dark"` and
> `theme="light"` when app theme is `"light"`.

**Integration Guidelines section** — Add:
> For Excalidraw: `dark` → `'dark'`, `light` → `'light'`. Note: unlike Mermaid, the light theme
> maps to `'light'` (not `'default'`).

**DECISION-LOG.md** — Add Decision #65:
> Map app theme `dark` to Excalidraw theme `'dark'` and app theme `light` to Excalidraw theme
> `'light'` — Source: CORE-COMPONENT-0004

---

## 7. Risk Areas and Edge Cases

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Bundle size** — `@excalidraw/excalidraw` is ~1.5 MB minified | Medium | `next/dynamic({ ssr: false })` lazy-loads only when an `.excalidraw` file is selected |
| **SSR crash** — Excalidraw uses `window`, `document`, canvas APIs not available server-side | High | `ssr: false` in `next/dynamic` prevents server execution entirely |
| **CSS conflicts** — Excalidraw's stylesheet uses broad selectors (`*`, `body`) | Medium | Import before Tailwind in `globals.css`; Tailwind utility classes win due to specificity |
| **Zero-height container** — Excalidraw silently renders nothing if parent height is 0 | High | `className="h-full w-full"` on wrapper div; flex parent provides `flex-1` height |
| **Invalid JSON** — Files may be truncated or hand-edited | Medium | `parseScene()` catches `JSON.parse` exceptions and validates `elements` array; shows inline error |
| **Missing `appState`** — Optional field; Excalidraw must gracefully handle `undefined` | Low | Excalidraw handles `undefined` appState; `parseScene()` only requires `elements` |
| **`files` field with large embedded images** — Could be expensive | Low | API enforces 1MB limit; canvas rendering is handled off-thread by Excalidraw |
| **Test environment** — jsdom has no canvas/WebGL | High | Mock `@excalidraw/excalidraw` and `next/dynamic` entirely in tests |
| **`next/dynamic` mock complexity** — `next/dynamic` is itself a wrapper | Medium | Mock `next/dynamic` to return a synchronous stub in the vitest environment |
| **Excalidraw scrollToContent** — May fight with `appState.scrollX/Y` from the file | Low | `scrollToContent: true` in `initialData` overrides saved scroll position |

---

## 8. Package Dependency

```json
"@excalidraw/excalidraw": "^0.17.6"
```

`@excalidraw/excalidraw` ships its own TypeScript declarations — no separate `@types/*` package
is required.

CSS import (in `src/app/globals.css`, before Tailwind):
```css
@import "@excalidraw/excalidraw/index.css";
```

---

## 9. Invariants — What Must Not Change

- All existing test sections (4a Markdown, 4b Diff, 4c Edit, 4d Mermaid) must pass unchanged
- Decision #58: Mermaid light theme mapping → `"default"` must not be altered
- `isBinaryFile()` must not include `excalidraw`
- Edit mode for `.excalidraw` files must use `EditView` (raw JSON textarea), not `ExcalidrawView`
- `showRaw` resets to `false` on file change (already covered by existing `useEffect` at line 305)
- The `CannotPreviewView` error path (HTTP errors) must remain unchanged
- `BinaryFileView` path for `isBinary: true` files must remain unchanged

---

*Research complete. Scope: `issue`. Ready for Plan stage.*
