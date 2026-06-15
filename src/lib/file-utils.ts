const languageMap: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  mts: "typescript",
  css: "css",
  scss: "scss",
  html: "xml",
  htm: "xml",
  json: "json",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  rs: "rust",
  go: "go",
  rb: "ruby",
  java: "java",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  xml: "xml",
  sql: "sql",
  excalidraw: "excalidraw",
  graphql: "graphql",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

export function getLanguageFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  const ext = lower.split(".").pop() ?? "";
  return languageMap[ext] ?? "plaintext";
}

const binaryExtensions = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "ico",
  "svg",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "zip",
  "tar",
  "gz",
  "bz2",
  "7z",
  "rar",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "exe",
  "dll",
  "so",
  "dylib",
  "o",
  "a",
  "mp3",
  "mp4",
  "avi",
  "mov",
  "wav",
  "flac",
  "sqlite",
  "db",
]);

const viewableImageMimeTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isBinaryFile(filename: string): boolean {
  const ext = getExtension(filename);
  return binaryExtensions.has(ext);
}

export function isViewableImage(filename: string): boolean {
  return Object.prototype.hasOwnProperty.call(viewableImageMimeTypes, getExtension(filename));
}

export function getImageMimeType(filename: string): string {
  return viewableImageMimeTypes[getExtension(filename)] ?? "application/octet-stream";
}
