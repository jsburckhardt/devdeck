import React, { useCallback } from "react";
import { Folder, FolderOpen, CaretRight, Plus, PencilSimple, Trash } from "@phosphor-icons/react";
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
}: {
  name: string;
  isDirectory: boolean;
  isExpanded: boolean;
}) {
  if (isDirectory) {
    return isExpanded
      ? React.createElement(FolderOpenIcon, {
          size: 16,
          weight: "duotone",
          className: "flex-shrink-0 text-primary",
        })
      : React.createElement(FolderIcon, {
          size: 16,
          weight: "duotone",
          className: "flex-shrink-0 text-primary",
        });
  }
  const IconComponent = getFileIcon(name);
  return React.createElement(IconComponent, {
    size: 16,
    weight: "regular",
    className: "flex-shrink-0 text-muted-foreground",
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
  const { selectedFile, expandedFolders, selectFile, toggleFolder } = useWorkspace();

  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedFile === node.path;
  const isDirectory = node.type === "directory";

  const handleClick = useCallback(() => {
    if (isDirectory) {
      toggleFolder(node.path);
    } else {
      selectFile(node.path);
    }
  }, [isDirectory, node.path, toggleFolder, selectFile]);

  const fileIconName = isDirectory ? (isExpanded ? "folderOpen" : "folder") : node.name;

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-sm transition-colors",
          isSelected
            ? "bg-primary/15 text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        title={node.path}
      >
        {isDirectory && (
          <motion.span
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="flex-shrink-0"
          >
            <CaretRight size={12} weight="bold" />
          </motion.span>
        )}
        {!isDirectory && <span className="w-3 flex-shrink-0" />}
        <FileNodeIcon name={fileIconName} isDirectory={isDirectory} isExpanded={isExpanded} />
        <span className="truncate font-mono text-xs">{node.name}</span>
        <StatusBadge status={node.status} />
      </button>

      <AnimatePresence initial={false}>
        {isDirectory && isExpanded && node.children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            {node.children.map((child) => (
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
