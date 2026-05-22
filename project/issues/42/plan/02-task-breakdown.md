# Task Breakdown — Issue #42

## Task 1: Add exclusion filtering to the API route

- **Status:** Complete
- **Complexity:** Low
- **Dependencies:** None
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0008

### Description

Add a server-side exclusion list to `src/app/api/files/route.ts` that filters out `.git` entries from all directory listings.

1. Add `const EXCLUDED_NAMES = new Set([".git"]);` as a module-level constant near the top of the file (after imports).
2. In `readDirectoryChildren()`, filter the `entries` array before the `Promise.all(entries.map(...))` call on line 122:
   ```typescript
   const filteredEntries = entries.filter((entry) => !EXCLUDED_NAMES.has(entry.name));
   ```
3. Replace `entries.map(...)` with `filteredEntries.map(...)` in the `Promise.all` call.

### Acceptance Criteria

- `.git` entries are excluded from all directory listings at any depth (root and subdirectories).
- Dotfiles (`.env`, `.devcontainer`), lockfiles (`package-lock.json`), `node_modules`, `.next`, and all other non-excluded entries remain visible.
- The `EXCLUDED_NAMES` constant is a `Set<string>` for O(1) lookup.
- No changes to `file-tree.tsx` or any client-side component.
- No query parameter override is implemented.

### Test Coverage

- Covered by Task 2 test updates.
- `npm run build` succeeds.
- `npm run lint` and `npm run format:check` pass.

---

## Task 2: Update API route tests

- **Status:** Complete
- **Complexity:** Medium
- **Dependencies:** Task 1
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0008

### Description

Update `src/app/api/files/route.test.ts` to replace the all-files-visibility assertions with the new exclusion-filtering behavior.

1. **Replace test "TP5 preserves all-files visibility in path-scoped requests" (line 188–219):**
   Replace with a new test `"TP5 excludes .git from path-scoped directory results"` that:
   - Mocks a subdirectory containing `.git`, `.next`, `node_modules`, `.env`, `package-lock.json`
   - Asserts `.git` is NOT in the response
   - Asserts `.next`, `node_modules`, `.env`, `package-lock.json` ARE in the response

2. **Replace test "TP1 includes hidden/config/dependency entries instead of filtering them" (line 221–249):**
   Replace with a new test `"TP1 excludes .git from root results while preserving other entries"` that:
   - Mocks root with `.devcontainer`, `.git`, `node_modules`, `package-lock.json`, `.env`, `src`
   - Asserts `.git` is NOT in the response
   - Asserts `.devcontainer`, `node_modules`, `package-lock.json`, `.env`, `src` ARE in the response

3. **Add a new test `"excludes .git at nested directory levels"`:**
   - Mocks a nested directory (e.g., `monorepo/sub-project`) containing `.git` and other entries
   - Asserts `.git` is excluded from the nested listing too

### Acceptance Criteria

- All three tests described above exist and pass.
- Existing tests TP1–TP4 (lazy loading, path scoping, traversal rejection, directory states) continue to pass unchanged.
- No test asserts that `.git` should be present in API responses.
- Full test suite passes: `npm run test`.

### Test Coverage

- Unit tests in `src/app/api/files/route.test.ts` directly validate the exclusion behavior.
- Regression: all pre-existing tests in the file continue to pass.
- `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test` all pass.

---

## Task 3: Update CORE-COMPONENT-0008 and DECISION-LOG

- **Status:** Complete (done by planner)
- **Complexity:** Low
- **Dependencies:** None
- **Related ADRs:** None
- **Related Core-Components:** CORE-COMPONENT-0008

### Description

Update CORE-COMPONENT-0008 to replace the all-files visibility mandate with a server-side default exclusion list rule, and update DECISION-LOG.md to supersede Decision #72 with Decision #73.

Changes made:
- CORE-COMPONENT-0008 line 56: Replaced all-files visibility mandate with server-side exclusion list rule.
- CORE-COMPONENT-0008 line 57: Updated hide-list prohibition to permit UX-motivated exclusion list.
- CORE-COMPONENT-0008 line 119: Updated lazy loading expectation to exempt exclusion-list entries.
- CORE-COMPONENT-0008 line 125: Updated rationale to explain why hide-list prohibition was superseded.
- CORE-COMPONENT-0008 line 229: Updated enforcement to require `.git` exclusion at all directory levels.
- DECISION-LOG.md: Decision #72 marked as superseded by #71.
- DECISION-LOG.md: Decision #73 added.

### Acceptance Criteria

- CORE-COMPONENT-0008 no longer mandates `.git` visibility.
- CORE-COMPONENT-0008 permits server-side exclusion list for UX improvement.
- Decision #72 is marked as superseded in DECISION-LOG.md.
- Decision #73 is recorded in DECISION-LOG.md.

### Test Coverage

- Manual review: verify document consistency.
