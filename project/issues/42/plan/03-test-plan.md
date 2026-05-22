# Test Plan — Issue #42

## Test TP-42-1: API excludes `.git` from root directory listing

- **Type:** Unit
- **Task:** Task 1, Task 2
- **Priority:** High

### Setup
- Mock `resolveProjectPath` to return `/workspaces/test-project`.
- Mock `fs.readdir` for root to return: `.devcontainer`, `.git`, `node_modules`, `package-lock.json`, `.env`, `src`.
- Mock `fs.lstat` to classify `package-lock.json` and `.env` as files, all others as directories.
- Mock `fs.readdir` for subdirectories to return `[]` (empty).

### Steps
1. Call `GET /api/files?slug=test`.
2. Parse the JSON response.
3. Extract the `name` field from each returned node.

### Expected Result
- Response status is 200.
- `.git` is NOT in the returned names.
- `.devcontainer`, `node_modules`, `src`, `.env`, `package-lock.json` ARE in the returned names.

---

## Test TP-42-2: API excludes `.git` from subdirectory listings

- **Type:** Unit
- **Task:** Task 1, Task 2
- **Priority:** High

### Setup
- Mock `resolveProjectPath` to return `/workspaces/test-project`.
- Mock `fs.stat` for `config` directory to return directory stat.
- Mock `fs.readdir` for `/workspaces/test-project/config` to return: `.git`, `.next`, `node_modules`, `.env`, `package-lock.json`.
- Mock `fs.lstat` to classify `.env` and `package-lock.json` as files, others as directories.
- Mock `fs.readdir` for subdirectories to return `[]`.

### Steps
1. Call `GET /api/files?slug=test&path=config`.
2. Parse the JSON response.
3. Extract the `name` field from each returned node.

### Expected Result
- Response status is 200.
- `.git` is NOT in the returned names.
- `.next`, `node_modules`, `.env`, `package-lock.json` ARE in the returned names.

---

## Test TP-42-3: API preserves non-excluded dotfiles and dependency directories

- **Type:** Unit
- **Task:** Task 1, Task 2
- **Priority:** High

### Setup
- Mock root directory containing `.env`, `.devcontainer`, `node_modules`, `.next`, `package-lock.json`, `src`.
- No `.git` entry present.

### Steps
1. Call `GET /api/files?slug=test`.
2. Parse the JSON response.

### Expected Result
- All entries (`.env`, `.devcontainer`, `node_modules`, `.next`, `package-lock.json`, `src`) are present in the response.
- No entries are unexpectedly filtered.

---

## Test TP-42-4: Existing tests for lazy loading, path scoping, traversal rejection, and directory states pass unchanged

- **Type:** Regression
- **Task:** Task 1, Task 2
- **Priority:** High

### Setup
- No additional setup — run existing test suite.

### Steps
1. Run `npm run test -- src/app/api/files/route.test.ts`.

### Expected Result
- Tests TP1 (root direct children with lazy metadata), TP2 (path-scoped direct children), TP3 (traversal/escape/non-directory rejection), TP4 (lazy metadata for non-empty/empty/unreadable directories) all pass.
- Tests for socket/FIFO classification, broken symlinks, readable symlinks, and structured errors all pass.

---

## Test TP-42-5: Lint, format, build, and full test suite pass

- **Type:** Integration
- **Task:** Task 1, Task 2
- **Priority:** High

### Setup
- No additional setup.

### Steps
1. Run `npm run lint`.
2. Run `npm run format:check`.
3. Run `npm run build`.
4. Run `npm run test`.

### Expected Result
- All four commands exit with code 0.
- No new lint warnings or errors introduced.
- No formatting violations.
- Build succeeds without type errors.
- All tests pass.
