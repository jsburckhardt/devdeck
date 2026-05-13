# Research Brief: feat(file-explorer): show all files like VS Code; catch unreadable files instead of hiding

## GitHub Issue
- **Issue:** #32
- **Title:** feat(file-explorer): show all files like VS Code; catch unreadable files instead of hiding
- **URL:** https://github.com/jsburckhardt/devdeck/issues/32
- **Issue source:** `gh issue view` was attempted first but GitHub auth returned HTTP 401; this brief uses the issue details supplied by the coordinator prompt.

## Scope Classification
- **Scope Type:** issue
- **Rationale:** This is a focused feature/fix in the existing file explorer and file preview flows. It changes endpoint behavior, UI handling, types, and tests within existing architectural boundaries. It does not introduce a new technology choice, persistence model, or reusable cross-cutting behavior beyond the already-adopted error-handling and development-standard contracts.

## Problem Statement

The current file explorer hides legitimate project entries before they reach the UI. `src/app/api/files/route.ts` filters entries with `IGNORED_DIRS` and `IGNORED_FILES`, including `.git`, `.devcontainer`, `node_modules`, `.next`, `package-lock.json`, and other files/directories that VS Code/Codespaces would show. This prevents users from inspecting real workspace contents.

Removing those filters exposes another bug class: non-regular filesystem entries such as sockets, FIFOs, device files, permission-denied paths, or broken symlinks can be listed or selected. The current `/api/files/content` route calls `fs.stat()` and then `fs.readFile()` without checking that the target is a regular file, so FIFO/socket-style paths can fail poorly or hang the preview. API errors are also not consistently structured with `code` fields, and `FileViewer` discards structured error bodies by throwing a generic status-text error.

The desired behavior is:
- Show filesystem entries like VS Code/Codespaces, including hidden/config/dependency directories and lockfiles.
- Classify non-regular or unreadable entries during file-tree listing with `unreadable: true` and a `kind` string.
- Make `/api/files/content` reject unreadable/non-regular/read-failure paths with structured JSON errors such as `{ error: "Cannot preview file", code: "UNREADABLE_FILE", kind: "socket" }` or a permission-denied equivalent.
- Make `FileViewer` show a friendly cannot-preview panel instead of crashing, hanging, or showing a forever spinner.
- Keep regular text-file listing and preview behavior unchanged.

## Existing Context

### Documentation and architecture reviewed

- `docs/README.md` identifies DevDeck as a Next.js App Router + React + TypeScript application with API routes and a file explorer/editor experience.
- `project/README.md`, `project/architecture/README.md`, and `project/issues/README.md` define RPIV artifact placement and confirm ADRs/core-components are global while issue research stays under `project/issues/<issue>/research/`.
- `project/architecture/ADR/DECISION-LOG.md` lists current ADRs and core-components. No existing decision specifically hides filesystem entries from the explorer.
- `ADR-0002` adopts Next.js App Router, TypeScript strict mode, npm, Vitest, and the current UI stack.
- `ADR-0003` requires file APIs to resolve project roots through async `resolveProjectPath(slug)` and keep resolved paths server-side.
- `ADR-0004` covers route authentication through middleware and does not require special handling for this issue.
- `CORE-COMPONENT-0005 Error Handling` is directly relevant: API errors must return structured JSON `{ error: string, code: string, details?: unknown }`, user-facing errors must be clear, and browser errors should be logged with context.
- `CORE-COMPONENT-0006 Development Standards` requires strict TypeScript, co-located `*.test.ts(x)` tests, and verification through lint, format, build, and test.
- `CORE-COMPONENT-0007 Shell Layout` keeps file explorer and file viewer panels isolated with error boundaries.
- `CORE-COMPONENT-0008 Multi-Project Tabs and Workspace State` governs `refreshFileTree()` and file-tree loading state. This issue should not change refresh semantics unless implementation uncovers a direct conflict.
- `.github/soft-factory/verification.yml` defines verifier commands: `npm run lint`, `npm run format:check`, `npm run build`, `npm run test`.

### Source code findings

#### File tree API: `src/app/api/files/route.ts`

