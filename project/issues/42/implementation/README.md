# Implementation Notes — Issue #42

## Task 1: Add exclusion filtering to the API route

- **Status:** Complete
- **Files Changed:** `src/app/api/files/route.ts`
- **Tests Passed:** 255
- **Tests Failed:** 0

### Changes Summary

Added a module-level `EXCLUDED_NAMES` constant (`Set([".git"])`) to the API route. In `readDirectoryChildren()`, directory entries are now filtered through `EXCLUDED_NAMES` before classification, removing `.git` from all directory listings at any depth.

### Test Results

- All 12 tests in `src/app/api/files/route.test.ts` pass
- All 255 tests across the full suite pass
- `npm run lint` passes (0 errors, 2 pre-existing warnings in unrelated files)
- `npm run format:check` passes
- `npm run build` succeeds

---

## Task 2: Update API route tests

- **Status:** Complete
- **Files Changed:** `src/app/api/files/route.test.ts`
- **Tests Passed:** 255
- **Tests Failed:** 0

### Changes Summary

Replaced two tests that asserted all-files visibility (including `.git`) with tests that assert `.git` exclusion while preserving all other entries. Added a new test for nested `.git` exclusion.

- **Replaced:** "TP5 preserves all-files visibility in path-scoped requests" → "TP5 excludes .git from path-scoped directory results"
- **Replaced:** "TP1 includes hidden/config/dependency entries instead of filtering them" → "TP1 excludes .git from root results while preserving other entries"
- **Added:** "excludes .git at nested directory levels"

### Test Results

- All 12 tests in `src/app/api/files/route.test.ts` pass
- All 255 tests across the full suite pass
- `npm run lint`, `npm run format:check`, `npm run build` all pass

### Notes

Task 3 (documentation updates to CORE-COMPONENT-0008 and DECISION-LOG) was already completed by the planner.
