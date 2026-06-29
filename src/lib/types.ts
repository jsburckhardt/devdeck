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

export type RepoUrlStatus =
  | "available"
  | "no-origin"
  | "not-git"
  | "git-unavailable"
  | "unavailable"
  | "invalid";

export interface ProjectDetailResponse {
  slug: string;
  name: string;
  description?: string;
  language?: string;
  available: boolean;
  repoUrl: string | null;
  repoUrlDisplay: string | null;
  repoUrlStatus: RepoUrlStatus;
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

export interface FileTreeSyncScope {
  slug: string;
  worktree: string | null;
}

export type FileTreeSyncStatus =
  | "connecting"
  | "ready"
  | "syncing"
  | "degraded"
  | "error"
  | "unauthorized";

export interface FileTreeSyncError {
  code: string;
  message: string;
  retryable: boolean;
  fatal?: boolean;
  retryAfterMs?: number;
  pollIntervalMs?: number;
}

export interface FileTreeReadyEvent {
  type: "file-tree:ready";
  scope: FileTreeSyncScope;
  pollIntervalMs: number;
}

export interface FileTreeChangedEvent {
  type: "file-tree:changed";
  scope: FileTreeSyncScope;
  paths: string[];
  directories: string[];
  rootChanged: boolean;
  gitStatusChanged: boolean;
  truncated: boolean;
  version: number;
}

export interface FileTreeDegradedEvent {
  type: "file-tree:degraded";
  scope: FileTreeSyncScope;
  code: string;
  message: string;
  retryAfterMs?: number;
  pollIntervalMs: number;
  fatal?: boolean;
}

export type FileTreeSyncEvent = FileTreeReadyEvent | FileTreeChangedEvent | FileTreeDegradedEvent;

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

export type WorktreeListStatus =
  | "available"
  | "not-git"
  | "git-unavailable"
  | "project-unavailable"
  | "error";

export type WorktreeSummaryState = "available" | "detached" | "locked" | "prunable" | "missing";

export interface WorktreeRootSummary {
  id: null;
  name: "Project root";
  active: boolean;
}

export interface WorktreeSummary {
  id: string;
  name: string;
  branch: string | null;
  head: string | null;
  state: WorktreeSummaryState;
  active: boolean;
  repoRelativeLabel: string | null;
}

export interface WorktreeListResponse {
  projectSlug: string;
  status: WorktreeListStatus;
  root: WorktreeRootSummary;
  worktrees: WorktreeSummary[];
}

export type Worktree = WorktreeSummary;

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
  showExplorer?: boolean;
  showFileViewer: boolean;
  showTerminal: boolean;
  fileTree: FileNode[];
  directoryLoadErrors?: Record<string, string>;
  loadedDirectories?: string[];
  activeWorktreeId?: string | null;
  activeWorktree?: string | null;
  worktreesSectionCollapsed?: boolean;
  copilotStatus?: CopilotCliState;
  worktreeFileTreeStates?: Record<string, WorktreeFileTreeState>;
}