- `IGNORED_DIRS` and `IGNORED_FILES` currently hide `.git`, `node_modules`, `.next`, `.devcontainer`, `package-lock.json`, and other legitimate entries (`route.ts:11-24`).
- `readDirectory()` calls `fs.readdir(dirPath, { withFileTypes: true })`, filters ignored names (`route.ts:61-65`), then splits entries into `entry.isDirectory()` and non-directories (`route.ts:69-71`).
- Directories recurse immediately via `readDirectory()` (`route.ts:74-86`). If a directory is unreadable, the current behavior can fail the whole tree request rather than preserving an unreadable node.
- Non-directory entries are all emitted as `{ type: "file" }`; `fs.stat()` failures are swallowed as `null`, producing size `0` without an explicit unreadable marker (`route.ts:88-107`).
- The list route returns unstructured errors for missing slug, project-not-found, and read failures (`route.ts:133-155`), which does not fully satisfy CORE-COMPONENT-0005.
- There is no co-located `src/app/api/files/route.test.ts`, so list behavior currently lacks direct unit coverage.

#### File content API: `src/app/api/files/content/route.ts`

- `GET` validates `slug` and `path`, resolves the project root, and prevents path traversal (`route.ts:12-28`). Error bodies here lack `code` fields.
- The route calls `fs.stat(fullPath)` and then checks binary extension and file size before `fs.readFile(fullPath, "utf-8")` (`route.ts:30-70`). It does not check `stat.isFile()` or classify non-regular file kinds before reading.
- The catch-all read failure response is `{ error: "Failed to read file", details: String(error) }` with status 500 (`route.ts:71-75`), but issue #32 needs structured, file-preview-specific errors with stable `code` and optional `kind`.
- `PUT` already has some structured conflict behavior (`code: "CONFLICT"`) but most validation and write errors are still unstructured. Issue #32 primarily concerns preview/read behavior; planner may decide whether to normalize touched PUT errors separately.
- Existing `content/route.test.ts` covers one successful GET and several PUT paths, but not non-regular entries, permission-denied reads, or structured preview errors.

#### File viewer UI: `src/components/file-viewer.tsx`

- `FileViewer` fetches `/api/files/content?slug=...&path=...` when `selectedFile` changes (`file-viewer.tsx:271-306`).
- On non-OK responses, it throws `new Error(`Failed to load file: ${res.statusText}`)` without parsing JSON error bodies (`file-viewer.tsx:286-289`). This loses `code`, `kind`, and user-friendly API messages.
- The component sets `loading` false in its catch block and renders a generic destructive error panel (`file-viewer.tsx:296-300`, `419-426`). The panel is functional for fast HTTP failures but not tailored to unreadable/non-previewable filesystem entries.
- `FileViewer` already looks up the selected file in `fileTree` to derive git status (`file-viewer.tsx:84-96`, `254-257`), so a similar lookup could expose `unreadable`/`kind` metadata if planner wants a pre-fetch UX. The server-side content rejection is still required.
- Save success currently calls `refreshFileTree()` only after `toast.success("File saved")` (`file-viewer.tsx:393-395`) in line with CORE-COMPONENT-0008; this issue should preserve that success-only refresh behavior.
- Existing `file-viewer.test.tsx` has extensive coverage for markdown preview, diff tabs, binary files, edit/save, and refresh-after-save behavior, but no coverage for structured content-load errors or unreadable-file panels.

#### File tree UI and types

- `src/lib/types.ts` defines `FileNode` with `type: "file" | "directory"`, optional `children`, `status`, and `size`; it has no `unreadable` or `kind` fields (`types.ts:26-33`).
- `src/components/file-tree.tsx` treats every non-directory node as selectable and calls `selectFile(node.path)` (`file-tree.tsx:94-101`). It currently has no visual affordance for unreadable nodes, but can still route selection to `FileViewer` for a cannot-preview panel.
- `FileNodeIcon` chooses folder icons for directories and file icons for all other nodes (`file-tree.tsx:13-40`). Planner may decide whether unreadable nodes need a warning/disabled affordance or simply metadata plus preview-panel feedback.
- `src/lib/workspace-context.tsx` stores `fileTree: FileNode[]` and refreshes it via `GET /api/files?slug=...` with `{ cache: "no-store" }` (`workspace-context.tsx:195-210`). Any `FileNode` type extension must remain serializable because `PerProjectWorkspaceState` caches `fileTree` in memory.

### Related previous issue research

- Issue #14 introduced the current enhanced `FileViewer`, diff API, edit/save route, and tests. It classified similar file-viewer work as `issue` and found no ADR/core-component need.
- Issue #27 added/recorded the `refreshFileTree()` contract now captured in CORE-COMPONENT-0008. Issue #32 should avoid changing that contract unless required.
- Issue #7 identified file-tree traversal as a performance-sensitive path and recommended parallel `fs.stat()` calls, which are now present for file entries. Classification of extra entries should preserve this performance consideration.

