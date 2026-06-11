# Test Plan: Issue #83 PNG preview support

## Test TP1: File utility image helper coverage

- **Type:** Unit
- **Task:** T1
- **Priority:** High

### Setup
- Add `src/lib/file-utils.test.ts`.

### Steps
1. Assert `isViewableImage` is true for `image.png`, `photo.jpg`, `photo.jpeg`, `anim.gif`, `icon.webp`, `favicon.ico`, and `logo.svg`.
2. Assert `isViewableImage` is false for `app.zip`, `binary.exe`, `video.mp4`, `index.ts`, and `README.md`.
3. Assert `isBinaryFile` remains true for all viewable image extensions.
4. Assert `getImageMimeType` maps each supported image extension correctly and falls back for unknown extensions.

### Expected Result
- Image helpers distinguish browser-renderable images from opaque binaries without changing binary classification.

## Test TP2: Content API returns image data URLs

- **Type:** Unit/API route
- **Task:** T2
- **Priority:** High

### Setup
- Mock filesystem APIs in `src/app/api/files/content/route.test.ts`.
- Use `Buffer.from(...)` for image bytes.

### Steps
1. GET `image.png`.
2. GET `photo.jpg`.
3. GET `logo.svg`.

### Expected Result
- Each response is HTTP 200 with `language: "image"`, `isBinary: true`, correct metadata, and a `data:<mime>;base64,...` content value.

## Test TP3: Content API preserves binary and size guards

- **Type:** Unit/API route
- **Task:** T2
- **Priority:** High

### Setup
- Mock file stats for oversized image and opaque binary files.

### Steps
1. GET an oversized `image.png`.
2. GET `archive.zip`.
3. PUT `image.png`.

### Expected Result
- Oversized PNG returns HTTP 413 with `code: "FILE_TOO_LARGE"`.
- ZIP returns the existing opaque binary response with empty content and `language: "binary"`.
- PUT `image.png` still returns HTTP 403.

## Test TP4: Content API worktree image read

- **Type:** Unit/API route
- **Task:** T2
- **Priority:** Medium

### Setup
- Mock `resolveProjectPath`, `fs.realpath`, `fs.lstat`, and `fs.readFile` for a valid `.trees/feat` worktree.

### Steps
1. GET `assets/image.png` with `worktree=.trees/feat`.
2. Inspect the path passed to `fs.lstat` and `fs.readFile`.

### Expected Result
- The image is read from the resolved worktree root, not from the project root.

## Test TP5: FileViewer renders PNG images

- **Type:** Component
- **Task:** T3
- **Priority:** High

### Setup
- Mock FileViewer content GET with `{ language: "image", isBinary: true, content: "data:image/png;base64,abc123" }`.

### Steps
1. Render `FileViewer` with `selectedFile: "image.png"`.
2. Query for the rendered image by accessible name.
3. Query for generic binary placeholder text and edit controls.

### Expected Result
- FileViewer renders an `<img>` with the data URL as `src`.
- The image has accessible alt text based on the file name.
- Generic binary placeholder and edit controls are absent.

## Test TP6: FileViewer preserves generic binary and worktree behavior

- **Type:** Component
- **Task:** T3, T4
- **Priority:** High

### Setup
- Use `archive.zip` as the generic binary fixture.
- Use `activeWorktree: ".trees/feat"` for worktree request coverage.

### Steps
1. Render `archive.zip` with `language: "binary"` and `isBinary: true`.
2. Render `image.png` with `activeWorktree`.
3. Inspect the content GET URL.

### Expected Result
- ZIP still shows the generic binary placeholder and hides edit controls.
- PNG content GET includes `worktree=.trees/feat`.

## Test TP7: Final harness verification

- **Type:** Verification
- **Task:** T5
- **Priority:** High

### Setup
- Complete implementation and targeted test fixes.

### Steps
1. Run `./harness verify`.

### Expected Result
- Harness returns a passing verdict for lint, format check, build, test, and smoke verification.
