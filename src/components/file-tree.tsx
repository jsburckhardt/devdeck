import React, { useCallback } from "react";
import {
  Folder,
  FolderOpen,
  CaretRight,
  Plus,
  PencilSimple,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { useWorkspace } from "@/lib/workspace-context";
import { getFileIcon } from "@/lib/file-icons";
import { cn } from "@/lib/utils";
import type { FileNode } from "@/lib/types";

// Declared as a stable component to satisfy react-hooks/static-components
const FolderIcon = Folder;
const FolderOpenIcon = FolderOpen;

function FileNodeIcon({
  name,
  isDirectory,
  isExpanded,
  unreadable,
}: {
  name: string;
  isDirectory: boolean;
  isExpanded: boolean;
  unreadable?: boolean;
}) {
  if (isDirectory) {
    return isExpanded
      ? React.createElement(FolderOpenIcon, {
          size: 16,
          weight: "duotone",
          className: cn("flex-shrink-0 text-primary", unreadable && "text-amber-500"),
        })
      : React.createElement(FolderIcon, {
          size: 16,
          weight: "duotone",
          className: cn("flex-shrink-0 text-primary", unreadable && "text-amber-500"),
        });
  }
  const IconComponent = getFileIcon(name);
  return React.createElement(IconComponent, {
    size: 16,
    weight: "regular",
    className: cn("flex-shrink-0 text-muted-foreground", unreadable && "text-amber-500"),
  });
}

interface FileTreeProps {
  nodes: FileNode[];
  depth?: number;
}

function StatusBadge({ status }: { status?: "added" | "modified" | "deleted" }) {
  if (!status) return null;

  const config = {
    added: { label: "A", className: "bg-green-500/20 text-green-400" },
    modified: { label: "M", className: "bg-yellow-500/20 text-yellow-400" },
    deleted: { label: "D", className: "bg-red-500/20 text-red-400" },
  };

  const { label, className } = config[status];

  return (
    <span
      className={cn(
        "ml-auto inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold",
        className,
      )}
      title={status}
    >
      {label}
    </span>
  );
}

function StatusIcon({ status }: { status?: "added" | "modified" | "deleted" }) {
  if (!status) return null;
  const icons = {
    added: Plus,
    modified: PencilSimple,
    deleted: Trash,
  };
  const Icon = icons[status];
  return <Icon size={10} weight="bold" />;
}

const FileTreeItem = React.memo(function FileTreeItem({
  node,
  depth = 0,
}: {
  node: FileNode;
  depth: number;
}) {
  const {
    selectedFile,
    expandedFolders,
    selectFile,
    toggleFolder,
    loadDirectoryChildren,
    directoryLoading,
    directoryErrors,
  } = useWorkspace();

  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedFile === node.path;
  const isDirectory = node.type === "directory";
  const isUnreadableDirectory = isDirectory && node.unreadable;
  const isDirectoryLoading = directoryLoading.has(node.path);
  const directoryError = directoryErrors.get(node.path);
  const hasLoadedChildren = node.childrenLoaded === true || Array.isArray(node.children);
  const shouldLoadOnExpand = isDirectory && !hasLoadedChildren && node.hasChildren !== false;

  const handleClick = useCallback(() => {
    if (isUnreadableDirectory) return;
    if (isDirectory) {
      toggleFolder(node.path);
      if (!isExpanded && shouldLoadOnExpand) {
        void loadDirectoryChildren(node.path);
      }
    } else {
      selectFile(node.path);
    }
  }, [
    isDirectory,
    isExpanded,
    isUnreadableDirectory,
    loadDirectoryChildren,
    node.path,
    selectFile,
    shouldLoadOnExpand,
    toggleFolder,
  ]);

  const handleRetry = useCallback(() => {
    void loadDirectoryChildren(node.path);
  }, [loadDirectoryChildren, node.path]);

  const fileIconName = isDirectory ? (isExpanded ? "folderOpen" : "folder") : node.name;
  const unreadableTitle = node.unreadable
    ? `${node.path} — cannot preview/read ${node.kind.replace(/-/g, " ")}`
    : node.path;

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-sm transition-colors",
          isSelected
            ? "bg-primary/15 text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          node.unreadable && "text-amber-600 dark:text-amber-400",
          isUnreadableDirectory &&
            "cursor-default hover:bg-transparent hover:text-amber-600 dark:hover:text-amber-400",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        title={unreadableTitle}
        aria-label={node.unreadable ? `${node.name} (${node.kind}, unreadable)` : node.name}
      >
        {isDirectory && !isUnreadableDirectory && node.hasChildren !== false && (
          <motion.span
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="flex-shrink-0"
          >
            <CaretRight size={12} weight="bold" />
          </motion.span>
        )}
        {isUnreadableDirectory && <span className="w-3 flex-shrink-0" />}
        {!isDirectory && <span className="w-3 flex-shrink-0" />}
        <FileNodeIcon
          name={fileIconName}
          isDirectory={isDirectory}
          isExpanded={isExpanded}
          unreadable={node.unreadable}
        />
        <span className="truncate font-mono text-xs">{node.name}</span>
        {node.unreadable && (
          <WarningCircle
            size={12}
            className="ml-auto flex-shrink-0 text-amber-500"
            aria-hidden="true"
          />
        )}
        <StatusBadge status={node.status} />
      </button>

      <AnimatePresence initial={false}>
        {isDirectory && !isUnreadableDirectory && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="overflow-hidden"
            aria-busy={isDirectoryLoading}
          >
            {isDirectoryLoading && (
              <div
                className="px-2 py-1 font-mono text-xs text-muted-foreground"
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                role="status"
              >
                Loading {node.name}…
              </div>
            )}
            {directoryError && !isDirectoryLoading && (
              <div
                className="space-y-1 px-2 py-1 text-xs text-destructive"
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
              >
                <div>
                  Could not load {node.name}: {directoryError}
                </div>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="rounded border border-destructive/40 px-2 py-0.5 text-xs hover:bg-destructive/10"
                  aria-label={`Retry loading ${node.name}`}
                >
                  Retry
                </button>
              </div>
            )}
            {!directoryError &&
              !isDirectoryLoading &&
              node.childrenLoaded &&
              node.children?.length === 0 && (
                <div
                  className="px-2 py-1 font-mono text-xs text-muted-foreground"
                  style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                >
                  Empty directory
                </div>
              )}
            {!directoryError &&
              node.children?.map((child) => (
                <FileTreeItem key={child.path} node={child} depth={depth + 1} />
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export function FileTree({ nodes, depth = 0 }: FileTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        No files found
      </div>
    );
  }

  return (
    <div className="py-1">
      {nodes.map((node) => (
        <FileTreeItem key={node.path} node={node} depth={depth} />
      ))}
    </div>
  );
}

// Re-export StatusIcon for potential external use
export { StatusIcon };
