import { describe, expect, it } from "vitest";
import { getImageMimeType, isBinaryFile, isViewableImage } from "@/lib/file-utils";

const viewableImageFilenames = [
  "image.png",
  "photo.jpg",
  "photo.jpeg",
  "anim.gif",
  "icon.webp",
  "favicon.ico",
  "logo.svg",
];

describe("file-utils image helpers", () => {
  it.each(viewableImageFilenames)("identifies %s as a viewable image", (filename) => {
    expect(isViewableImage(filename)).toBe(true);
  });

  it.each(["app.zip", "binary.exe", "video.mp4", "index.ts", "README.md"])(
    "does not identify %s as a viewable image",
    (filename) => {
      expect(isViewableImage(filename)).toBe(false);
    },
  );

  it.each(viewableImageFilenames)("keeps %s classified as binary", (filename) => {
    expect(isBinaryFile(filename)).toBe(true);
  });

  it.each([
    ["image.png", "image/png"],
    ["photo.jpg", "image/jpeg"],
    ["photo.jpeg", "image/jpeg"],
    ["anim.gif", "image/gif"],
    ["icon.webp", "image/webp"],
    ["favicon.ico", "image/x-icon"],
    ["logo.svg", "image/svg+xml"],
    ["unknown.bmp", "application/octet-stream"],
  ])("maps %s to %s", (filename, mimeType) => {
    expect(getImageMimeType(filename)).toBe(mimeType);
  });
});
