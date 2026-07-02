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

export type WorkspaceContextId = "root" | `wt_${string}`;

export type WorkspaceContextStatus =
  | "active"
  | "locked"
  | "prunable"
  | "missing"
  | "conflict"
  | "disabled"
  | "stale"
  | "unavailable"
  | "git-unavailable"
  | "repository-unavailable"
  | "error";

export interface WorkspaceContextChoice {
  id: WorkspaceContextId;
  label: string;
  kind: "root" | "worktree";
  status: WorkspaceContextStatus;
  available?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  branch?: string | null;
  repositoryLabel?: string;
  remoteLabel?: string;
  pathLabel?: string;
  summary?: string;
}

export interface WorkspaceContextResponse {
  root: WorkspaceContextChoice;
  choices: WorkspaceContextChoice[];
  repository?: {
    label?: string;
    remoteLabel?: string;
    status?: string;
    errorCode?: string;
    message?: string;
  };
  selectedContextId?: WorkspaceContextId | null;
  empty?: boolean;
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
  workspaceContext?: WorkspaceContextId | null;
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
  showExplorer?: boolean;
  showFileViewer: boolean;
  showTerminal: boolean;
  fileTree: FileNode[];
  directoryLoadErrors?: Record<string, string>;
  loadedDirectories?: string[];
  activeWorktree?: string | null;
  activeWorkspaceContextId?: WorkspaceContextId | null;
  worktreesSectionCollapsed?: boolean;
  copilotStatus?: CopilotCliState;
  worktreeFileTreeStates?: Record<string, WorktreeFileTreeState>;
}
