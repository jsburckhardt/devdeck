# Implementation Notes: Issue #35 Lazy File Tree Loading

## Summary

- Updated `GET /api/files` to return direct children only for root and `path=<relative-dir>` requests, with project-root path escape validation and structured errors.
- Added lazy directory metadata (`hasChildren`, `childrenLoaded`) while preserving all-files visibility, unreadable entries, non-regular classification, git status, and cache headers.
- Extended workspace state/types with lazy metadata plus per-directory loading/error state.
- Added `loadDirectoryChildren(path, explicitSlug?)`, slug/path request deduplication, stale project response guards, and immutable child merging.
- Updated `FileTree` to lazy-load readable unloaded directories on expansion and render scoped loading, empty, error, and retry states without blanking the explorer.
- Kept `WorkspaceLayout` initial root loading through `refreshFileTree(project.slug)` and spinner gating via `fileTreeLoading` only.

## Tests Run

- `npm run test -- src/app/api/files/route.test.ts --run` — passed.
- `npm run test -- src/lib/workspace-context.test.tsx --run` — passed.
- `npm run test -- src/components/file-tree.test.tsx --run` — passed.
- `npm run test -- src/components/workspace-layout.test.tsx --run` — passed.
- `npm run test -- --run` — passed.
- `npm run lint` — passed with one pre-existing warning in `src/server/terminal-server.test.ts`.
- `npm run format:check` — passed.
- `npm run build` — passed.
- `npx playwright test e2e/file-tree-lazy.spec.ts` — passed.

## E2E Coverage

Added `e2e/file-tree-lazy.spec.ts` with a deterministic fixture project at `e2e/fixtures/projects/lazy-large`. `playwright.config.ts` now points e2e servers at that fixture via `DEVDECK_PROJECTS_DIR`, avoiding any developer-specific `cal-mate` path. The regression authenticates with the configured token, opens the fixture project, asserts `.git`, `node_modules`, and `.next` root entries render within the root-render threshold, verifies the root response does not include deep descendants, verifies no path-scoped child request occurs before expansion, and confirms expanding `node_modules` uses `path=node_modules` and renders direct children.
