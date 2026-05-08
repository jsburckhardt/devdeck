# Action Plan: Enhanced File Viewer — Markdown Preview, Inline Diff, Edit & Save

## Feature
- **ID:** 14
- **Research Brief:** project/issues/14/research/00-research.md

## ADRs Created
None — all architectural decisions are already captured in ADR-0002, ADR-0003, and ADR-0004.

## Core-Components Created
None — no new cross-cutting concerns identified. Existing CC-0004 (Theming), CC-0005 (Error Handling), CC-0006 (Development Standards), and CC-0007 (Shell Layout) cover all patterns needed.

## Approach

This feature adds three capabilities to the existing `FileViewer` component:

1. **Enhanced Markdown Preview** — Wire `highlight.js` into `marked`'s code renderer for syntax-highlighted fenced code blocks; add GFM table and task-list styling; add a Raw/Preview toggle.
2. **Inline Diff View** — New `GET /api/files/diff` endpoint that runs `git diff` server-side; new `DiffView` component with unified diff parsing and colored line rendering; tab bar for switching between File and Changes views on modified files.
3. **File Editing** — New `PUT /api/files/content` endpoint with path traversal protection, atomic writes, mtime-based conflict detection (409), and 1MB limit; edit mode in the viewer with textarea, Save/Discard buttons, and dirty-state tracking.

### Key Design Decisions (within existing architecture)
- **File status lookup:** The viewer will look up the selected file's git status from the existing `fileTree` in workspace context (recursive search by path) rather than adding new state to the context. This avoids modifying the context interface.
- **Diff parsing:** A small utility (~50 lines) parses unified diff output. No external library needed.
- **Conflict detection:** The PUT endpoint returns the file's `mtime` on successful write; the client sends `If-Unmodified-Since` with the last known mtime. Stale writes return 409.
- **Error handling:** Save errors use Sonner toasts per CC-0005. Edited content is preserved on failure.
- **Styling:** Diff colors use CSS custom properties per CC-0004. GFM table styles use Tailwind prose extensions.

## Files to Create
| File | Purpose |
|------|---------|
| `src/lib/diff-parser.ts` | Unified diff parser utility |
| `src/lib/diff-parser.test.ts` | Unit tests for diff parser |
| `src/components/diff-view.tsx` | DiffView component |
| `src/components/diff-view.test.tsx` | Component tests for DiffView |
| `src/app/api/files/diff/route.ts` | GET /api/files/diff endpoint |
| `src/app/api/files/diff/route.test.ts` | API route tests for diff endpoint |
| `src/app/api/files/content/route.test.ts` | API route tests for GET and PUT |
| `src/components/file-viewer.test.tsx` | Component tests for enhanced file viewer |

## Files to Modify
| File | Changes |
|------|---------|
| `src/components/file-viewer.tsx` | Add marked hljs renderer, Raw/Preview toggle, Changes/File tabs, edit mode, DiffView integration |
| `src/app/api/files/content/route.ts` | Add PUT handler with atomic write, mtime conflict detection |
| `src/app/globals.css` | Add GFM table styles, diff line colors as CSS custom properties |
| `src/lib/types.ts` | Add `DiffLine`, `DiffHunk` types |
| `LLM.txt` | Document new components and API endpoints |

## Relevant ADRs
- **ADR-0002** — Tech stack: Next.js, Tailwind, vitest, hljs, marked (all already installed)
- **ADR-0004** — Token auth: PUT endpoint auto-protected by middleware

## Relevant Core-Components
- **CC-0004** — Theming: Use CSS custom properties for diff colors
- **CC-0005** — Error handling: Sonner toasts for save errors, error boundaries
- **CC-0006** — Development standards: Co-locate tests, ESLint + Prettier
- **CC-0007** — Shell layout: File viewer panel structure unchanged

## Implementation Tasks
1. Add diff types and file-status lookup helper
2. Enhance MarkdownView with hljs code blocks and GFM styling
3. Add Raw/Preview toggle to markdown files
4. Create unified diff parser utility
5. Create GET /api/files/diff endpoint
6. Create DiffView component
7. Add Changes/File tabs to file viewer header
8. Create PUT /api/files/content endpoint
9. Add edit mode to file viewer
10. Update LLM.txt with new components and endpoints

## Task Dependencies
```
Task 1 ──┬── Task 2 ── Task 3
         │
         ├── Task 4 ── Task 5 ── Task 6 ── Task 7
         │
         └── Task 8 ── Task 9
         
Task 10 (after all others)
```
