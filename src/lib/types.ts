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

export type FileKind =
  | "regular-file"
  | "directory"
  | "symlink"
  | "broken-symlink"
  | "socket"
  | "fifo"
  | "block-device"
  | "character-device"
  | "permission-denied"
  | "unknown";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  kind: FileKind;
  children?: FileNode[];
  hasChildren?: boolean;
  childrenLoaded?: boolean;
  status?: "added" | "modified" | "deleted";
  size?: number;
  unreadable?: boolean;
  truncated?: boolean;
  truncatedReason?: "max-depth" | "entry-limit";
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

export interface Worktree {
  name: string; // Directory name under .trees/
  branch: string; // Git branch name (fallback: directory name)
}

export type CopilotCliState = "idle" | "running" | "waiting";

export interface WorktreeFileTreeState {
  selectedFile: string | null;
  expandedFolders: string[];
  fileTree: FileNode[];
  directoryLoadErrors?: Record<string, string>;
  loadedDirectories?: string[];
}

export interface PerProjectWorkspaceState {
  selectedFile: string | null;
  expandedFolders: string[];
  showFileViewer: boolean;
  showTerminal: boolean;
  fileTree: FileNode[];
  directoryLoadErrors?: Record<string, string>;
  loadedDirectories?: string[];
  activeWorktree?: string | null;
  worktreesSectionCollapsed?: boolean;
  copilotStatus?: CopilotCliState;
  worktreeFileTreeStates?: Record<string, WorktreeFileTreeState>;
}
