import {
  File,
  FileTs,
  FileJs,
  FileCss,
  FileHtml,
  FileDoc,
  FileMd,
  FileText,
  FileImage,
  GearSix,
  GitBranch,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";

export { getLanguageFromFilename, isBinaryFile } from "./file-utils";

type IconProps = {
  size?: number;
  className?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
};

const extensionMap: Record<string, ComponentType<IconProps>> = {
  ts: FileTs,
  tsx: FileTs,
  js: FileJs,
  jsx: FileJs,
  mjs: FileJs,
  mts: FileTs,
  css: FileCss,
  scss: FileCss,
  html: FileHtml,
  htm: FileHtml,
  md: FileMd,
  mdx: FileMd,
  json: FileText,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  ico: FileImage,
  doc: FileDoc,
  docx: FileDoc,
  pdf: FileDoc,
};

const nameMap: Record<string, ComponentType<IconProps>> = {
  ".gitignore": GitBranch,
  ".gitmodules": GitBranch,
  ".eslintrc": GearSix,
  ".prettierrc": GearSix,
  "tsconfig.json": GearSix,
  "next.config.ts": GearSix,
  "next.config.js": GearSix,
  "next.config.mjs": GearSix,
  "vitest.config.ts": GearSix,
  "postcss.config.mjs": GearSix,
};

export function getFileIcon(filename: string): ComponentType<IconProps> {
  if (nameMap[filename]) return nameMap[filename];
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return extensionMap[ext] ?? File;
}
