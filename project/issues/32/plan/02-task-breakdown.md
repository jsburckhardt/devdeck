# Task Breakdown: Issue #32

## Task T1: Extend file metadata types and taxonomy

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** None
- **Related ADRs:** ADR-0002, ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008

### Description
Extend `src/lib/types.ts` so file-tree nodes can represent filesystem entries beyond regular files and directories.

Add a stable exported `FileKind` union:

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

Extend `FileNode` with:
- `kind: FileKind`
- `unreadable?: boolean`
- optional explicit traversal metadata, if needed: `truncated?: boolean`, `truncatedReason?: "max-depth" | "entry-limit"`

### Acceptance Criteria
- `FileNode` remains serializable for in-memory workspace state.
- Existing `type: "file" | "directory"` behavior remains compatible.
- Regular text files can still be represented without unreadable metadata.
- Unreadable/non-regular entries can be represented with `unreadable: true` and a stable `kind`.

### Test Coverage
- Type-level coverage through affected route/component tests.
- Existing TypeScript build must pass with strict mode.
- Any new helper that maps filesystem stats/errors to `FileKind` must have unit coverage or route-test coverage.

---

## Task T2: Remove hardcoded hiding from file tree listing

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1
- **Related ADRs:** ADR-0002, ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008

### Description
Update `src/app/api/files/route.ts` so `GET /api/files` no longer filters entries using hardcoded ignored directory/file sets.

The route must include root entries such as:
- `.devcontainer`
- `.git`
- `node_modules`
- `package-lock.json`
- dotfiles/config files

### Acceptance Criteria
- Remove or bypass `IGNORED_DIRS` and `IGNORED_FILES`.
- Root listing reflects filesystem visibility similar to `ls -la`.
- Git status lookup failures must not hide entries.
- Existing project-root resolution via `resolveProjectPath(slug)` remains unchanged.
- Listing route errors should use structured `{ error, code, details? }` responses where touched.

### Test Coverage
- Add `src/app/api/files/route.test.ts`.
- Test that hidden/config/dependency entries are included.
- Test that `package-lock.json` and dotfiles are not filtered.
- Test missing slug and project-not-found structured errors where route behavior is touched.

---

## Task T3: Classify unreadable and non-regular entries in file tree listing

- **Status:** Planned
- **Complexity:** Large
- **Dependencies:** T1, T2
- **Related ADRs:** ADR-0002, ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008

### Description
Update listing traversal in `src/app/api/files/route.ts` to classify entries using `lstat`/`stat` as appropriate.

Required behavior:
- Regular files: `type: "file"`, `kind: "regular-file"`, readable metadata.
- Directories: `type: "directory"`, `kind: "directory"`, recurse only when readable and within traversal bounds.
- Permission denied: retain node with `unreadable: true`, `kind: "permission-denied"`.
- Broken symlinks: retain node with `unreadable: true`, `kind: "broken-symlink"`.
- Sockets/FIFOs/devices: retain node with `unreadable: true` and the appropriate kind.
- Unknown stat/read errors: retain node with `unreadable: true`, `kind: "unknown"` when safe.

### Acceptance Criteria
- Non-regular entries are visible instead of dropped.
- Unreadable directories do not fail the entire tree request.
- Unreadable directories are not recursively traversed.
- Traversal bounds are explicit; if descendants are omitted due to max depth or entry budget, the node is marked with explicit truncation metadata rather than silently hidden.
- Classification avoids opening FIFOs/sockets/devices.

### Test Coverage
- Route tests classify mocked sockets with `unreadable: true`, `kind: "socket"`.
- Route tests classify mocked FIFOs with `kind: "fifo"`.
- Route tests classify permission-denied entries/directories with `kind: "permission-denied"`.
- Route tests classify broken symlinks with `kind: "broken-symlink"`.
- Route tests confirm unreadable directories remain visible and do not fail the full tree.

---

## Task T4: Guard content reads and return structured preview errors

