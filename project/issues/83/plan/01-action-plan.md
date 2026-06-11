# Action Plan: Render PNG files in the preview pane

## Feature
- **ID:** 83
- **Research Brief:** `project/issues/83/research/00-research.md`

## ADRs Created
- None. Research classified this as issue-scoped behavior within the existing File Viewer.
- Relevant existing ADR: `ADR-0002` (Next.js App Router, TypeScript, Vitest, Tailwind).

## Core-Components Created
- None. Research concluded no new reusable cross-cutting behavior is required.
- Relevant existing core-components:
  - `CORE-COMPONENT-0006` — development standards, TypeScript, and test coverage.
  - `CORE-COMPONENT-0007` — Shell Layout preview pane remains inside the existing panel contract.
  - `CORE-COMPONENT-0008` — FileViewer and file APIs must preserve worktree-aware GET/PUT behavior.
  - `CORE-COMPONENT-0009` — use `./harness` as the preferred verification surface.

## Implementation Tasks
1. Add image classification helpers in `src/lib/file-utils.ts` without changing `isBinaryFile` behavior.
2. Add a viewable-image GET branch in `src/app/api/files/content/route.ts` before the existing opaque binary short-circuit.
3. Add an `ImageView` render path in `src/components/file-viewer.tsx` before the generic binary fallback.
4. Add and update unit/component tests for file utilities, content route behavior, and FileViewer rendering.
5. Run final implementation verification with `./harness verify`.

## Minimal Change Path
- Keep the current `FileContent` interface unchanged because `language: string` already supports `"image"`.
- Keep `isBinaryFile("image.png") === true` so edit/save guards and PUT binary rejection continue to apply.
- Return viewable image content as a base64 data URL with `language: "image"` and `isBinary: true`.
- Preserve non-viewable binary behavior, including empty content and `language: "binary"`.
- Preserve FileViewer worktree query behavior for content GET, diff GET, and save PUT.
