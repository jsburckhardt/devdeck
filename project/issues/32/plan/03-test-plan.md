# Test Plan: Issue #32

## Test TP1: File tree includes previously hidden entries

- **Type:** API unit test
- **Task:** T2
- **Priority:** High

### Setup
Create `src/app/api/files/route.test.ts` with mocked `resolveProjectPath`, `fs/promises`, and git status behavior.

### Steps
1. Mock project root resolution.
2. Mock `fs.readdir` at root to include `.devcontainer`, `.git`, `node_modules`, `package-lock.json`, `.env`, and `src`.
3. Call `GET /api/files?slug=test`.
4. Parse JSON response.

### Expected Result
The response includes all mocked entries. No entry is omitted because of a hardcoded ignore list.

---

## Test TP2: File tree classifies sockets and FIFOs

- **Type:** API unit test
- **Task:** T3
- **Priority:** High

### Setup
Mock directory entries and stat/lstat-like objects that report socket and FIFO kinds.

### Steps
1. Mock root `readdir` with `app.sock` and `pipe.fifo`.
2. Mock classification for socket and FIFO.
3. Call `GET /api/files?slug=test`.
4. Inspect returned nodes.

### Expected Result
Socket node has `unreadable: true`, `kind: "socket"`.
FIFO node has `unreadable: true`, `kind: "fifo"`.
Neither entry causes the route to throw.

---

## Test TP3: File tree retains unreadable directories

- **Type:** API unit test
- **Task:** T3
- **Priority:** High

### Setup
Mock a directory whose child `readdir` fails with permission denied.

### Steps
1. Mock root `readdir` with `restricted-dir`.
2. Mock directory classification as directory.
3. Mock recursive read failure with an `EACCES`/`EPERM` error.
4. Call `GET /api/files?slug=test`.

### Expected Result
The response includes `restricted-dir` as `type: "directory"`, `unreadable: true`, `kind: "permission-denied"`.
The full tree request still returns successfully.

---

## Test TP4: File tree classifies broken symlinks

- **Type:** API unit test
- **Task:** T3
- **Priority:** Medium

### Setup
Mock `lstat` to report a symlink and `stat` to fail with `ENOENT`.

### Steps
1. Mock root `readdir` with `missing-link`.
2. Mock symlink/broken-target behavior.
3. Call `GET /api/files?slug=test`.

### Expected Result
The node is present with `unreadable: true`, `kind: "broken-symlink"`.

---

## Test TP5: Content API rejects non-regular files before readFile

- **Type:** API unit test
- **Task:** T4
- **Priority:** High

### Setup
Extend `src/app/api/files/content/route.test.ts` with mocked filesystem classification.

### Steps
1. Mock a socket target.
2. Call `GET /api/files/content?slug=test&path=app.sock`.
3. Repeat for FIFO and directory targets.
4. Assert `fs.readFile` was not called.

### Expected Result
Each response uses status `415`, code `NOT_REGULAR_FILE`, and the matching `kind`.
`readFile` is not called.

---

## Test TP6: Content API returns permission and broken-symlink structured errors

- **Type:** API unit test
- **Task:** T4
- **Priority:** High

### Setup
Mock `lstat`/`stat` failures for permission denied and broken symlink.

### Steps
1. Call content GET for a permission-denied path.
2. Call content GET for a broken symlink.
3. Parse JSON responses.

### Expected Result
Permission denied returns status `403`, code `PERMISSION_DENIED`, kind `permission-denied`.
Broken symlink returns status `422`, code `BROKEN_SYMLINK`, kind `broken-symlink`.

---

## Test TP7: Regular text preview remains unchanged

- **Type:** API regression test
- **Task:** T4
- **Priority:** High

### Setup
Use existing `src/app/api/files/content/route.test.ts` success-path structure.

### Steps
1. Mock a regular text file.
2. Mock `readFile` returning text content.
3. Call content GET.
4. Parse response.

### Expected Result
Response status is `200`.
Response preserves existing `FileContent` fields:
- `content`
- `language`
- `size`
- `isBinary`
- `path`
- `name`
- `mtime`

---

## Test TP8: FileViewer renders friendly cannot-preview panel

- **Type:** React component test
- **Task:** T5
- **Priority:** High

### Setup
Extend `src/components/file-viewer.test.tsx`.

### Steps
1. Mock selected file.
2. Mock fetch response with status `415` and body `{ "error": "Cannot preview file", "code": "NOT_REGULAR_FILE", "kind": "socket" }`.
3. Render `FileViewer`.
4. Wait for loading to finish.

### Expected Result
The spinner clears.
A friendly cannot-preview message is rendered.
The message includes or reflects the unsupported kind.
The component does not crash.

---

## Test TP9: FileViewer handles permission denied preview errors

- **Type:** React component test
- **Task:** T5
- **Priority:** Medium

### Setup
Mock selected file and structured `PERMISSION_DENIED` response.

### Steps
1. Mock fetch response with status `403`.
2. Render `FileViewer`.
3. Wait for error panel.

### Expected Result
The viewer shows a user-friendly permission/cannot-preview message.
`refreshFileTree` is not called.

---

## Test TP10: FileTree preserves unreadable nodes

- **Type:** React component test
- **Task:** T6
- **Priority:** Medium

### Setup
Add or extend file-tree tests with mocked workspace context.

### Steps
1. Render a tree containing an unreadable file node.
2. Render a tree containing an unreadable directory node.
3. Interact with regular and unreadable nodes.

### Expected Result
Unreadable nodes are visible.
Unreadable file-like nodes can be selected for viewer feedback.
Unreadable directories do not crash or imply hidden children.
Regular node behavior remains unchanged.

---

## Test TP11: Full verification suite

- **Type:** Verification
- **Task:** T7
- **Priority:** High

### Setup
Run after implementation.

### Steps
1. Run `npm run lint`.
2. Run `npm run format:check`.
3. Run `npm run build`.
4. Run `npm run test`.

### Expected Result
All commands pass.
