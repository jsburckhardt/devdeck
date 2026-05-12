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
}

interface WorkspaceContextValue extends WorkspaceState {
  setProject: (project: Project) => void;
  selectFile: (path: string | null) => void;
  toggleFolder: (path: string) => void;
  toggleFileViewer: () => void;
  toggleTerminal: () => void;
  setFileTree: (tree: FileNode[]) => void;
  setFileTreeLoading: (loading: boolean) => void;
  /**
   * Silently re-fetches the file tree from `/api/files` for the active project.
   * Per Decision #60, this never mutates `fileTreeLoading` — it is the
   * "silent refresh" path used after in-portal mutations (e.g. file save).
   * Surface in-flight state via `fileTreeRefreshing` if needed.
   */
  refreshFileTree: () => Promise<void>;
  fileTreeRefreshing: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

interface WorkspaceProviderProps {
  slug?: string;
  children: React.ReactNode;
}

export function WorkspaceProvider({ slug, children }: WorkspaceProviderProps) {
  const { saveWorkspaceState, restoreWorkspaceState } = useOpenProjects();

  // Compute cached state once for lazy initializers
  // Using useState to store the "restored" flag so it's part of React state, not a ref
  const [, setRestoredFromCache] = useState(() => {
    if (!slug) return false;
    return !!restoreWorkspaceState(slug);
  });

  const [project, setProjectState] = useState<Project | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(() => {
    if (!slug) return null;
    const cached = restoreWorkspaceState(slug);
    return cached?.selectedFile ?? null;
  });
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    if (!slug) return new Set<string>();
    const cached = restoreWorkspaceState(slug);
    return cached ? new Set(cached.expandedFolders) : new Set<string>();
  });
  const [showFileViewer, setShowFileViewer] = useState(() => {
    if (!slug) return true;
    const cached = restoreWorkspaceState(slug);
    return cached?.showFileViewer ?? true;
  });
  const [showTerminal, setShowTerminal] = useState(() => {
    if (!slug) return true;
    const cached = restoreWorkspaceState(slug);
    return cached?.showTerminal ?? true;
  });
  const [fileTree, setFileTreeState] = useState<FileNode[]>(() => {
    if (!slug) return [];
    const cached = restoreWorkspaceState(slug);
    return cached?.fileTree ?? [];
  });
  const [fileTreeLoading, setFileTreeLoadingState] = useState(false);
  const [fileTreeRefreshing, setFileTreeRefreshing] = useState(false);

  // Use a single ref that holds the latest state for save-on-unmount
  const stateRef = useRef({
    selectedFile,
    expandedFolders,
    showFileViewer,
    showTerminal,
    fileTree,
  });

  useEffect(() => {
    stateRef.current = {
      selectedFile,
      expandedFolders,
      showFileViewer,
      showTerminal,
      fileTree,
    };
  }, [selectedFile, expandedFolders, showFileViewer, showTerminal, fileTree]);

  // Save state on unmount
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
      });
    };
  }, [slug, saveWorkspaceState]);

  const setProject = useCallback((p: Project) => {
    setProjectState(p);
    setRestoredFromCache((wasRestored) => {
      // Only reset state if we didn't restore from cache
      if (!wasRestored) {
        setSelectedFile(null);
        setExpandedFolders(new Set());
        setFileTreeState([]);
      }
      // Clear the flag after first setProject call
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
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
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

  // Silent refresh of the file tree — does not toggle `fileTreeLoading`
  // (Decision #60). Used after in-portal mutations like file save so the
  // explorer reflects new git status without the spinner re-flashing.
  const refreshFileTree = useCallback(async () => {
    const slug = project?.slug;
    if (!slug) return;
    setFileTreeRefreshing(true);
    try {
      const res = await fetch(`/api/files?slug=${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        console.error("Failed to refresh file tree: HTTP", res.status);
        return;
      }
      const data = (await res.json()) as FileNode[];
      setFileTreeState(data);
    } catch (err) {
      console.error("Failed to refresh file tree:", err);
    } finally {
      setFileTreeRefreshing(false);
    }
  }, [project?.slug]);

  const value = useMemo(
    () => ({
      project,
      selectedFile,
      expandedFolders,
      showFileViewer,
      showTerminal,
      fileTree,
      fileTreeLoading,
      fileTreeRefreshing,
      setProject,
      selectFile,
      toggleFolder,
      toggleFileViewer,
      toggleTerminal,
      setFileTree,
      setFileTreeLoading,
      refreshFileTree,
    }),
    [
      project,
      selectedFile,
      expandedFolders,
      showFileViewer,
      showTerminal,
      fileTree,
      fileTreeLoading,
      fileTreeRefreshing,
      setProject,
      selectFile,
      toggleFolder,
      toggleFileViewer,
      toggleTerminal,
      setFileTree,
      setFileTreeLoading,
      refreshFileTree,
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
