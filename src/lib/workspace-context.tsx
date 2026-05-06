"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { FileNode, Project } from "./types";

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
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [project, setProjectState] = useState<Project | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showFileViewer, setShowFileViewer] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [fileTree, setFileTreeState] = useState<FileNode[]>([]);
  const [fileTreeLoading, setFileTreeLoadingState] = useState(false);

  const setProject = useCallback((p: Project) => {
    setProjectState(p);
    setSelectedFile(null);
    setExpandedFolders(new Set());
    setFileTreeState([]);
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

  const value = useMemo(
    () => ({
      project,
      selectedFile,
      expandedFolders,
      showFileViewer,
      showTerminal,
      fileTree,
      fileTreeLoading,
      setProject,
      selectFile,
      toggleFolder,
      toggleFileViewer,
      toggleTerminal,
      setFileTree,
      setFileTreeLoading,
    }),
    [
      project,
      selectedFile,
      expandedFolders,
      showFileViewer,
      showTerminal,
      fileTree,
      fileTreeLoading,
      setProject,
      selectFile,
      toggleFolder,
      toggleFileViewer,
      toggleTerminal,
      setFileTree,
      setFileTreeLoading,
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
