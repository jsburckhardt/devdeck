import type React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/workspace-context", () => ({
  useWorkspace: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, ...rest } = props;
      void initial;
      void animate;
      void exit;
      void transition;
      return <div {...rest}>{children}</div>;
    },
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { animate, transition, ...rest } = props;
      void animate;
      void transition;
      return <span {...rest}>{children}</span>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import { useWorkspace } from "@/lib/workspace-context";
import { FileTree } from "./file-tree";
import type { FileNode } from "@/lib/types";

const mockUseWorkspace = vi.mocked(useWorkspace);

function setupWorkspace(overrides: Record<string, unknown> = {}) {
  const defaults = {
    project: { slug: "test", name: "Test", path: "/test", source: "auto" as const },
    selectedFile: null as string | null,
    fileTree: [],
    expandedFolders: new Set<string>(),
    showFileViewer: true,
    showTerminal: true,
    fileTreeLoading: false,
    fileTreeRefreshing: false,
    setProject: vi.fn(),
    selectFile: vi.fn(),
    toggleFolder: vi.fn(),
    toggleFileViewer: vi.fn(),
    toggleTerminal: vi.fn(),
    setFileTree: vi.fn(),
    setFileTreeLoading: vi.fn(),
    refreshFileTree: vi.fn().mockResolvedValue(undefined),
  };
  const context = { ...defaults, ...overrides } as ReturnType<typeof useWorkspace>;
  mockUseWorkspace.mockReturnValue(context);
  return context;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FileTree", () => {
  it("TP10 renders regular nodes unchanged and selects files", async () => {
    const context = setupWorkspace();
    const nodes: FileNode[] = [
      { name: "src", path: "src", type: "directory", kind: "directory", children: [] },
      { name: "index.ts", path: "index.ts", type: "file", kind: "regular-file" },
    ];

    render(<FileTree nodes={nodes} />);
    await userEvent.click(screen.getByRole("button", { name: "index.ts" }));

    expect(screen.getByText("src")).toBeInTheDocument();
    expect(context.selectFile).toHaveBeenCalledWith("index.ts");
  });

  it("TP10 keeps unreadable file-like nodes visible and selectable", async () => {
    const context = setupWorkspace();
    const nodes: FileNode[] = [
      {
        name: "app.sock",
        path: "app.sock",
        type: "file",
        kind: "socket",
        unreadable: true,
      },
    ];

    render(<FileTree nodes={nodes} />);
    const node = screen.getByRole("button", { name: /app.sock.*socket.*unreadable/i });
    expect(node).toBeInTheDocument();
    expect(node).toHaveAttribute("title", expect.stringContaining("cannot preview/read socket"));

    await userEvent.click(node);
    expect(context.selectFile).toHaveBeenCalledWith("app.sock");
  });

  it("TP10 keeps unreadable directories visible without expanding", async () => {
    const context = setupWorkspace();
    const nodes: FileNode[] = [
      {
        name: "restricted",
        path: "restricted",
        type: "directory",
        kind: "permission-denied",
        unreadable: true,
        children: [],
      },
    ];

    render(<FileTree nodes={nodes} />);
    const node = screen.getByRole("button", { name: /restricted.*permission-denied.*unreadable/i });
    expect(node).toBeInTheDocument();

    await userEvent.click(node);
    expect(context.toggleFolder).not.toHaveBeenCalled();
    expect(context.selectFile).not.toHaveBeenCalled();
  });
});
