# Task Breakdown: Issue #83 PNG preview support

## Task T1: Add viewable image helpers

- **Status:** Pending
- **Complexity:** Small
- **Dependencies:** None
- **Related ADRs:** `ADR-0002`
- **Related Core-Components:** `CORE-COMPONENT-0006`, `CORE-COMPONENT-0009`

### Description
Add pure helpers to `src/lib/file-utils.ts`:

- `isViewableImage(filename: string): boolean`
- `getImageMimeType(filename: string): string`

Support PNG plus common browser-renderable image formats already classified as binary (`jpg`, `jpeg`, `gif`, `webp`, `ico`, `svg`). Do not remove these extensions from `binaryExtensions` and do not change `isBinaryFile` semantics.

### Acceptance Criteria
- `isViewableImage("image.png")` returns `true`.
- `isViewableImage` returns `true` for `jpg`, `jpeg`, `gif`, `webp`, `ico`, and `svg` filenames.
- `isViewableImage` returns `false` for opaque binaries (`zip`, `exe`, `mp4`) and text files (`ts`, `md`).
- `getImageMimeType` maps supported extensions to correct MIME types, including `image/png` and `image/svg+xml`.
- `getImageMimeType` falls back to `application/octet-stream` for unknown extensions.
- Existing `isBinaryFile` results remain unchanged for image extensions.

### Test Coverage
- Add `src/lib/file-utils.test.ts`.
- Cover positive and negative `isViewableImage` cases.
- Cover all supported `getImageMimeType` mappings and fallback behavior.
- Cover `isBinaryFile` still returning `true` for viewable image extensions.

## Task T2: Return base64 data URLs for viewable images from the content API

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** T1
- **Related ADRs:** `ADR-0002`
- **Related Core-Components:** `CORE-COMPONENT-0006`, `CORE-COMPONENT-0008`, `CORE-COMPONENT-0009`

### Description
Update `src/app/api/files/content/route.ts` to import the new helpers and add a viewable-image branch before the current `isBinaryFile(filename)` short-circuit. The branch should enforce the preview size cap, read bytes as a `Buffer`, encode them to base64, and return a data URL in the existing `FileContent` JSON shape.

### Acceptance Criteria
- Viewable image GET requests resolve the project or active worktree root exactly as current content GET requests do.
- The viewable-image branch runs before the opaque binary branch.
- A PNG at or below the 1 MB cap returns HTTP 200 with:
  - `content: "data:image/png;base64,..."`
  - `language: "image"`
  - `isBinary: true`
  - existing `path`, `name`, `size`, and `mtime` fields.
- Supported non-PNG images use their mapped MIME type in the data URL.
- Oversized image previews return HTTP 413 with `code: "FILE_TOO_LARGE"`.
- Non-viewable binary files such as `archive.zip` still return the opaque binary response.
- `PUT /api/files/content` continues to reject `image.png` with HTTP 403 because `isBinaryFile` remains true.

### Test Coverage
- Update `src/app/api/files/content/route.test.ts`.
- Add GET tests for PNG, JPG, and SVG data URL responses.
- Add an oversized PNG test that expects HTTP 413 and `FILE_TOO_LARGE`.
- Add a ZIP GET test proving opaque binary fallback still returns empty content and `language: "binary"`.
- Keep or strengthen the existing PUT `image.png` 403 test.
- Add or preserve worktree-root coverage for image GET behavior.

## Task T3: Render image content in FileViewer

- **Status:** Pending
- **Complexity:** Medium
- **Dependencies:** T2
- **Related ADRs:** `ADR-0002`
- **Related Core-Components:** `CORE-COMPONENT-0006`, `CORE-COMPONENT-0007`, `CORE-COMPONENT-0008`, `CORE-COMPONENT-0009`

### Description
Add an `ImageView` sub-component in `src/components/file-viewer.tsx` near `BinaryFileView`. It should render an `<img>` centered in the preview pane with constrained sizing (`max-h-full`, `max-w-full`, `object-contain`). Insert a `fileContent.language === "image"` render branch before the existing `fileContent.isBinary` fallback.

### Acceptance Criteria
- `language === "image"` renders an `<img>` using `fileContent.content` as `src`.
- The image `alt` text includes the file name.
- The image branch runs before the generic binary fallback even when `isBinary: true`.
- PNG previews do not show "Binary files cannot be displayed".
- PNG previews do not show Edit, Live Edit, or Edit in Preview controls.
- Markdown, Excalidraw, code, diff, and generic binary render branches preserve current behavior.
- FileViewer continues appending `worktree=<activeWorktree>` to content GET requests when active.

### Test Coverage
- Update `src/components/file-viewer.test.tsx`.
- Add a PNG render test asserting image `src` and accessible name.
- Add assertions that PNG hides edit controls and generic binary placeholder text.
- Update the existing generic binary fixture from `image.png` to `archive.zip`.
- Preserve existing worktree query tests and add image-specific coverage if needed.

## Task T4: Consolidate regression tests for editing, binary guards, and worktree behavior

- **Status:** Pending
- **Complexity:** Small
- **Dependencies:** T2, T3
- **Related ADRs:** `ADR-0002`
- **Related Core-Components:** `CORE-COMPONENT-0006`, `CORE-COMPONENT-0008`, `CORE-COMPONENT-0009`

### Description
Review affected tests after implementation to ensure PNG preview support does not weaken existing edit/save/binary guards or worktree-aware request behavior.

### Acceptance Criteria
- Existing text-file edit and save tests still pass.
- Save success still calls `refreshFileTree()` exactly once.
- Save failure paths still do not call `refreshFileTree()`.
- Binary PUT guard tests still reject PNG.
- Content GET and FileViewer tests continue to cover active worktree behavior.
- Supported targeted checks can be run through `./harness test`; raw Vitest may only be used for diagnosis if the harness is insufficient.

### Test Coverage
- Run the affected test files through the project test command surface:
  - `src/lib/file-utils.test.ts`
  - `src/app/api/files/content/route.test.ts`
  - `src/components/file-viewer.test.tsx`
- Confirm the full suite remains covered by final `./harness verify`.

## Task T5: Verify the completed implementation

- **Status:** Pending
- **Complexity:** Small
- **Dependencies:** T1, T2, T3, T4
- **Related ADRs:** `ADR-0002`
- **Related Core-Components:** `CORE-COMPONENT-0006`, `CORE-COMPONENT-0009`

### Description
Run repository verification after implementation is complete.

### Acceptance Criteria
- `./harness verify` completes successfully.
- Verification includes lint, format check, build, test, and smoke steps per the harness contract.
- Any harness failure is fixed before claiming implementation complete.
- No application source behavior outside the planned FileViewer/content API/file-utils surface is changed.

### Test Coverage
- `./harness verify` is the required final verification command.
- If targeted diagnostics are needed before final verification, prefer `./harness test`, `./harness lint`, and `./harness build`.
