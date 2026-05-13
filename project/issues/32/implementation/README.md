# Implementation Notes: Issue #32

## Summary

Implemented the Issue #32 plan tasks T1-T6 within the existing ADR/core-component boundaries. No ADRs or core-components were created or modified.

## Plan/Test-Plan Coverage

- **T1 / TP type coverage:** Added exported `FileKind` taxonomy and extended `FileNode` with `kind`, `unreadable`, and optional truncation metadata.
- **T2 / TP1:** Removed hardcoded `IGNORED_DIRS`/`IGNORED_FILES` filtering from `GET /api/files`; hidden/config/dependency entries are listed.
- **T3 / TP2-TP4:** File tree listing now uses `lstat`/`stat` classification for regular files, directories, symlinks, broken symlinks, sockets, FIFOs, devices, permission-denied, and unknown entries. Unreadable directories remain visible and do not fail the whole tree. Max-depth truncation is explicit.
- **T4 / TP5-TP7:** `GET /api/files/content` classifies targets before `readFile`, rejects non-regular/unreadable targets with structured `{ error, code, kind }` JSON, and preserves regular text/binary/large-file behavior.
- **T5 / TP8-TP9:** `FileViewer` parses structured non-OK preview errors, logs contextual browser errors, and renders a friendly cannot-preview panel. `refreshFileTree()` remains save-success-only.
- **T6 / TP10:** `FileTree` keeps unreadable nodes visible, marks them with a warning affordance/title/accessible label, allows unreadable file-like selection, and prevents unreadable directories from expanding into nonexistent children.

## Tests Added/Updated

- Added `src/app/api/files/route.test.ts`.
- Extended `src/app/api/files/content/route.test.ts`.
- Extended `src/components/file-viewer.test.tsx`.
- Added `src/components/file-tree.test.tsx`.

## Verification Run During Implement

- `npm run test -- src/app/api/files/route.test.ts src/app/api/files/content/route.test.ts src/components/file-viewer.test.tsx src/components/file-tree.test.tsx` — passed (54 tests).
- `npm run format:check` — passed.
- `npm run lint` — passed with one pre-existing warning in `src/server/terminal-server.test.ts`.
- `npm run build` — passed with existing Next/Turbopack warnings.
- `npm run test` — passed.
