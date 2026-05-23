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
import type { FileNode, Project } from "./types";
import { useOpenProjects } from "./open-projects-context";

interface WorkspaceState {
  project: Project | null;
  selectedFile: string | null;
  expandedFolders: Set<string>;
  showFileViewer: boolean;
  showTerminal: boolean;
  fileTree: FileNode[];
  fileTreeLoading: boolean;
  fileTreeError: string | null;
  directoryLoading: Set<string>;
  directoryErrors: Map<string, string>;
}

interface WorkspaceContextValue extends WorkspaceState {
  setProject: (project: Project) => void;
  selectFile: (path: string | null) => void;
  toggleFolder: (path: string) => void;
  toggleFileViewer: () => void;
  toggleTerminal: () => void;
  setFileTree: (tree: FileNode[]) => void;
  setFileTreeLoading: (loading: boolean) => void;
  refreshFileTree: (explicitSlug?: string) => Promise<void>;
  loadDirectoryChildren: (path: string, explicitSlug?: string) => Promise<void>;
  fileTreeRefreshing: boolean;
}

const ROOT_REQUEST_PATH = "";
const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

interface WorkspaceProviderProps {
  slug?: string;
  children: React.ReactNode;
}

function requestKey(slug: string, relativePath: string): string {
  return `${slug}:${relativePath}`;
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

function responseErrorMessage(response: Response): string {
  return `HTTP ${response.status}`;
}

export function WorkspaceProvider({ slug, children }: WorkspaceProviderProps) {
  const { saveWorkspaceState, restoreWorkspaceState } = useOpenProjects();
  const cachedStateRef = useRef(slug ? restoreWorkspaceState(slug) : undefined);

  const [, setRestoredFromCache] = useState(() => !!cachedStateRef.current);
  const [project, setProjectState] = useState<Project | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(
    cachedStateRef.current?.selectedFile ?? null,
  );
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(cachedStateRef.current?.expandedFolders ?? []),
  );
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

  const currentSlugRef = useRef<string | undefined>(slug);
  const rootRefreshCountRef = useRef(0);
  const inFlightFileTreeRequests = useRef<Map<string, Promise<void>>>(new Map());

  useEffect(() => {
    currentSlugRef.current = project?.slug ?? slug;
  }, [project?.slug, slug]);

  const stateRef = useRef({
    selectedFile,
    expandedFolders,
    showFileViewer,
    showTerminal,
    fileTree,
    directoryErrors,
  });

  useEffect(() => {
    stateRef.current = {
      selectedFile,
      expandedFolders,
      showFileViewer,
      showTerminal,
      fileTree,
      directoryErrors,
    };
  }, [selectedFile, expandedFolders, showFileViewer, showTerminal, fileTree, directoryErrors]);

  useEffect(() => {
    if (!slug) return;
    return () => {
      const s = stateRef.current;
      saveWorkspaceState(slug, {
        selectedFile: s.selectedFile,
        expandedFolders: Array.from(s.expandedFolders),
        showFileViewer: s.showFileViewer,
        showTerminal: s.showTerminal,
        fileTree: s.fileTree,
        directoryLoadErrors: Object.fromEntries(s.directoryErrors),
      });
    };
  }, [slug, saveWorkspaceState]);

  const setProject = useCallback((p: Project) => {
    currentSlugRef.current = p.slug;
    setProjectState(p);
    setFileTreeError(null);
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

  const toggleFileViewer = useCallback(() => {
    setShowFileViewer((prev) => !prev);
  }, []);

  const toggleTerminal = useCallback(() => {
    setShowTerminal((prev) => !prev);
  }, []);

  const setFileTree = useCallback((tree: FileNode[]) => {
    setFileTreeState(tree);
  }, []);

  const setFileTreeLoading = useCallback((loading: boolean) => {
    setFileTreeLoadingState(loading);
  }, []);

  const refreshFileTree = useCallback(async (explicitSlug?: string) => {
    const targetSlug = explicitSlug ?? currentSlugRef.current;
    if (!targetSlug) return;

    const key = requestKey(targetSlug, ROOT_REQUEST_PATH);
    const inFlight = inFlightFileTreeRequests.current.get(key);
    if (inFlight) return inFlight;

    rootRefreshCountRef.current += 1;
    setFileTreeRefreshing(true);
    if (!currentSlugRef.current || currentSlugRef.current === targetSlug) {
      setFileTreeError(null);
    }

    const promise = (async () => {
      try {
        const res = await fetch(`/api/files?slug=${encodeURIComponent(targetSlug)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const activeSlug = currentSlugRef.current;
          if (!activeSlug || activeSlug === targetSlug) {
            const msg = responseErrorMessage(res);
            console.error("Failed to refresh file tree:", msg);
            setFileTreeError(msg);
          }
          return;
        }
        const data = (await res.json()) as FileNode[];
        const activeSlug = currentSlugRef.current;
        if (activeSlug && activeSlug !== targetSlug) return;
        setFileTreeState((prev) => mergeRootTrees(data, prev));
      } catch (err) {
        const activeSlug = currentSlugRef.current;
        if (!activeSlug || activeSlug === targetSlug) {
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
    if (!targetSlug || !relativePath) return;

    const key = requestKey(targetSlug, relativePath);
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
        const params = new URLSearchParams({ slug: targetSlug, path: relativePath });
        const res = await fetch(`/api/files?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(responseErrorMessage(res));
        const data = (await res.json()) as FileNode[];
        const activeSlug = currentSlugRef.current;
        if (activeSlug && activeSlug !== targetSlug) return;
        setFileTreeState((prev) => mergeDirectoryChildren(prev, relativePath, data));
      } catch (err) {
        const activeSlug = currentSlugRef.current;
        if (!activeSlug || activeSlug === targetSlug) {
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
        if (!activeSlug || activeSlug === targetSlug) {
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

  const value = useMemo(
    () => ({
      project,
      selectedFile,
      expandedFolders,
      showFileViewer,
      showTerminal,
      fileTree,
      fileTreeLoading,
      fileTreeError,
      directoryLoading,
      directoryErrors,
      fileTreeRefreshing,
      setProject,
      selectFile,
      toggleFolder,
      toggleFileViewer,
      toggleTerminal,
      setFileTree,
      setFileTreeLoading,
      refreshFileTree,
      loadDirectoryChildren,
    }),
    [
      project,
      selectedFile,
      expandedFolders,
      showFileViewer,
      showTerminal,
      fileTree,
      fileTreeLoading,
      fileTreeError,
      directoryLoading,
      directoryErrors,
      fileTreeRefreshing,
      setProject,
      selectFile,
      toggleFolder,
      toggleFileViewer,
      toggleTerminal,
      setFileTree,
      setFileTreeLoading,
      refreshFileTree,
      loadDirectoryChildren,
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
