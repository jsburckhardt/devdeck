"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  FileNode,
  FileTreeChangedEvent,
  FileTreeSyncError,
  FileTreeSyncScope,
  FileTreeSyncStatus,
  PerProjectWorkspaceState,
  Project,
  WorktreeFileTreeState,
} from "./types";
import { useOpenProjects } from "./open-projects-context";

interface WorkspaceState {
  project: Project | null;
  selectedFile: string | null;
  expandedFolders: Set<string>;
  showExplorer: boolean;
  showFileViewer: boolean;
  showTerminal: boolean;
  fileTree: FileNode[];
  fileTreeLoading: boolean;
  fileTreeError: string | null;
  directoryLoading: Set<string>;
  directoryErrors: Map<string, string>;
  activeWorktree: string | null;
  worktreesSectionCollapsed: boolean;
  fileTreeSyncStatus: FileTreeSyncStatus;
  fileTreeSyncError: FileTreeSyncError | null;
  fileTreeSyncFallbackActive: boolean;
  fileTreeSyncRetryNonce: number;
}

interface WorkspaceContextValue extends WorkspaceState {
  setProject: (project: Project) => void;
  selectFile: (path: string | null) => void;
  toggleFolder: (path: string) => void;
  toggleExplorer: () => void;
  toggleFileViewer: () => void;
  toggleTerminal: () => void;
  setFileTree: (tree: FileNode[]) => void;
  setFileTreeLoading: (loading: boolean) => void;
  refreshFileTree: (explicitSlug?: string) => Promise<void>;
  loadDirectoryChildren: (path: string, explicitSlug?: string) => Promise<void>;
  fileTreeRefreshing: boolean;
  setActiveWorktree: (name: string | null) => void;
  toggleWorktreesSection: () => void;
  retryFileTreeSync: () => void;
  refreshFileTreeScope: (scope: FileTreeSyncScope) => Promise<void>;
  invalidateFileTreeScope: (event: FileTreeChangedEvent) => Promise<void>;
  updateFileTreeSyncState: (status: FileTreeSyncStatus, error?: FileTreeSyncError | null) => void;
  setFileTreeSyncFallbackActive: (active: boolean) => void;
}

const ROOT_REQUEST_PATH = "";
const ROOT_SCOPE_KEY = "__project-root__";
const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

interface WorkspaceProviderProps {
  slug?: string;
  children: React.ReactNode;
}

function scopeKey(activeWorktree: string | null | undefined): string {
  return activeWorktree ?? ROOT_SCOPE_KEY;
}

function requestKey(slug: string, activeWorktree: string | null, relativePath: string): string {
  return `${slug}:${activeWorktree ?? "root"}:${relativePath}`;
}

function apiFileTreeUrl(slug: string, relativePath: string, activeWorktree: string | null): string {
  const params = new URLSearchParams({ slug });
  if (relativePath) params.set("path", relativePath);
  if (activeWorktree) params.set("worktree", activeWorktree);
  return `/api/files?${params.toString()}`;
}

function collectLoadedDirectories(nodes: FileNode[]): string[] {
  const loaded: string[] = [];
  for (const node of nodes) {
    if (node.type === "directory") {
      if (node.childrenLoaded || Array.isArray(node.children)) {
        loaded.push(node.path);
      }
      if (node.children) {
        loaded.push(...collectLoadedDirectories(node.children));
      }
    }
  }
  return loaded;
}

function mergeRootTrees(nextRoot: FileNode[], previousRoot: FileNode[]): FileNode[] {
  const previousByPath = new Map(previousRoot.map((node) => [node.path, node]));
  return nextRoot.map((node) => {
    const previous = previousByPath.get(node.path);
    if (
      node.type === "directory" &&
      previous?.type === "directory" &&
      previous.childrenLoaded &&
      node.hasChildren !== false
    ) {
      const wasEmpty = previous.children?.length === 0;
      const nowHasChildren = node.hasChildren === true;
      if (wasEmpty && nowHasChildren) {
        return node;
      }
      return {
        ...node,
        children: previous.children,
        hasChildren: previous.hasChildren ?? node.hasChildren,
        childrenLoaded: true,
      };
    }
    return node;
  });
}

