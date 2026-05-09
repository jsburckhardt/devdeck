export interface Project {
  slug: string;
  name: string;
  description: string;
  language?: string;
  lastModified?: string;
  path: string;
  source: "auto" | "manual";
  available?: boolean;
}

export interface ProjectRegistryEntry {
  slug: string;
  path: string;
  source: "auto" | "manual";
  hidden?: boolean;
  name?: string;
  description?: string;
}

export interface ProjectRegistry {
  version: 1;
  projects: ProjectRegistryEntry[];
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  status?: "added" | "modified" | "deleted";
  size?: number;
}

export interface FileContent {
  content: string;
  language: string;
  size: number;
  isBinary: boolean;
  path: string;
  name: string;
  mtime: number;
}

export interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
  oldStart: number;
  newStart: number;
}

export interface PerProjectWorkspaceState {
  selectedFile: string | null;
  expandedFolders: string[];
  showFileViewer: boolean;
  showTerminal: boolean;
  fileTree: FileNode[];
}