- **Status:** Planned
- **Complexity:** Large
- **Dependencies:** T1
- **Related ADRs:** ADR-0002, ADR-0003
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006

### Description
Update `src/app/api/files/content/route.ts` so `GET` classifies the target before calling `readFile`.

Use `lstat`/`stat` to prevent reads for:
- directory
- socket
- FIFO
- block device
- character device
- broken symlink
- permission-denied path

Return structured JSON errors.

### Acceptance Criteria
- `readFile` is never called for known non-regular entries.
- Socket/FIFO/device/directory responses use status `415`, code `NOT_REGULAR_FILE`, and the correct `kind`.
- Permission denied uses status `403`, code `PERMISSION_DENIED`, kind `permission-denied`.
- Broken symlink uses status `422`, code `BROKEN_SYMLINK`, kind `broken-symlink`.
- Unexpected read failure uses status `500`, code `READ_FAILED`.
- Regular text-file behavior and response shape remain unchanged.
- Binary and too-large file behavior remains unchanged after the regular-file guard.

### Test Coverage
- Extend `src/app/api/files/content/route.test.ts`.
- Test socket structured error and assert `fs.readFile` is not called.
- Test FIFO structured error and assert `fs.readFile` is not called.
- Test permission-denied structured error.
- Test directory structured error.
- Test broken-symlink/read-failure structured error.
- Regression test: regular text file returns existing `FileContent` shape unchanged.

---

## Task T5: Render friendly cannot-preview state in FileViewer

- **Status:** Planned
- **Complexity:** Medium
- **Dependencies:** T1, T4
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006, CORE-COMPONENT-0008

### Description
Update `src/components/file-viewer.tsx` so non-OK content responses parse structured JSON before rendering an error.

Render a friendly cannot-preview panel for structured preview errors, including file kind when available.

### Acceptance Criteria
- `FileViewer` parses `{ error, code, kind, details? }` from non-OK responses.
- Cannot-preview panel clears the spinner.
- Panel message is user-friendly and does not expose unsafe internals.
- Browser console logging includes contextual information per CORE-COMPONENT-0005.
- Save behavior remains unchanged.
- `refreshFileTree()` remains success-save-only per CORE-COMPONENT-0008.

### Test Coverage
- Extend `src/components/file-viewer.test.tsx`.
- Test structured `NOT_REGULAR_FILE` response renders a friendly cannot-preview panel.
- Test structured `PERMISSION_DENIED` response renders a friendly message.
- Test failed preview does not call `refreshFileTree`.
- Existing save-success/failure refresh tests must continue passing.

---

## Task T6: Add file-tree UI affordance for unreadable nodes

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T1, T3
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0005, CORE-COMPONENT-0006

### Description
Update `src/components/file-tree.tsx` to visibly preserve unreadable nodes.

Unreadable file-like nodes may remain selectable so `FileViewer` can show the cannot-preview panel. Unreadable directories should be visible, should not imply children are available, and should expose a clear title/label.

### Acceptance Criteria
- Unreadable nodes remain visible in the tree.
- Unreadable nodes show a warning-style affordance or accessible title.
- Unreadable directories do not expand into nonexistent children.
- Existing regular file/directory selection behavior remains unchanged.

### Test Coverage
- Add or extend file-tree component tests.
- Test unreadable file node renders visibly and remains selectable.
- Test unreadable directory renders visibly without crashing.
- Test regular node rendering remains unchanged.

---

## Task T7: Run verification commands

- **Status:** Planned
- **Complexity:** Small
- **Dependencies:** T1, T2, T3, T4, T5, T6
- **Related ADRs:** ADR-0002
- **Related Core-Components:** CORE-COMPONENT-0006

### Description
Run the project verification suite after implementation.

Required commands:
- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm run test`

### Acceptance Criteria
- All verification commands pass.
- No source-code implementation diverges from the plan.
- No ADR/core-component changes are introduced unless a new global constraint is discovered and documented through the Plan stage.

### Test Coverage
- Full Vitest suite passes.
- Build and lint confirm strict TypeScript and project standards.