function mergeDirectoryChildren(
  nodes: FileNode[],
  directoryPath: string,
  children: FileNode[],
): FileNode[] {
  return nodes.map((node) => {
    if (node.path === directoryPath && node.type === "directory") {
      return {
        ...node,
        children,
        hasChildren: children.length > 0,
        childrenLoaded: true,
      };
    }

    if (node.children) {
      return { ...node, children: mergeDirectoryChildren(node.children, directoryPath, children) };
    }

    return node;
  });
}

function findNodeByPath(nodes: FileNode[], targetPath: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (node.children) {
      const nested = findNodeByPath(node.children, targetPath);
      if (nested) return nested;
    }
  }
  return null;
}

function directListingProvesMissing(
  directoryPath: string,
  children: FileNode[],
  selectedPath: string | null,
): boolean {
  if (!selectedPath) return false;
  if (directoryPath) {
    if (selectedPath !== directoryPath && !selectedPath.startsWith(`${directoryPath}/`)) {
      return false;
    }
  }

  const relativePath = directoryPath ? selectedPath.slice(directoryPath.length + 1) : selectedPath;
  if (!relativePath || relativePath.startsWith("../")) return false;

  const [firstSegment] = relativePath.split("/");
  const expectedChildPath = directoryPath ? `${directoryPath}/${firstSegment}` : firstSegment;
  return !children.some((child) => child.path === expectedChildPath);
}

function eventParentDirectories(event: FileTreeChangedEvent): Set<string> {
  const directories = new Set(event.directories);
  for (const changedPath of event.paths) {
    const parent = changedPath.includes("/")
      ? changedPath.slice(0, changedPath.lastIndexOf("/"))
      : "";
    directories.add(parent);
    if (changedPath && directories.has(changedPath)) {
      directories.add(changedPath);
    }
  }
  return directories;
}

function responseErrorMessage(response: Response): string {
  return `HTTP ${response.status}`;
}

function normalizeCachedWorkspaceState(
  cachedState: PerProjectWorkspaceState | undefined,
): PerProjectWorkspaceState | undefined {
  if (!cachedState) return undefined;

  const showExplorer = cachedState.showExplorer ?? true;
  if (!showExplorer && !cachedState.showFileViewer && !cachedState.showTerminal) {
    return {
      ...cachedState,
      showExplorer: false,
      showFileViewer: false,
      showTerminal: true,
    };
  }

  return cachedState;
}

function scopedStateFromCache(
  cachedState: PerProjectWorkspaceState | undefined,
): Map<string, WorktreeFileTreeState> {
  const states = new Map<string, WorktreeFileTreeState>();
  if (!cachedState) return states;

  for (const [key, value] of Object.entries(cachedState.worktreeFileTreeStates ?? {})) {
    states.set(key, value);
  }

  states.set(scopeKey(cachedState.activeWorktree), {
    selectedFile: cachedState.selectedFile,
    expandedFolders: cachedState.expandedFolders,
    fileTree: cachedState.fileTree,
    directoryLoadErrors: cachedState.directoryLoadErrors ?? {},
    loadedDirectories:
      cachedState.loadedDirectories ?? collectLoadedDirectories(cachedState.fileTree),
  });

  return states;
}

