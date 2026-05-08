# Implementation Notes — Issue #14

## Enhanced File Viewer: Markdown Preview, Inline Diff, Edit & Save

### Summary

All tasks from the task breakdown have been implemented across three commits plus two fix commits addressing Copilot PR review feedback:

1. **Enhanced markdown preview** — hljs syntax highlighting in fenced code blocks, custom VS Code-style CSS for headings/lists/tables/code blocks, Raw/Preview toggle
2. **Inline diff view** — DiffView component, diff parser utility, GET /api/files/diff endpoint with untracked/staged file support, Changes/File tabs
3. **File editing** — PUT /api/files/content with atomic writes and strict mtime conflict detection, edit mode with Save/Discard and dirty tracking

### Key Implementation Decisions

- **Custom markdown CSS instead of `@tailwindcss/typography`**: The Tailwind v4 prose classes were non-functional (typography plugin not installed and incompatible). Replaced with a comprehensive `.markdown-preview` stylesheet in `globals.css` that mirrors VS Code's markdown preview styling.
- **`mtime` is required on `FileContent`**: Changed from optional to required after PR review — all GET/PUT handlers always provide it, and the editor relies on it for conflict detection.
- **Strict mtime comparison**: Uses `Math.floor` equality instead of 1000ms tolerance for conflict detection.
- **Git status-aware diff endpoint**: Detects untracked files (`git diff --no-index`), staged files (`git diff --cached`), and modified files (`git diff`) to produce correct diffs for all statuses.
- **Trailing newline handling**: Diff parser trims trailing newline before splitting to avoid bogus empty context lines.

### Files Created

| File | Purpose |
|------|---------|
| `src/lib/diff-parser.ts` | Unified diff parser utility |
| `src/lib/diff-parser.test.ts` | 9 unit tests |
| `src/components/diff-view.tsx` | DiffView component (named export) |
| `src/app/api/files/diff/route.ts` | GET /api/files/diff endpoint |
| `src/app/api/files/diff/route.test.ts` | 7 API tests |
| `src/app/api/files/content/route.test.ts` | 9 API tests (GET + PUT) |
| `src/components/file-viewer.test.tsx` | 17 component tests |

### Files Modified

| File | Changes |
|------|---------|
| `src/components/file-viewer.tsx` | Markdown enhancement, diff tabs, edit mode |
| `src/app/api/files/content/route.ts` | Added PUT handler, mtime on GET |
| `src/lib/types.ts` | Added DiffLine, DiffHunk, mtime (required) |
| `src/app/globals.css` | VS Code-style `.markdown-preview` CSS |
| `LLM.txt` | Documented new files |

### Verification Results

```
npm run lint        ✅ Pass (0 errors, 0 warnings)
npm run format:check ✅ Pass
npm run build       ✅ Pass
npm run test        ✅ Pass (141 tests, 17 files)
```

### PR Review Fixes (Copilot feedback)

All 7 review comments from Copilot addressed:
1. Diff parser trailing newline → `trimEnd()` before split
2. Untracked/staged file diffs → git status detection
3. Mtime tolerance → strict `Math.floor` comparison
4. `mtime` optional → required
5. LLM.txt duplicates → deduplicated
6. Plan doc file names → updated to match implementation
7. Markdown CSS → replaced broken prose classes with custom stylesheet
