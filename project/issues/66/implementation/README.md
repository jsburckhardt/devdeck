# Implementation Notes: Issue #66

## Task T1: Update CodeView scroll-row and code-block layout

- **Status:** Complete
- **Files Changed:** `src/components/file-viewer.tsx`
- **Tests Passed:** 1 targeted suite
- **Tests Failed:** 0 targeted suites

### Changes Summary

- Preserved the existing outer `overflow-auto` scroll container for `CodeView`.
- Added `min-w-max` to the inner gutter/code flex row so the row can size to code content and scroll horizontally.
- Replaced the shrinkable `<pre className="flex-1 px-4">` contract with `flex-shrink-0 whitespace-pre px-4`.

### Test Results

- `npm test -- src/components/file-viewer.test.tsx` passed: 73 tests passed.

### Notes

- No ADR or core-component changes were required.

## Task T2: Add gutter line-count and layout-contract tests

- **Status:** Complete
- **Files Changed:** `src/components/file-viewer.test.tsx`
- **Tests Passed:** 73 targeted tests
- **Tests Failed:** 0 targeted tests

### Changes Summary

- Added FileViewer tests for multi-line logical gutter entries.
- Added a long-line layout-contract test asserting `overflow-auto`, `min-w-max`, `flex-shrink-0`, `whitespace-pre`, and absence of `flex-1`.
- Added empty-content and single-line-content tests asserting one-line gutter behavior.

### Test Results

- `npm test -- src/components/file-viewer.test.tsx` passed: 73 tests passed.

### Notes

- Tests query DOM structure and class names only; no jsdom pixel/layout assertions were added.

## Task T3: Verify the FileViewer fix

- **Status:** Complete
- **Files Changed:** `project/issues/66/implementation/README.md`
- **Tests Passed:** 6 verification commands passed
- **Tests Failed:** 0 verification commands failed

### Changes Summary

- Ran targeted and standard verification commands from the test plan.

### Test Results

- Passed: `npm test -- src/components/file-viewer.test.tsx` — 73 tests passed.
- Passed: `npm run lint` — completed with 0 errors and 1 pre-existing warning in `src/server/terminal-server.test.ts`.
- Passed: `npm run format:check` — all matched files use Prettier style.
- Passed: `npm run build` — production build completed successfully after local dependencies were installed for this worktree.
- Passed: `npm test` — full Vitest suite completed successfully with 501 tests passed.
- Passed: configured smoke check — Next start responded with HTTP 200 on port 9999.

### Notes

- A plain `npm ci` was blocked in this environment because Python's standard library module `shlex` is unavailable, which prevents `node-pty` native rebuild. For build validation in this worktree, dependencies were installed with `npm ci --ignore-scripts` so Next resolves from the worktree-local `node_modules`.