export function WorkspaceProvider({ slug, children }: WorkspaceProviderProps) {
  const { saveWorkspaceState, restoreWorkspaceState } = useOpenProjects();
  const cachedStateRef = useRef(
    normalizeCachedWorkspaceState(slug ? restoreWorkspaceState(slug) : undefined),
  );
  const scopedStatesRef = useRef<Map<string, WorktreeFileTreeState>>(
    scopedStateFromCache(cachedStateRef.current),
  );

  const [, setRestoredFromCache] = useState(() => !!cachedStateRef.current);
  const [project, setProjectState] = useState<Project | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(
    cachedStateRef.current?.selectedFile ?? null,
  );
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(cachedStateRef.current?.expandedFolders ?? []),
  );
  const [showExplorer, setShowExplorer] = useState(cachedStateRef.current?.showExplorer ?? true);
  const [showFileViewer, setShowFileViewer] = useState(
    cachedStateRef.current?.showFileViewer ?? true,
  );
  const [showTerminal, setShowTerminal] = useState(cachedStateRef.current?.showTerminal ?? true);
  const [fileTree, setFileTreeState] = useState<FileNode[]>(cachedStateRef.current?.fileTree ?? []);
  const [fileTreeLoading, setFileTreeLoadingState] = useState(false);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const [fileTreeRefreshing, setFileTreeRefreshing] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState<Set<string>>(() => new Set());
  const [directoryErrors, setDirectoryErrors] = useState<Map<string, string>>(
    () => new Map(Object.entries(cachedStateRef.current?.directoryLoadErrors ?? {})),
  );
  const [activeWorktree, setActiveWorktreeState] = useState<string | null>(
    cachedStateRef.current?.activeWorktree ?? null,
  );
  const [worktreesSectionCollapsed, setWorktreesSectionCollapsed] = useState(
    cachedStateRef.current?.worktreesSectionCollapsed ?? false,
  );
  const [fileTreeSyncStatus, setFileTreeSyncStatusState] =
    useState<FileTreeSyncStatus>("connecting");
  const [fileTreeSyncError, setFileTreeSyncError] = useState<FileTreeSyncError | null>(null);
  const [fileTreeSyncFallbackActive, setFileTreeSyncFallbackActiveState] = useState(false);
  const [fileTreeSyncRetryNonce, setFileTreeSyncRetryNonce] = useState(0);

  const currentSlugRef = useRef<string | undefined>(slug);
  const currentWorktreeRef = useRef<string | null>(cachedStateRef.current?.activeWorktree ?? null);
  const rootRefreshCountRef = useRef(0);
  const inFlightFileTreeRequests = useRef<Map<string, Promise<void>>>(new Map());
  const invalidationGenerationRef = useRef(0);

  useEffect(() => {
    currentSlugRef.current = project?.slug ?? slug;
  }, [project?.slug, slug]);

  const stateRef = useRef({
    selectedFile,
    expandedFolders,
    showExplorer,
    showFileViewer,
    showTerminal,
    fileTree,
    directoryErrors,
    activeWorktree,
    worktreesSectionCollapsed,
    fileTreeSyncStatus,
    fileTreeSyncError,
    fileTreeSyncFallbackActive,
    fileTreeSyncRetryNonce,
  });

  useEffect(() => {
    stateRef.current = {
      selectedFile,
      expandedFolders,
      showExplorer,
      showFileViewer,
      showTerminal,
      fileTree,
      directoryErrors,
      activeWorktree,
      worktreesSectionCollapsed,
      fileTreeSyncStatus,
      fileTreeSyncError,
      fileTreeSyncFallbackActive,
      fileTreeSyncRetryNonce,
    };
  }, [
    selectedFile,
    expandedFolders,
    showExplorer,
    showFileViewer,
    showTerminal,
    fileTree,
    directoryErrors,
    activeWorktree,
    worktreesSectionCollapsed,
    fileTreeSyncStatus,
    fileTreeSyncError,
    fileTreeSyncFallbackActive,
    fileTreeSyncRetryNonce,
  ]);

  const saveVisibleScope = useCallback((worktree: string | null) => {
    const s = stateRef.current;
    scopedStatesRef.current.set(scopeKey(worktree), {
      selectedFile: s.selectedFile,
      expandedFolders: Array.from(s.expandedFolders),
      fileTree: s.fileTree,
      directoryLoadErrors: Object.fromEntries(s.directoryErrors),
      loadedDirectories: collectLoadedDirectories(s.fileTree),
    });
  }, []);

  const restoreVisibleScope = useCallback((worktree: string | null) => {
    const cached = scopedStatesRef.current.get(scopeKey(worktree));
    const nextSelectedFile = cached?.selectedFile ?? null;
    const nextExpandedFolders = new Set(cached?.expandedFolders ?? []);
    const nextFileTree = cached?.fileTree ?? [];
    const nextDirectoryErrors = new Map(Object.entries(cached?.directoryLoadErrors ?? {}));

    stateRef.current = {
      ...stateRef.current,
      selectedFile: nextSelectedFile,
      expandedFolders: nextExpandedFolders,
      fileTree: nextFileTree,
      directoryErrors: nextDirectoryErrors,
      activeWorktree: worktree,
    };

    setSelectedFile(nextSelectedFile);
    setExpandedFolders(nextExpandedFolders);
    setFileTreeState(nextFileTree);
    setDirectoryErrors(nextDirectoryErrors);
    setDirectoryLoading(new Set());
    setFileTreeError(null);
  }, []);

  useEffect(() => {
    if (!slug) return;
    return () => {
      saveVisibleScope(currentWorktreeRef.current);
      const s = stateRef.current;
      const worktreeFileTreeStates = Object.fromEntries(scopedStatesRef.current);
      saveWorkspaceState(slug, {
        selectedFile: s.selectedFile,
        expandedFolders: Array.from(s.expandedFolders),
        showExplorer: s.showExplorer,
        showFileViewer: s.showFileViewer,
        showTerminal: s.showTerminal,
        fileTree: s.fileTree,
        directoryLoadErrors: Object.fromEntries(s.directoryErrors),
        loadedDirectories: collectLoadedDirectories(s.fileTree),
        activeWorktree: currentWorktreeRef.current,
        worktreesSectionCollapsed: s.worktreesSectionCollapsed,
        worktreeFileTreeStates,
      });
    };
  }, [slug, saveVisibleScope, saveWorkspaceState]);

  const setProject = useCallback((p: Project) => {
    const slugChanged = currentSlugRef.current !== p.slug;
    currentSlugRef.current = p.slug;
    setProjectState(p);
    setFileTreeError(null);
    if (slugChanged) {
      scopedStatesRef.current = new Map();
      currentWorktreeRef.current = null;
      setActiveWorktreeState(null);
      setFileTreeSyncStatusState("connecting");
      setFileTreeSyncError(null);
      setFileTreeSyncFallbackActiveState(false);
      setFileTreeSyncRetryNonce((nonce) => nonce + 1);
    }
    setRestoredFromCache((wasRestored) => {
      if (!wasRestored) {
        setSelectedFile(null);
        setExpandedFolders(new Set());
        setFileTreeState([]);
        setDirectoryErrors(new Map());
        setDirectoryLoading(new Set());
      }
      return false;
    });
  }, []);

  const selectFile = useCallback(
    (path: string | null) => {
      stateRef.current = { ...stateRef.current, selectedFile: path };
      setSelectedFile(path);
      if (path && !showFileViewer) {
        setShowFileViewer(true);
      }
    },
    [showFileViewer],
  );

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleExplorer = useCallback(() => {
    setShowExplorer((prev) => !prev);
  }, []);

  const toggleFileViewer = useCallback(() => {
    setShowFileViewer((prev) => !prev);
  }, []);

  const toggleTerminal = useCallback(() => {
    setShowTerminal((prev) => !prev);
  }, []);

  const setFileTree = useCallback((tree: FileNode[]) => {
    stateRef.current = { ...stateRef.current, fileTree: tree };
    setFileTreeState(tree);
  }, []);

  const setFileTreeLoading = useCallback((loading: boolean) => {
    setFileTreeLoadingState(loading);
  }, []);

  const refreshFileTree = useCallback(async (explicitSlug?: string) => {
    const targetSlug = explicitSlug ?? currentSlugRef.current;
    const targetWorktree = currentWorktreeRef.current;
    if (!targetSlug) return;

    const key = requestKey(targetSlug, targetWorktree, ROOT_REQUEST_PATH);
    const inFlight = inFlightFileTreeRequests.current.get(key);
    if (inFlight) return inFlight;

    rootRefreshCountRef.current += 1;
    setFileTreeRefreshing(true);
    if (
      (!currentSlugRef.current || currentSlugRef.current === targetSlug) &&
      currentWorktreeRef.current === targetWorktree
    ) {
      setFileTreeError(null);
    }

    const promise = (async () => {
      try {
        const res = await fetch(apiFileTreeUrl(targetSlug, ROOT_REQUEST_PATH, targetWorktree), {
          cache: "no-store",
        });
        const activeSlug = currentSlugRef.current;
        const activeWorktree = currentWorktreeRef.current;
        if (activeSlug && (activeSlug !== targetSlug || activeWorktree !== targetWorktree)) return;
        if (!res.ok) {
          const msg = responseErrorMessage(res);
          console.error("Failed to refresh file tree:", msg);
          setFileTreeError(msg);
          return;
        }
        const data = (await res.json()) as FileNode[];
        const clearSelectedFile = directListingProvesMissing(
          ROOT_REQUEST_PATH,
          data,
          stateRef.current.selectedFile,
        );
        setFileTreeState((prev) => {
          const merged = mergeRootTrees(data, prev);
          stateRef.current = {
            ...stateRef.current,
            fileTree: merged,
            selectedFile: clearSelectedFile ? null : stateRef.current.selectedFile,
          };
          return merged;
        });
        if (clearSelectedFile) {
          setSelectedFile(null);
        }
      } catch (err) {
        const activeSlug = currentSlugRef.current;
        const activeWorktree = currentWorktreeRef.current;
        if (!activeSlug || (activeSlug === targetSlug && activeWorktree === targetWorktree)) {
          console.error("Failed to refresh file tree:", err);
          setFileTreeError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        inFlightFileTreeRequests.current.delete(key);
        rootRefreshCountRef.current -= 1;
        if (rootRefreshCountRef.current === 0) {
          setFileTreeRefreshing(false);
        }
      }
    })();

    inFlightFileTreeRequests.current.set(key, promise);
    return promise;
  }, []);

  const loadDirectoryChildren = useCallback(async (relativePath: string, explicitSlug?: string) => {
    const targetSlug = explicitSlug ?? currentSlugRef.current;
    const targetWorktree = currentWorktreeRef.current;
    if (!targetSlug || !relativePath) return;

    const key = requestKey(targetSlug, targetWorktree, relativePath);
    const inFlight = inFlightFileTreeRequests.current.get(key);
    if (inFlight) return inFlight;

    setDirectoryLoading((prev) => new Set(prev).add(relativePath));
    setDirectoryErrors((prev) => {
      const next = new Map(prev);
      next.delete(relativePath);
      return next;
    });

    const promise = (async () => {
      try {
        const res = await fetch(apiFileTreeUrl(targetSlug, relativePath, targetWorktree), {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(responseErrorMessage(res));
        const data = (await res.json()) as FileNode[];
        const activeSlug = currentSlugRef.current;
        const activeWorktree = currentWorktreeRef.current;
        if (activeSlug && (activeSlug !== targetSlug || activeWorktree !== targetWorktree)) return;
        const clearSelectedFile = directListingProvesMissing(
          relativePath,
          data,
          stateRef.current.selectedFile,
        );
        setFileTreeState((prev) => {
          const merged = mergeDirectoryChildren(prev, relativePath, data);
          stateRef.current = {
            ...stateRef.current,
            fileTree: merged,
            selectedFile: clearSelectedFile ? null : stateRef.current.selectedFile,
          };
          return merged;
        });
        if (clearSelectedFile) {
          setSelectedFile(null);
        }
      } catch (err) {
        const activeSlug = currentSlugRef.current;
        const activeWorktree = currentWorktreeRef.current;
        if (!activeSlug || (activeSlug === targetSlug && activeWorktree === targetWorktree)) {
          console.error(`Failed to load directory children for ${relativePath}:`, err);
          setDirectoryErrors((prev) => {
            const next = new Map(prev);
            next.set(relativePath, err instanceof Error ? err.message : String(err));
            return next;
          });
        }
      } finally {
        inFlightFileTreeRequests.current.delete(key);
        const activeSlug = currentSlugRef.current;
        const activeWorktree = currentWorktreeRef.current;
        if (!activeSlug || (activeSlug === targetSlug && activeWorktree === targetWorktree)) {
          setDirectoryLoading((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
        }
      }
    })();

    inFlightFileTreeRequests.current.set(key, promise);
    return promise;
  }, []);

  const setActiveWorktree = useCallback(
    (name: string | null) => {
      const nextWorktree = name ?? null;
      const previousWorktree = currentWorktreeRef.current;
      if (previousWorktree === nextWorktree) return;
      saveVisibleScope(previousWorktree);
      currentWorktreeRef.current = nextWorktree;
      setActiveWorktreeState(nextWorktree);
      restoreVisibleScope(nextWorktree);
      setFileTreeSyncStatusState("connecting");
      setFileTreeSyncError(null);
      setFileTreeSyncFallbackActiveState(false);
      setFileTreeSyncRetryNonce((nonce) => nonce + 1);
    },
    [restoreVisibleScope, saveVisibleScope],
  );

  const toggleWorktreesSection = useCallback(() => {
    setWorktreesSectionCollapsed((prev) => !prev);
  }, []);

  const updateFileTreeSyncState = useCallback(
    (status: FileTreeSyncStatus, error: FileTreeSyncError | null = null) => {
      setFileTreeSyncStatusState(status);
      setFileTreeSyncError(error);
      if (status === "ready") {
        setFileTreeSyncFallbackActiveState(false);
      }
    },
    [],
  );

  const setFileTreeSyncFallbackActive = useCallback((active: boolean) => {
    setFileTreeSyncFallbackActiveState(active);
  }, []);

  const retryFileTreeSync = useCallback(() => {
    setFileTreeSyncStatusState("connecting");
    setFileTreeSyncError(null);
    setFileTreeSyncRetryNonce((nonce) => nonce + 1);
  }, []);

  const refreshFileTreeScope = useCallback(
    async (scope: FileTreeSyncScope) => {
      const activeSlug = currentSlugRef.current;
      const activeWorktree = currentWorktreeRef.current;
      if (!activeSlug || scope.slug !== activeSlug || scope.worktree !== activeWorktree) {
        return;
      }

      const generation = invalidationGenerationRef.current + 1;
      invalidationGenerationRef.current = generation;

      const loadedDirectories = new Set(collectLoadedDirectories(stateRef.current.fileTree));
      await Promise.all([
        refreshFileTree(activeSlug),
        ...Array.from(loadedDirectories).map((directory) =>
          loadDirectoryChildren(directory, activeSlug),
        ),
      ]);

      if (invalidationGenerationRef.current !== generation) return;

      const selected = stateRef.current.selectedFile;
      if (selected && findNodeByPath(stateRef.current.fileTree, selected) === null) {
        const loadedScopes = new Set([ROOT_REQUEST_PATH, ...loadedDirectories]);
        const selectedParent = selected.includes("/")
          ? selected.slice(0, selected.lastIndexOf("/"))
          : ROOT_REQUEST_PATH;
        if (loadedScopes.has(selectedParent)) {
          stateRef.current = { ...stateRef.current, selectedFile: null };
          setSelectedFile(null);
        }
      }
    },
    [loadDirectoryChildren, refreshFileTree],
  );

  const invalidateFileTreeScope = useCallback(
    async (event: FileTreeChangedEvent) => {
      const activeSlug = currentSlugRef.current;
      const activeWorktree = currentWorktreeRef.current;
      if (
        !activeSlug ||
        event.scope.slug !== activeSlug ||
        event.scope.worktree !== activeWorktree
      ) {
        return;
      }

      const generation = invalidationGenerationRef.current + 1;
      invalidationGenerationRef.current = generation;

      const loadedDirectories = new Set(collectLoadedDirectories(stateRef.current.fileTree));
      const hintedDirectories = eventParentDirectories(event);
      const directoriesToRefresh = new Set<string>();
      let rootChanged =
        event.rootChanged || event.gitStatusChanged || event.truncated || event.paths.length === 0;

      for (const directory of hintedDirectories) {
        if (!directory) {
          rootChanged = true;
          continue;
        }
        if (loadedDirectories.has(directory)) {
          directoriesToRefresh.add(directory);
        }
      }

      const operations: Promise<void>[] = [];
      if (rootChanged) {
        operations.push(refreshFileTree(activeSlug));
      }
      for (const directory of directoriesToRefresh) {
        operations.push(loadDirectoryChildren(directory, activeSlug));
      }

      await Promise.all(operations);
      if (invalidationGenerationRef.current !== generation) return;

      const selected = stateRef.current.selectedFile;
      if (selected && findNodeByPath(stateRef.current.fileTree, selected) === null) {
        const loadedScopes = new Set([ROOT_REQUEST_PATH, ...loadedDirectories]);
        const selectedParent = selected.includes("/")
          ? selected.slice(0, selected.lastIndexOf("/"))
          : ROOT_REQUEST_PATH;
        if (loadedScopes.has(selectedParent)) {
          stateRef.current = { ...stateRef.current, selectedFile: null };
          setSelectedFile(null);
        }
      }
    },
    [loadDirectoryChildren, refreshFileTree],
  );

  const value = useMemo(
    () => ({
      project,
      selectedFile,
      expandedFolders,
      showExplorer,
      showFileViewer,
      showTerminal,
      fileTree,
      fileTreeLoading,
      fileTreeError,
      directoryLoading,
      directoryErrors,
      fileTreeRefreshing,
      activeWorktree,
      worktreesSectionCollapsed,
      fileTreeSyncStatus,
      fileTreeSyncError,
      fileTreeSyncFallbackActive,
      fileTreeSyncRetryNonce,
      setProject,
      selectFile,
      toggleFolder,
      toggleExplorer,
      toggleFileViewer,
      toggleTerminal,
      setFileTree,
      setFileTreeLoading,
      refreshFileTree,
      loadDirectoryChildren,
      setActiveWorktree,
      toggleWorktreesSection,
      retryFileTreeSync,
      refreshFileTreeScope,
      invalidateFileTreeScope,
      updateFileTreeSyncState,
      setFileTreeSyncFallbackActive,
    }),
    [
      project,
      selectedFile,
      expandedFolders,
      showExplorer,
      showFileViewer,
      showTerminal,
      fileTree,
      fileTreeLoading,
      fileTreeError,
      directoryLoading,
      directoryErrors,
      fileTreeRefreshing,
      activeWorktree,
      worktreesSectionCollapsed,
      fileTreeSyncStatus,
      fileTreeSyncError,
      fileTreeSyncFallbackActive,
      fileTreeSyncRetryNonce,
      setProject,
      selectFile,
      toggleFolder,
      toggleExplorer,
      toggleFileViewer,
      toggleTerminal,
      setFileTree,
      setFileTreeLoading,
      refreshFileTree,
      loadDirectoryChildren,
      setActiveWorktree,
      toggleWorktreesSection,
      retryFileTreeSync,
      refreshFileTreeScope,
      invalidateFileTreeScope,
      updateFileTreeSyncState,
      setFileTreeSyncFallbackActive,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
