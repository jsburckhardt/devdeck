# Action Plan: feat(file-explorer): show all files like VS Code; catch unreadable files instead of hiding

## Feature
- **ID:** 32
- **Research Brief:** project/issues/32/research/00-research.md

## ADRs Created
None required. This issue stays within existing Next.js App Router, TypeScript, file API, and workspace-state architecture.

Relevant ADRs:
- ADR-0002 - Next.js + xterm.js + node-pty Tech Stack
- ADR-0003 - Project Registry & Persistence Strategy

## Core-Components Created
None required. Existing core-components cover the required behavior.

Relevant core-components:
- CORE-COMPONENT-0005 - Error Handling
- CORE-COMPONENT-0006 - Development Standards
- CORE-COMPONENT-0008 - Multi-Project Tabs and Workspace State

## Implementation Tasks

1. Extend file metadata types with a stable file-kind taxonomy.
2. Remove hardcoded file/directory hiding from `GET /api/files`.
3. Classify unreadable and non-regular entries during tree listing.
4. Guard `GET /api/files/content` before `readFile` and return structured preview errors.
5. Render friendly cannot-preview feedback in `FileViewer`.
6. Add required API and UI test coverage.

## Planned File Kind Taxonomy

Use the following stable `FileKind` values:

- `regular-file`
- `directory`
- `symlink`
- `broken-symlink`
- `socket`
- `fifo`
- `block-device`
- `character-device`
- `permission-denied`
- `unknown`

`FileNode` should support:

- `kind: FileKind`
- `unreadable?: boolean`
- optional explicit traversal metadata if needed, such as `truncated?: boolean` and `truncatedReason?: "max-depth" | "entry-limit"`

## Planned Structured Content API Errors

`GET /api/files/content` must return structured JSON per CORE-COMPONENT-0005.

Preview/read errors:

| Condition | Status | Code | Kind |
|---|---:|---|---|
| Missing slug/path | 400 | `MISSING_PARAMETERS` | omitted |
| Path traversal | 403 | `INVALID_PATH` | omitted |
| File not found | 404 | `FILE_NOT_FOUND` | `unknown` or `broken-symlink` when detectable |
| Permission denied | 403 | `PERMISSION_DENIED` | `permission-denied` |
| Directory selected | 415 | `NOT_REGULAR_FILE` | `directory` |
| Socket selected | 415 | `NOT_REGULAR_FILE` | `socket` |
| FIFO selected | 415 | `NOT_REGULAR_FILE` | `fifo` |
| Block device selected | 415 | `NOT_REGULAR_FILE` | `block-device` |
| Character device selected | 415 | `NOT_REGULAR_FILE` | `character-device` |
| Broken symlink | 422 | `BROKEN_SYMLINK` | `broken-symlink` |
| Other read failure | 500 | `READ_FAILED` | best-known kind |

Preview-specific errors should use a friendly `error` value such as `"Cannot preview file"` and may include `details` only when safe.

## Performance Risk Plan

Showing `.git`, `node_modules`, `.next`, and other previously hidden directories can greatly increase tree size.

Implementation must:
- Remove name-based hiding instead of replacing it with another hidden-list.
- Preserve explicit traversal bounds, such as the existing max-depth guard.
- Avoid silently hiding entries when traversal is intentionally stopped; expose a visible/typed marker such as `truncated`/`truncatedReason`.
- Avoid opening unreadable/non-regular entries during listing.
- Keep stat/classification work parallel where practical.
- Ensure unreadable directories are listed as nodes and are not recursively traversed.
