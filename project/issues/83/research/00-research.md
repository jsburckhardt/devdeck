# Research Brief - Issue #83: feat(file-viewer): render PNG files in the preview pane

## Issue Summary

When a PNG file is selected in the File Explorer, the File Viewer currently renders a generic "Binary files cannot be displayed" placeholder. The request is to display PNG images inline in the preview pane instead of the opaque-binary fallback.

## Scope Classification

**scope_type: issue**

This is a self-contained feature addition to an existing component panel. It requires no change to the application architecture, panel layout, workspace state model, or any decision already captured in ADRs or core-components. No new ADR or core-component document is required.

## Findings

### F1 - Binary classification (`src/lib/file-utils.ts:42-88`)

`binaryExtensions` is a flat `Set<string>` that groups truly opaque formats (`zip`, `exe`, `mp3`, ...) together with browser-renderable images (`png`, `jpg`, `jpeg`, `gif`, `bmp`, `webp`, `ico`, `svg`). The exported `isBinaryFile()` function returns `true` for all of them with no distinction. There is no "viewable image" concept today.

### F2 - Content API early-exit for binary files (`src/app/api/files/content/route.ts:155-165`)

When `isBinaryFile(filename)` is `true`, the `GET` handler short-circuits before reading any bytes and returns:

```json
{
  "content": "",
  "language": "binary",
  "size": 0,
  "isBinary": true,
  "path": "...",
  "name": "...",
  "mtime": 0
}
```

The file is never opened. The 1 MB guard (`MAX_FILE_SIZE`) does not apply to binary files today.

The `PUT` handler rejects binary files with HTTP 403. This guard must remain intact for image extensions regardless of the preview change.

### F3 - `FileContent` type (`src/lib/types.ts`)

`FileContent.language` is typed as `string`, so a new value such as `"image"` is forward-compatible with no interface change. No schema version bump is needed.

### F4 - FileViewer render branch (`src/components/file-viewer.tsx`)

The current render decision routes `fileContent.isBinary` to `BinaryFileView` before Markdown or code rendering. PNG lands in that branch and shows a `FileX` icon plus "Binary files cannot be displayed".

The edit-button guard is `!fileContent.isBinary`; keeping `isBinary: true` for images preserves the existing no-edit behavior without additional toolbar logic.

### F5 - Existing tests that will be affected

| Test | File | Impact |
|------|------|--------|
| `4.14 - edit button hidden for binary file` | `src/components/file-viewer.test.tsx` | Uses `image.png` as the generic-binary fixture; migrate it to a non-image binary such as `archive.zip` because PNG should no longer show "Binary file". |
| `3.3 - returns 403 for binary file` | `src/app/api/files/content/route.test.ts` | Uses `image.png` for the PUT 403 guard; should continue passing because `isBinaryFile("image.png")` should remain `true`. |

### F6 - No existing image-preview infrastructure

There is no `ImageView` component, no MIME-type resolver, and no base64 encoding path in the file-viewer stack today. These should be added with minimal surface area.

## Recommended Implementation Direction

### Change 1 - `src/lib/file-utils.ts`

Add pure helpers without modifying `isBinaryFile`:

- `isViewableImage(filename: string): boolean`
- `getImageMimeType(filename: string): string`

The viewable set should include at least `png`; it can also include browser-renderable formats already classified as binary (`jpg`, `jpeg`, `gif`, `webp`, `ico`, `svg`). `isBinaryFile` must continue returning `true` for these extensions so write guards remain unchanged.

### Change 2 - `src/app/api/files/content/route.ts`

Insert a viewable-image branch before the existing `isBinaryFile` early-exit:

- Reject oversized image previews with the existing file-size policy.
- Read the file as a Buffer.
- Convert bytes to base64.
- Return `content` as a data URL, `language: "image"`, and `isBinary: true`.

Using a data URL avoids a separate streaming endpoint and fits the current `FileContent` JSON contract.

### Change 3 - `src/components/file-viewer.tsx`

Add an `ImageView` sub-component near `BinaryFileView`, then insert a `fileContent.language === "image"` render branch before the generic binary fallback. The component should render an `<img>` centered in the preview pane with `max-h-full`, `max-w-full`, and `object-contain`.

No toolbar, save, Live Edit, or diff behavior should change.

### Change 4 - `src/lib/types.ts`

No change required.

## ADR / Core-Component Requirement

**No new ADR required.**

**No new core-component required.**

The image preview is an internal File Viewer behavior addition. CORE-COMPONENT-0007 (Shell Layout) and the existing ADRs are unaffected.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| PNG files over the preview size cap are rejected | Low | Return the existing structured oversized-file error so FileViewer can display the existing error state. |
| SVG with embedded script | Medium | Render via `<img>`, not `dangerouslySetInnerHTML`; scripts do not execute in SVG loaded through `<img>` in modern browsers. |
| Base64 data URL overhead | Low | Acceptable under the existing 1 MB preview cap. |
| Existing binary fixture test breaks | Low | Change the generic binary fixture to `archive.zip` and add image-specific tests. |

## Test Targets

### `src/lib/file-utils.test.ts`

- `isViewableImage` returns `true` for `image.png`, `photo.jpg`, `anim.gif`, `icon.webp`, `favicon.ico`, and `logo.svg`.
- `isViewableImage` returns `false` for `app.zip`, `binary.exe`, `video.mp4`, `index.ts`, and `README.md`.
- `isBinaryFile` still returns `true` for viewable image extensions.
- `getImageMimeType` maps `png`, `jpg`, `jpeg`, `gif`, `webp`, `ico`, and `svg`.
- `getImageMimeType` falls back to `"application/octet-stream"` for unknown extensions.

### `src/app/api/files/content/route.test.ts`

- GET `image.png` at or below the size cap returns 200 with `language: "image"`, `isBinary: true`, and a `data:image/png;base64,...` content value.
- GET `photo.jpg` at or below the size cap returns 200 with `language: "image"`, `isBinary: true`, and a `data:image/jpeg;base64,...` content value.
- GET oversized `image.png` returns 413 with `code: "FILE_TOO_LARGE"`.
- GET `logo.svg` at or below the size cap returns 200 with `language: "image"`, `isBinary: true`, and a `data:image/svg+xml;base64,...` content value.
- PUT `image.png` still returns 403.
- GET `archive.zip` still returns the opaque binary response with `language: "binary"`, `isBinary: true`, and empty content.

### `src/components/file-viewer.test.tsx`

- Update the existing generic-binary test fixture from `image.png` to `archive.zip`.
- PNG with `{ language: "image", isBinary: true, content: "data:image/png;base64,abc123" }` renders an `<img>` with matching `src` and `alt`.
- PNG does not show the edit button.
- PNG does not show the generic binary placeholder text.
- PNG with `activeWorktree` still fetches content with the `worktree` query parameter.

## File Reference Index

| File | Role in Change |
|------|----------------|
| `src/lib/file-utils.ts` | Add `isViewableImage()` and `getImageMimeType()`. |
| `src/lib/types.ts` | No change; `language: string` already accepts `"image"`. |
| `src/app/api/files/content/route.ts` | Add viewable-image branch before binary short-circuit. |
| `src/components/file-viewer.tsx` | Add `ImageView` and render `language === "image"` before `isBinary`. |
| `src/components/file-viewer.test.tsx` | Update binary fixture and add PNG render tests. |
| `src/app/api/files/content/route.test.ts` | Add image content API tests and preserve binary PUT behavior. |