## Proposed ADRs

- **ADRs required:** No.
- **Proposed ADR titles:** None.

This issue does not choose a new framework, dependency, storage strategy, authentication model, or other durable architectural constraint. It implements a feature/bug fix within ADR-0002, ADR-0003, and ADR-0004.

## Proposed Core-Components

- **Core-components required:** No.
- **Proposed core-component titles:** None.

The required behavior is covered by existing core-components:
- Use CORE-COMPONENT-0005 for structured API errors, contextual browser logging, and clear user-facing feedback.
- Use CORE-COMPONENT-0006 for strict TypeScript and co-located Vitest coverage.
- Preserve CORE-COMPONENT-0008 refresh semantics; do not add tree-refresh coupling for read/preview failures.

No new reusable cross-cutting behavior is needed. If planning discovers that all file-preview APIs need a broader reusable error contract beyond CORE-COMPONENT-0005, that would require returning to the Plan stage for a core-component amendment, but current issue evidence does not require it.

## Risks and Open Questions

1. **Non-regular kind taxonomy:** Planner should specify stable `kind` strings. Candidate values from Node `Stats`/`Dirent` classification include `socket`, `fifo`, `block-device`, `character-device`, `directory`, `symlink`, `broken-symlink`, `permission-denied`, and `unknown`.
2. **`stat` vs `lstat` behavior:** `fs.stat()` follows symlinks, while `fs.lstat()` can identify symlinks and broken links. The list route likely needs `lstat()`/`stat()` error-aware classification so broken symlinks are listed as unreadable instead of disappearing or collapsing into a generic stat failure.
3. **Avoiding FIFO/socket hangs:** The content route must determine regular-file status before `readFile()`. Tests should guard against regressions where FIFO/socket paths are opened.
4. **Unreadable directories:** If a directory exists but cannot be read, the tree should likely include it as `type: "directory"`, `unreadable: true`, `kind: "permission-denied"`, and avoid recursion. Planner should make this explicit.
5. **API status codes:** Planner should choose status codes for `UNREADABLE_FILE`, `PERMISSION_DENIED`, `NOT_REGULAR_FILE`, and read failures. Likely candidates are 403 for permission denied and 415 or 422 for not-previewable/non-regular paths; consistency matters more than the exact code.
6. **UI source of truth:** `FileViewer` can either rely solely on structured `/api/files/content` errors or pre-detect unreadable nodes by looking up the selected path in `fileTree`. Server rejection is mandatory either way.
7. **Large-tree performance:** Showing previously ignored `node_modules` and `.git` can greatly increase tree size. Existing `maxDepth = 6` limits recursion, but planner should confirm acceptable performance and whether any depth/entry-count guard is still needed without hiding entries.
8. **Test fixtures:** Socket/FIFO/permission tests should be deterministic and must not hang. Prefer mocked `fs/promises` route tests where possible; if filesystem fixtures are needed, create and clean them in a project-local test fixture path rather than relying on `/tmp`.
9. **Existing error responses:** Touched routes should align with CORE-COMPONENT-0005 structured errors. Planner should decide whether to normalize only issue-relevant content/list errors or all validation errors in these routes.
10. **Git status and special entries:** `git status --porcelain -u` returns regular path strings; unreadable/non-regular nodes should still carry status when available without allowing git-status lookup failures to hide them.

### Suggested Plan-Stage Test Coverage

- `src/app/api/files/route.test.ts` (new): confirms `.devcontainer/`, `.git/`, `node_modules/`, lockfiles, and dotfiles are included rather than filtered.
- List route tests: classify socket/FIFO/device/broken-symlink or mocked equivalents with `unreadable: true` and `kind`.
- List route tests: unreadable directories are retained as nodes without failing the whole tree.
- `src/app/api/files/content/route.test.ts`: structured errors for socket, FIFO, permission denied, broken symlink/read failure, and non-file targets.
- Content route regression: regular text files still return the existing `FileContent` shape unchanged.
- `src/components/file-viewer.test.tsx`: non-OK structured JSON from content API renders a friendly cannot-preview panel, clears the spinner, and logs/contextualizes errors as required.
- `src/components/file-tree.test.tsx` or existing tree coverage: unreadable nodes remain visible/selectable or visibly marked according to the plan decision.
