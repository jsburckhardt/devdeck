# Research Brief — Issue #14

## Enhanced File Viewer: Markdown Preview, Inline Diff, Edit & Save

**Scope Type:** issue
**Issue:** #14
**Date:** 2026-05-07

---

## 1. Problem Analysis

The file viewer (`src/components/file-viewer.tsx`) is currently read-only with basic markdown rendering. Three gaps exist:

1. **Markdown preview lacks syntax highlighting** in fenced code blocks and proper GFM table styling
2. **No diff view** for files with `status: "modified"` despite git status already being tracked
3. **No file editing** — users must leave DevDeck to make changes

## 2. Current Implementation

### File Viewer Component (`src/components/file-viewer.tsx`)
- **199 lines**, uses `useWorkspace()` for project/file context
- Sub-components: `CodeView` (hljs highlighting + line numbers), `MarkdownView` (marked + DOMPurify), `BinaryFileView`
- Header bar: 36px (`h-9`), shows file path + language + size
- Uses `framer-motion` `AnimatePresence` for transitions
- hljs registered for 10 languages: typescript, javascript, css, json, xml, markdown, bash, yaml, python, sql

### MarkdownView (lines 72-84)
- `marked.parse()` with `{ gfm: true, breaks: false }`
- HTML sanitized via `DOMPurify.sanitize()`
- Tailwind prose classes for styling, but no hljs integration for fenced code blocks
- Code blocks render as plain `<pre>` — no syntax highlighting

### API Routes
- **GET `/api/files/content`** (`src/app/api/files/content/route.ts`, 74 lines): Returns `FileContent` with path traversal protection, 1MB limit, binary detection
- **GET `/api/files`** (`src/app/api/files/route.ts`, 157 lines): Returns `FileNode[]` tree with git status (added/modified/deleted)
- No PUT endpoint exists for writing files
- No diff endpoint exists

### Types (`src/lib/types.ts`)
- `FileContent`: `{ content, language, size, isBinary, path, name }`
- `FileNode`: `{ name, path, type, children?, status?, size? }`

### Workspace Context (`src/lib/workspace-context.tsx`)
- Provides `project`, `selectedFile`, `fileTree`, panel toggles
- No concept of "file git status" at the viewer level — status lives in `FileNode` from the tree

### File Utils (`src/lib/file-utils.ts`)
- `getLanguageFromFilename()`: Maps extensions to hljs language names
- `isBinaryFile()`: Checks binary extensions

## 3. Technical Findings

### Dependencies (already installed)
- `marked@^18.0.3` — Markdown parser, GFM enabled
- `highlight.js@^11.11.1` — Syntax highlighting (10 languages registered)
- `dompurify@^3.4.2` — HTML sanitization
- `@phosphor-icons/react` — Icon library
- `framer-motion` — Animation
- `sonner` — Toast notifications (for error handling per CORE-COMPONENT-0005)

### Missing Dependencies
- None needed. Diff parsing is simple enough (~50 lines) to implement as a utility.

### Existing UI Patterns
- No shadcn/ui directory exists — components use raw Tailwind classes
- Buttons use inline Tailwind (no shared Button component)
- No tabs component exists in the codebase
- Header bar pattern: `h-9 border-b bg-card/50 px-3` (file-viewer.tsx:172)

### Test Infrastructure
- vitest with jsdom default environment
- 13 existing test files co-located with source
- API route tests use `// @vitest-environment node` pragma
- Setup file at `src/test/setup.ts`
- No existing tests for file-viewer.tsx or file API routes

### Verification Commands (`.github/soft-factory/verification.yml`)
- `npm run lint`, `npm run format:check`, `npm run build`, `npm run test`

## 4. Architecture Alignment

| Concern | ADR/CC | Impact |
|---------|--------|--------|
| Tech stack | ADR-0002 | All dependencies already included; no new packages needed |
| Auth | ADR-0004 | PUT endpoint auto-protected by Next.js middleware |
| Error handling | CC-0005 | Save errors → Sonner toasts; preserve edited content on failure |
| Shell layout | CC-0007 | File viewer panel unchanged; new buttons in existing header bar |
| Theming | CC-0004 | Use CSS custom properties for diff colors |
| Dev standards | CC-0006 | Co-locate tests; ESLint + Prettier compliance |

## 5. Scope Classification

**Scope Type: issue** — This is a feature enhancement within established architectural boundaries.

**No new ADRs needed** — The tech stack, auth, and error handling patterns are already decided.

**No new core-components needed** — The file editing pattern is specific to the file viewer, not a cross-cutting concern.

## 6. Recommendations for Plan Stage

### Task Decomposition (suggested)
1. **Enhance MarkdownView** — Configure marked renderer to use hljs for fenced code blocks; add GFM table CSS; add Raw/Preview toggle
2. **Create diff API** — `GET /api/files/diff?slug=...&path=...` running `git diff`
3. **Create DiffView component** — Parse unified diff, render with colored lines and line numbers
4. **Add Changes/File tabs** — Tab bar in file viewer header for modified files
5. **Create PUT endpoint** — `PUT /api/files/content` with path traversal protection, atomic writes, 1MB limit, mtime-based conflict detection
6. **Add edit mode** — Textarea, Save/Discard buttons, dirty state tracking
7. **Tests** — Unit tests for diff parser, API route tests, component tests
8. **Update LLM.txt** — Document new components and API endpoints

### Key Design Decisions for Planner
- Tab bar (Changes/File) should only appear when file has `status: "modified"`
- Edit button should be in the existing header bar, not a new bar
- Diff view should use a simple unified diff parser (not a library)
- File status needs to be passed from the file tree to the file viewer (currently not available in context)
- The workspace context may need a `fileStatus` field or the viewer can look up status from the file tree

### Risks
- The workspace context doesn't currently expose per-file git status to the viewer — need to either add it to context or have the viewer look it up from `fileTree`
- The textarea approach for editing may feel basic — but it matches the issue's spec and avoids heavy editor dependencies
