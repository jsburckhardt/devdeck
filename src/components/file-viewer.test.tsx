import type React from "react";
import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/workspace-context", () => ({
  useWorkspace: vi.fn(),
}));

vi.mock("@/components/diff-view", () => ({
  DiffView: ({ diff }: { diff: string }) => <div data-testid="diff-view">{diff}</div>,
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: vi.fn(() => ({
    theme: "dark" as const,
    setTheme: vi.fn(),
    toggleTheme: vi.fn(),
  })),
}));

const mockMermaidRender = vi.fn();
const mockMermaidInitialize = vi.fn();
const MERMAID_EDIT_HINT =
  "Mermaid diagrams are read-only in Edit in Preview. Use raw Edit or Live Edit to change diagram source.";

vi.mock("mermaid", () => ({
  default: {
    initialize: (...args: unknown[]) => mockMermaidInitialize(...args),
    render: (...args: unknown[]) => mockMermaidRender(...args),
  },
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
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("react-resizable-panels", () => ({
  Group: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="live-edit-panel-group" {...props}>
      {children}
    </div>
  ),
  Panel: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
    void props;
    return <div data-testid="live-edit-panel">{children}</div>;
  },
  Separator: (props: Record<string, unknown>) => {
    void props;
    return <div data-testid="live-edit-separator" />;
  },
}));

const mockExcalidrawProps = vi.fn();

vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: React.ComponentType<unknown> }>) => {
    void loader;
    const MockedComponent = (props: Record<string, unknown>) => {
      mockExcalidrawProps(props);
      return <div data-testid="excalidraw-renderer" />;
    };
    MockedComponent.displayName = "DynamicExcalidraw";
    return MockedComponent;
  },
}));

vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: () => <div data-testid="excalidraw-renderer" />,
}));

import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace-context";
import { useTheme } from "@/components/theme-provider";
import FileViewer from "./file-viewer";

const mockUseWorkspace = vi.mocked(useWorkspace);
const mockUseTheme = vi.mocked(useTheme);

function setupWorkspace(overrides: Record<string, unknown> = {}) {
  const defaults = {
    project: { slug: "test-project", name: "Test", path: "/test", source: "auto" as const },
    selectedFile: null as string | null,
    fileTree: [],
    expandedFolders: new Set<string>(),
    showExplorer: true,
    showFileViewer: true,
    showTerminal: true,
    fileTreeLoading: false,
    fileTreeRefreshing: false,
    setProject: vi.fn(),
    selectFile: vi.fn(),
    toggleFolder: vi.fn(),
    toggleExplorer: vi.fn(),
    toggleFileViewer: vi.fn(),
    toggleTerminal: vi.fn(),
    setFileTree: vi.fn(),
    setFileTreeLoading: vi.fn(),
    refreshFileTree: vi.fn().mockResolvedValue(undefined),
    loadDirectoryChildren: vi.fn().mockResolvedValue(undefined),
    fileTreeError: null,
    activeWorktree: null,
    worktreesSectionCollapsed: false,
    setActiveWorktree: vi.fn(),
    toggleWorktreesSection: vi.fn(),
    directoryLoading: new Set<string>(),
    directoryErrors: new Map<string, string>(),
  };
  mockUseWorkspace.mockReturnValue({ ...defaults, ...overrides } as ReturnType<
    typeof useWorkspace
  >);
}

function mockFetchResponse(data: unknown, status = 200) {
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("FileViewer", () => {
  describe("Issue #52 worktree requests", () => {
    it("content GET and diff GET include activeWorktree when set", async () => {
      setupWorkspace({
        selectedFile: "src/index.ts",
        activeWorktree: ".trees/feat",
        fileTree: [{ name: "index.ts", path: "src/index.ts", type: "file", status: "modified" }],
      });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1;",
            language: "typescript",
            size: 12,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 1000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByText("Changes")).toBeInTheDocument());
      expect(String(fetchSpy.mock.calls[0][0])).toBe(
        "/api/files/content?slug=test-project&path=src%2Findex.ts&worktree=.trees%2Ffeat",
      );

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ diff: "diff" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      await user.click(screen.getByText("Changes"));

      await waitFor(() => expect(screen.getByTestId("diff-view")).toBeInTheDocument());
      expect(String(fetchSpy.mock.calls[1][0])).toBe(
        "/api/files/diff?slug=test-project&path=src%2Findex.ts&worktree=.trees%2Ffeat",
      );
    });

    it("save PUT body includes activeWorktree and refreshes current context", async () => {
      const refreshFileTree = vi.fn().mockResolvedValue(undefined);
      setupWorkspace({
        selectedFile: "src/index.ts",
        activeWorktree: ".trees/feat",
        refreshFileTree,
      });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1;",
            language: "typescript",
            size: 12,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 1000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(<FileViewer />);
      const user = userEvent.setup();
      await waitFor(() => expect(screen.getByLabelText("Edit file")).toBeInTheDocument());
      await user.click(screen.getByLabelText("Edit file"));
      await user.type(screen.getByLabelText("File editor"), " ");

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1; ",
            language: "typescript",
            size: 13,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 2000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      await user.click(screen.getByLabelText("Save file"));

      await waitFor(() => expect(refreshFileTree).toHaveBeenCalledTimes(1));
      const putInit = fetchSpy.mock.calls[1][1] as RequestInit;
      expect(JSON.parse(String(putInit.body))).toMatchObject({ worktree: ".trees/feat" });
    });

    it("omits worktree from requests when activeWorktree is null", async () => {
      setupWorkspace({ selectedFile: "src/index.ts", activeWorktree: null });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1;",
            language: "typescript",
            size: 12,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 1000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(<FileViewer />);

      await waitFor(() => expect(screen.getByText("src/index.ts")).toBeInTheDocument());
      expect(String(fetchSpy.mock.calls[0][0])).toBe(
        "/api/files/content?slug=test-project&path=src%2Findex.ts",
      );
    });
  });
  it("shows placeholder when no file is selected", () => {
    setupWorkspace({ selectedFile: null });
    render(<FileViewer />);
    expect(screen.getByText("Select a file to view its contents")).toBeInTheDocument();
  });

  describe("Issue #32 preview errors", () => {
    it("TP8 renders a friendly cannot-preview panel for structured NOT_REGULAR_FILE errors", async () => {
      const refreshFileTree = vi.fn().mockResolvedValue(undefined);
      setupWorkspace({ selectedFile: "app.sock", refreshFileTree });
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockFetchResponse(
        { error: "Cannot preview file", code: "NOT_REGULAR_FILE", kind: "socket" },
        415,
      );

      render(<FileViewer />);

      await waitFor(() => {
        expect(screen.getByText("Cannot preview file")).toBeInTheDocument();
      });
      expect(screen.getByText(/socket entries/i)).toBeInTheDocument();
      expect(screen.getByText(/Kind: socket/i)).toBeInTheDocument();
      expect(screen.queryByLabelText("Edit file")).not.toBeInTheDocument();
      expect(refreshFileTree).not.toHaveBeenCalled();
    });

    it("TP9 renders permission denied preview errors without refreshing the file tree", async () => {
      const refreshFileTree = vi.fn().mockResolvedValue(undefined);
      setupWorkspace({ selectedFile: "secret.txt", refreshFileTree });
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockFetchResponse(
        { error: "Cannot preview file", code: "PERMISSION_DENIED", kind: "permission-denied" },
        403,
      );

      render(<FileViewer />);

      await waitFor(() => {
        expect(screen.getByText(/does not have permission/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Kind: permission denied/i)).toBeInTheDocument();
      expect(refreshFileTree).not.toHaveBeenCalled();
    });

    it("renders a grammatical cannot-preview message when kind is omitted", async () => {
      setupWorkspace({ selectedFile: "unknown" });
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockFetchResponse({ error: "Cannot preview file", code: "NOT_REGULAR_FILE" }, 415);

      render(<FileViewer />);

      await waitFor(() => {
        expect(screen.getByText("DevDeck cannot preview this item.")).toBeInTheDocument();
      });
      expect(screen.queryByText(/this item entries/i)).not.toBeInTheDocument();
    });
  });

  describe("4a. Markdown Enhancement", () => {
    it("4.1 — renders markdown with hljs-highlighted code blocks", async () => {
      setupWorkspace({ selectedFile: "README.md" });
      const mdContent = "# Hello\n\n```typescript\nconst x = 1;\n```";
      mockFetchResponse({
        content: mdContent,
        language: "markdown",
        size: mdContent.length,
        isBinary: false,
        path: "README.md",
        name: "README.md",
        mtime: 1000,
      });

      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByRole("article")).toBeInTheDocument();
      });
      // hljs adds class to code elements
      const article = screen.getByRole("article");
      expect(article.innerHTML).toContain("hljs");
    });

    it("4.4 — raw/preview toggle switches views", async () => {
      setupWorkspace({ selectedFile: "README.md" });
      mockFetchResponse({
        content: "# Hello",
        language: "markdown",
        size: 7,
        isBinary: false,
        path: "README.md",
        name: "README.md",
        mtime: 1000,
      });

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByRole("article")).toBeInTheDocument();
      });

      // Find and click the Raw toggle
      const rawButton = screen.getByRole("button", { name: /show raw source/i });
      expect(rawButton).toHaveAttribute("aria-pressed", "false");

      await user.click(rawButton);
      // Now should show raw code view (no article element)
      expect(screen.queryByRole("article")).not.toBeInTheDocument();
    });

    it("4.5 — toggle aria-pressed reflects state", async () => {
      setupWorkspace({ selectedFile: "README.md" });
      mockFetchResponse({
        content: "# Hello",
        language: "markdown",
        size: 7,
        isBinary: false,
        path: "README.md",
        name: "README.md",
        mtime: 1000,
      });

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByRole("article")).toBeInTheDocument();
      });

      const rawButton = screen.getByRole("button", { name: /show raw source/i });
      expect(rawButton).toHaveAttribute("aria-pressed", "false");

      await user.click(rawButton);

      // After click, button should switch to "Show preview" with aria-pressed=true
      const previewButton = screen.getByRole("button", { name: /show preview/i });
      expect(previewButton).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("4b. Diff View", () => {
    it("4.10 — shows tabs for modified file", async () => {
      setupWorkspace({
        selectedFile: "src/index.ts",
        fileTree: [
          {
            name: "src",
            path: "src",
            type: "directory",
            children: [
              { name: "index.ts", path: "src/index.ts", type: "file", status: "modified" },
            ],
          },
        ],
      });
      mockFetchResponse({
        content: "const x = 1;",
        language: "typescript",
        size: 12,
        isBinary: false,
        path: "src/index.ts",
        name: "index.ts",
        mtime: 1000,
      });

      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByText("File")).toBeInTheDocument();
      });
      expect(screen.getByText("Changes")).toBeInTheDocument();
    });

    it("4.11 — hides tabs for unmodified file", async () => {
      setupWorkspace({
        selectedFile: "src/index.ts",
        fileTree: [{ name: "index.ts", path: "src/index.ts", type: "file" }],
      });
      mockFetchResponse({
        content: "const x = 1;",
        language: "typescript",
        size: 12,
        isBinary: false,
        path: "src/index.ts",
        name: "index.ts",
        mtime: 1000,
      });

      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByText("src/index.ts")).toBeInTheDocument();
      });
      expect(screen.queryByText("Changes")).not.toBeInTheDocument();
    });

    it("4.12 — tab switching shows diff view", async () => {
      setupWorkspace({
        selectedFile: "src/index.ts",
        fileTree: [{ name: "index.ts", path: "src/index.ts", type: "file", status: "modified" }],
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1;",
            language: "typescript",
            size: 12,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 1000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByText("Changes")).toBeInTheDocument();
      });

      // Mock diff fetch
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ diff: "@@ -1 +1 @@\n-old\n+new" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await user.click(screen.getByText("Changes"));
      await waitFor(() => {
        expect(screen.getByTestId("diff-view")).toBeInTheDocument();
      });
    });
  });

  describe("4c. Edit Mode", () => {
    it("4.13 — edit button visible for text file", async () => {
      setupWorkspace({ selectedFile: "src/index.ts" });
      mockFetchResponse({
        content: "const x = 1;",
        language: "typescript",
        size: 12,
        isBinary: false,
        path: "src/index.ts",
        name: "index.ts",
        mtime: 1000,
      });

      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByLabelText("Edit file")).toBeInTheDocument();
      });
    });

    it("4.14 — edit button hidden for binary file", async () => {
      setupWorkspace({ selectedFile: "image.png" });
      mockFetchResponse({
        content: "",
        language: "binary",
        size: 1024,
        isBinary: true,
        path: "image.png",
        name: "image.png",
        mtime: 1000,
      });

      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByText("Binary file")).toBeInTheDocument();
      });
      expect(screen.queryByLabelText("Edit file")).not.toBeInTheDocument();
    });

    it("4.15 — clicking Edit shows textarea", async () => {
      setupWorkspace({ selectedFile: "src/index.ts" });
      mockFetchResponse({
        content: "const x = 1;",
        language: "typescript",
        size: 12,
        isBinary: false,
        path: "src/index.ts",
        name: "index.ts",
        mtime: 1000,
      });

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByLabelText("Edit file")).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText("Edit file"));
      await waitFor(() => {
        expect(screen.getByLabelText("File editor")).toBeInTheDocument();
      });
      expect(screen.getByLabelText("File editor")).toHaveValue("const x = 1;");
    });

    it("4.16 — dirty indicator appears when content modified", async () => {
      setupWorkspace({ selectedFile: "src/index.ts" });
      mockFetchResponse({
        content: "const x = 1;",
        language: "typescript",
        size: 12,
        isBinary: false,
        path: "src/index.ts",
        name: "index.ts",
        mtime: 1000,
      });

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByLabelText("Edit file")).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText("Edit file"));

      await waitFor(() => {
        expect(screen.getByLabelText("File editor")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("dirty-indicator")).not.toBeInTheDocument();

      const textarea = screen.getByLabelText("File editor");
      await user.type(textarea, "changed");
      expect(screen.getByTestId("dirty-indicator")).toBeInTheDocument();
    });

    it("4.17 — save calls PUT endpoint", async () => {
      setupWorkspace({ selectedFile: "src/index.ts" });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1;",
            language: "typescript",
            size: 12,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 1000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByLabelText("Edit file")).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText("Edit file"));

      await waitFor(() => {
        expect(screen.getByLabelText("File editor")).toBeInTheDocument();
      });

      // Make content dirty so Save is enabled
      await user.type(screen.getByLabelText("File editor"), " ");

      // Mock PUT response
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1; ",
            language: "typescript",
            size: 13,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 2000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      await user.click(screen.getByLabelText("Save file"));

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          "/api/files/content",
          expect.objectContaining({ method: "PUT" }),
        );
      });
    });

    it("4.18 — save success returns to preview mode", async () => {
      setupWorkspace({ selectedFile: "src/index.ts" });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1;",
            language: "typescript",
            size: 12,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 1000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByLabelText("Edit file")).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText("Edit file"));

      await waitFor(() => {
        expect(screen.getByLabelText("File editor")).toBeInTheDocument();
      });

      // Make content dirty so Save is enabled
      await user.type(screen.getByLabelText("File editor"), " ");

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1; ",
            language: "typescript",
            size: 13,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 2000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      await user.click(screen.getByLabelText("Save file"));

      await waitFor(() => {
        expect(screen.queryByLabelText("File editor")).not.toBeInTheDocument();
      });
      expect(toast.success).toHaveBeenCalledWith("File saved");
    });

    it("4.19 — save failure shows error toast", async () => {
      setupWorkspace({ selectedFile: "src/index.ts" });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1;",
            language: "typescript",
            size: 12,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 1000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByLabelText("Edit file")).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText("Edit file"));

      await waitFor(() => {
        expect(screen.getByLabelText("File editor")).toBeInTheDocument();
      });

      // Make content dirty so Save is enabled
      await user.type(screen.getByLabelText("File editor"), " ");

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await user.click(screen.getByLabelText("Save file"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Server error");
      });
      // Should still be in edit mode
      expect(screen.getByLabelText("File editor")).toBeInTheDocument();
    });

    it("T5: save success calls refreshFileTree exactly once after toast.success", async () => {
      const refreshFileTree = vi.fn().mockResolvedValue(undefined);
      setupWorkspace({ selectedFile: "src/index.ts", refreshFileTree });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1;",
            language: "typescript",
            size: 12,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 1000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByLabelText("Edit file")).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText("Edit file"));
      await waitFor(() => {
        expect(screen.getByLabelText("File editor")).toBeInTheDocument();
      });
      await user.type(screen.getByLabelText("File editor"), " ");

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1; ",
            language: "typescript",
            size: 13,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 2000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      await user.click(screen.getByLabelText("Save file"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("File saved");
      });
      expect(refreshFileTree).toHaveBeenCalledTimes(1);
    });

    it("T6a: save HTTP failure does NOT call refreshFileTree", async () => {
      const refreshFileTree = vi.fn().mockResolvedValue(undefined);
      setupWorkspace({ selectedFile: "src/index.ts", refreshFileTree });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1;",
            language: "typescript",
            size: 12,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 1000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByLabelText("Edit file")).toBeInTheDocument();
      });
      await user.click(screen.getByLabelText("Edit file"));
      await waitFor(() => {
        expect(screen.getByLabelText("File editor")).toBeInTheDocument();
      });
      await user.type(screen.getByLabelText("File editor"), " ");

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await user.click(screen.getByLabelText("Save file"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      expect(refreshFileTree).not.toHaveBeenCalled();
      expect(screen.getByLabelText("File editor")).toBeInTheDocument();
    });

    it("T6b: save network rejection does NOT call refreshFileTree", async () => {
      const refreshFileTree = vi.fn().mockResolvedValue(undefined);
      setupWorkspace({ selectedFile: "src/index.ts", refreshFileTree });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1;",
            language: "typescript",
            size: 12,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 1000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByLabelText("Edit file")).toBeInTheDocument();
      });
      await user.click(screen.getByLabelText("Edit file"));
      await waitFor(() => {
        expect(screen.getByLabelText("File editor")).toBeInTheDocument();
      });
      await user.type(screen.getByLabelText("File editor"), " ");

      fetchSpy.mockRejectedValueOnce(new Error("network"));

      await user.click(screen.getByLabelText("Save file"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      expect(refreshFileTree).not.toHaveBeenCalled();
      expect(screen.getByLabelText("File editor")).toBeInTheDocument();
    });

    it("5.4 — 409 conflict shows specific message", async () => {
      setupWorkspace({ selectedFile: "src/index.ts" });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "const x = 1;",
            language: "typescript",
            size: 12,
            isBinary: false,
            path: "src/index.ts",
            name: "index.ts",
            mtime: 1000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByLabelText("Edit file")).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText("Edit file"));

      await waitFor(() => {
        expect(screen.getByLabelText("File editor")).toBeInTheDocument();
      });

      // Make content dirty so Save is enabled
      await user.type(screen.getByLabelText("File editor"), " ");

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "File was modified externally", code: "CONFLICT" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await user.click(screen.getByLabelText("Save file"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "File was modified externally. Reload and try again.",
        );
      });
    });

    it("4.20 — discard with no changes returns immediately", async () => {
      setupWorkspace({ selectedFile: "src/index.ts" });
      mockFetchResponse({
        content: "const x = 1;",
        language: "typescript",
        size: 12,
        isBinary: false,
        path: "src/index.ts",
        name: "index.ts",
        mtime: 1000,
      });

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByLabelText("Edit file")).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText("Edit file"));
      await waitFor(() => {
        expect(screen.getByLabelText("File editor")).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText("Discard changes"));
      await waitFor(() => {
        expect(screen.queryByLabelText("File editor")).not.toBeInTheDocument();
      });
    });

    it("4.21 — discard with changes shows confirmation", async () => {
      setupWorkspace({ selectedFile: "src/index.ts" });
      mockFetchResponse({
        content: "const x = 1;",
        language: "typescript",
        size: 12,
        isBinary: false,
        path: "src/index.ts",
        name: "index.ts",
        mtime: 1000,
      });

      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByLabelText("Edit file")).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText("Edit file"));
      await waitFor(() => {
        expect(screen.getByLabelText("File editor")).toBeInTheDocument();
      });
      const textarea = screen.getByLabelText("File editor");
      await user.type(textarea, "changed");

      await user.click(screen.getByLabelText("Discard changes"));
      expect(confirmSpy).toHaveBeenCalledWith("Discard unsaved changes?");
      // Should still be in edit mode since confirm returned false
      expect(screen.getByLabelText("File editor")).toBeInTheDocument();

      confirmSpy.mockRestore();
    });
  });

  describe("Issue #60 Live Edit", () => {
    function renderMarkdownFile({
      selectedFile = "README.md",
      content = "# Before",
      language = "markdown",
      activeWorktree = null as string | null,
      refreshFileTree = vi.fn().mockResolvedValue(undefined),
    } = {}) {
      setupWorkspace({ selectedFile, activeWorktree, refreshFileTree });
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content,
            language,
            size: content.length,
            isBinary: false,
            path: selectedFile,
            name: selectedFile.split("/").pop() ?? selectedFile,
            mtime: 1000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      render(<FileViewer />);
      return { refreshFileTree, fetchSpy: vi.mocked(globalThis.fetch) };
    }

    it("shows the Live Edit button for .md files", async () => {
      renderMarkdownFile();

      expect(await screen.findByRole("button", { name: "Live Edit" })).toBeInTheDocument();
    });

    it("does not show the Live Edit button for .mdx files", async () => {
      renderMarkdownFile({ selectedFile: "README.mdx" });

      await waitFor(() => expect(screen.getByText("README.mdx")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: "Live Edit" })).not.toBeInTheDocument();
    });

    it("does not show the Live Edit button for non-markdown files", async () => {
      renderMarkdownFile({
        selectedFile: "src/index.ts",
        content: "const x = 1;",
        language: "typescript",
      });

      await waitFor(() => expect(screen.getByText("src/index.ts")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: "Live Edit" })).not.toBeInTheDocument();
    });

    it("entering Live Edit shows editor and markdown preview together", async () => {
      renderMarkdownFile({ content: "# Live Preview" });
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Live Edit" }));

      expect(screen.getByLabelText("File editor")).toHaveValue("# Live Preview");
      expect(screen.getByRole("region", { name: "Markdown preview" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Live Preview" })).toBeInTheDocument();
      expect(screen.getByTestId("live-edit-panel-group")).toHaveAttribute(
        "orientation",
        "horizontal",
      );
    });

    it("renders the Live Edit preview as read-only content", async () => {
      renderMarkdownFile();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Live Edit" }));

      const preview = screen.getByRole("region", { name: "Markdown preview" });
      expect(preview).not.toHaveAttribute("contenteditable", "true");
      expect(preview.querySelector("article")).not.toHaveAttribute("contenteditable", "true");
    });

    it("does not update the Live Edit preview before debounce", async () => {
      renderMarkdownFile({ content: "# Before" });
      const liveEditButton = await screen.findByRole("button", { name: "Live Edit" });
      vi.useFakeTimers();
      try {
        fireEvent.click(liveEditButton);

        fireEvent.change(screen.getByLabelText("File editor"), { target: { value: "# After" } });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(299);
        });

        expect(screen.getByRole("heading", { name: "Before" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "After" })).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("updates the Live Edit preview after debounce", async () => {
      renderMarkdownFile({ content: "# Before" });
      const liveEditButton = await screen.findByRole("button", { name: "Live Edit" });
      vi.useFakeTimers();
      try {
        fireEvent.click(liveEditButton);

        fireEvent.change(screen.getByLabelText("File editor"), { target: { value: "# After" } });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(300);
        });

        expect(screen.getByRole("heading", { name: "After" })).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("shows the dirty indicator after editing in Live Edit", async () => {
      renderMarkdownFile();
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Live Edit" }));
      await user.type(screen.getByLabelText("File editor"), " changed");

      expect(screen.getByTestId("dirty-indicator")).toBeInTheDocument();
    });

    it("saves Live Edit content, refreshes once, and exits Live Edit", async () => {
      const refreshFileTree = vi.fn().mockResolvedValue(undefined);
      const { fetchSpy } = renderMarkdownFile({
        content: "# Before",
        activeWorktree: ".trees/feat",
        refreshFileTree,
      });
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Live Edit" }));
      fireEvent.change(screen.getByLabelText("File editor"), { target: { value: "# Saved" } });
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "# Saved",
            language: "markdown",
            size: 7,
            isBinary: false,
            path: "README.md",
            name: "README.md",
            mtime: 2000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      await user.click(screen.getByLabelText("Save file"));

      await waitFor(() => expect(refreshFileTree).toHaveBeenCalledTimes(1));
      const putInit = fetchSpy.mock.calls[1][1] as RequestInit;
      expect(JSON.parse(String(putInit.body))).toMatchObject({
        slug: "test-project",
        path: "README.md",
        content: "# Saved",
        mtime: 1000,
        worktree: ".trees/feat",
      });
      expect(screen.queryByRole("region", { name: "Markdown preview" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("File editor")).not.toBeInTheDocument();
    });

    it("preserves Live Edit and edited content on 409 conflict", async () => {
      const { fetchSpy } = renderMarkdownFile({ content: "# Before" });
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Live Edit" }));
      fireEvent.change(screen.getByLabelText("File editor"), { target: { value: "# Conflict" } });
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "File was modified externally", code: "CONFLICT" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await user.click(screen.getByLabelText("Save file"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "File was modified externally. Reload and try again.",
        );
      });
      expect(screen.getByRole("region", { name: "Markdown preview" })).toBeInTheDocument();
      expect(screen.getByLabelText("File editor")).toHaveValue("# Conflict");
    });

    it("keeps dirty Live Edit open when discard is cancelled", async () => {
      renderMarkdownFile();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Live Edit" }));
      await user.type(screen.getByLabelText("File editor"), " changed");
      await user.click(screen.getByLabelText("Discard changes"));

      expect(confirmSpy).toHaveBeenCalledWith("Discard unsaved changes?");
      expect(screen.getByRole("region", { name: "Markdown preview" })).toBeInTheDocument();
      expect(screen.getByLabelText("File editor")).toBeInTheDocument();
    });

    it("exits dirty Live Edit when discard is confirmed", async () => {
      renderMarkdownFile();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Live Edit" }));
      await user.type(screen.getByLabelText("File editor"), " changed");
      await user.click(screen.getByLabelText("Discard changes"));

      expect(confirmSpy).toHaveBeenCalledWith("Discard unsaved changes?");
      await waitFor(() => {
        expect(screen.queryByRole("region", { name: "Markdown preview" })).not.toBeInTheDocument();
      });
      expect(screen.queryByLabelText("File editor")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Live Edit" })).toBeInTheDocument();
    });

    it("prompts before switching files in dirty Live Edit and restores the previous file when cancelled", async () => {
      const selectFileSpy = vi.fn();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = new URL(String(input), "http://localhost");
        const path = url.searchParams.get("path") ?? "README.md";
        const content = path === "docs/next.md" ? "# Next" : "# Before";
        return Promise.resolve(
          new Response(
            JSON.stringify({
              content,
              language: "markdown",
              size: content.length,
              isBinary: false,
              path,
              name: path.split("/").pop() ?? path,
              mtime: 1000,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      function SelectionHarness() {
        const [selectedFile, setSelectedFile] = useState("README.md");
        mockUseWorkspace.mockReturnValue({
          project: { slug: "test-project", name: "Test", path: "/test", source: "auto" as const },
          selectedFile,
          fileTree: [],
          expandedFolders: new Set<string>(),
          showFileViewer: true,
          showTerminal: true,
          fileTreeLoading: false,
          fileTreeRefreshing: false,
          setProject: vi.fn(),
          selectFile: (path: string | null) => {
            selectFileSpy(path);
            setSelectedFile(path);
          },
          toggleFolder: vi.fn(),
          toggleFileViewer: vi.fn(),
          toggleTerminal: vi.fn(),
          setFileTree: vi.fn(),
          setFileTreeLoading: vi.fn(),
          refreshFileTree: vi.fn().mockResolvedValue(undefined),
          loadDirectoryChildren: vi.fn().mockResolvedValue(undefined),
          fileTreeError: null,
          activeWorktree: null,
          worktreesSectionCollapsed: false,
          setActiveWorktree: vi.fn(),
          toggleWorktreesSection: vi.fn(),
          directoryLoading: new Set<string>(),
          directoryErrors: new Map<string, string>(),
        } as ReturnType<typeof useWorkspace>);

        return (
          <>
            <button type="button" onClick={() => setSelectedFile("docs/next.md")}>
              Switch file
            </button>
            <FileViewer />
          </>
        );
      }

      render(<SelectionHarness />);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Live Edit" }));
      fireEvent.change(screen.getByLabelText("File editor"), {
        target: { value: "# Unsaved changes" },
      });
      await user.click(screen.getByRole("button", { name: "Switch file" }));

      expect(confirmSpy).toHaveBeenCalledWith("Discard unsaved changes?");
      expect(selectFileSpy).toHaveBeenCalledWith("README.md");
      await waitFor(() => expect(screen.getByText("README.md")).toBeInTheDocument());
      expect(screen.getByRole("region", { name: "Markdown preview" })).toBeInTheDocument();
      expect(screen.getByLabelText("File editor")).toHaveValue("# Unsaved changes");
      expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining("docs%2Fnext.md"));
    });

    it("prompts before switching worktrees in dirty Live Edit and restores the previous worktree when cancelled", async () => {
      const setActiveWorktreeSpy = vi.fn();
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = new URL(String(input), "http://localhost");
        const worktree = url.searchParams.get("worktree");
        const content = worktree ? "# Worktree" : "# Before";
        return Promise.resolve(
          new Response(
            JSON.stringify({
              content,
              language: "markdown",
              size: content.length,
              isBinary: false,
              path: "README.md",
              name: "README.md",
              mtime: 1000,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      function SelectionHarness() {
        const [activeWorktree, updateActiveWorktree] = useState<string | null>(null);
        const setActiveWorktree = (path: string | null) => {
          setActiveWorktreeSpy(path);
          updateActiveWorktree(path);
        };
        mockUseWorkspace.mockReturnValue({
          project: { slug: "test-project", name: "Test", path: "/test", source: "auto" as const },
          selectedFile: "README.md",
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
          loadDirectoryChildren: vi.fn().mockResolvedValue(undefined),
          fileTreeError: null,
          activeWorktree,
          worktreesSectionCollapsed: false,
          setActiveWorktree,
          toggleWorktreesSection: vi.fn(),
          directoryLoading: new Set<string>(),
          directoryErrors: new Map<string, string>(),
        } as ReturnType<typeof useWorkspace>);

        return (
          <>
            <button type="button" onClick={() => setActiveWorktree(".trees/feat")}>
              Switch worktree
            </button>
            <FileViewer />
          </>
        );
      }

      render(<SelectionHarness />);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Live Edit" }));
      fireEvent.change(screen.getByLabelText("File editor"), {
        target: { value: "# Unsaved changes" },
      });
      await user.click(screen.getByRole("button", { name: "Switch worktree" }));

      expect(confirmSpy).toHaveBeenCalledWith("Discard unsaved changes?");
      await waitFor(() => expect(setActiveWorktreeSpy).toHaveBeenLastCalledWith(null));
      expect(screen.getByRole("region", { name: "Markdown preview" })).toBeInTheDocument();
      expect(screen.getByLabelText("File editor")).toHaveValue("# Unsaved changes");
      expect(
        fetchSpy.mock.calls.some(([input]) => String(input).includes("worktree=.trees%2Ffeat")),
      ).toBe(false);
    });

    it("prompts before switching files in dirty Live Edit and accepts the new file when confirmed", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = new URL(String(input), "http://localhost");
        const path = url.searchParams.get("path") ?? "README.md";
        const content = path === "docs/next.md" ? "# Next" : "# Before";
        return Promise.resolve(
          new Response(
            JSON.stringify({
              content,
              language: "markdown",
              size: content.length,
              isBinary: false,
              path,
              name: path.split("/").pop() ?? path,
              mtime: 1000,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      function SelectionHarness() {
        const [selectedFile, setSelectedFile] = useState("README.md");
        mockUseWorkspace.mockReturnValue({
          project: { slug: "test-project", name: "Test", path: "/test", source: "auto" as const },
          selectedFile,
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
          loadDirectoryChildren: vi.fn().mockResolvedValue(undefined),
          fileTreeError: null,
          activeWorktree: null,
          worktreesSectionCollapsed: false,
          setActiveWorktree: vi.fn(),
          toggleWorktreesSection: vi.fn(),
          directoryLoading: new Set<string>(),
          directoryErrors: new Map<string, string>(),
        } as ReturnType<typeof useWorkspace>);

        return (
          <>
            <button type="button" onClick={() => setSelectedFile("docs/next.md")}>
              Switch file
            </button>
            <FileViewer />
          </>
        );
      }

      render(<SelectionHarness />);
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Live Edit" }));
      fireEvent.change(screen.getByLabelText("File editor"), {
        target: { value: "# Unsaved changes" },
      });
      await user.click(screen.getByRole("button", { name: "Switch file" }));

      expect(confirmSpy).toHaveBeenCalledWith("Discard unsaved changes?");
      await waitFor(() => expect(screen.getByText("docs/next.md")).toBeInTheDocument());
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: "Next" })).toBeInTheDocument(),
      );
      expect(screen.queryByRole("region", { name: "Markdown preview" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("File editor")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Live Edit" })).toBeInTheDocument();
    });
  });

  describe("Issue #64 Edit in Preview", () => {
    function renderPreviewMarkdownFile({
      selectedFile = "README.md",
      content = "# Before",
      language = "markdown",
      isBinary = false,
      fileTree = [] as ReturnType<typeof useWorkspace>["fileTree"],
      refreshFileTree = vi.fn().mockResolvedValue(undefined),
    } = {}) {
      setupWorkspace({ selectedFile, fileTree, refreshFileTree });
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content,
            language,
            size: content.length,
            isBinary,
            path: selectedFile,
            name: selectedFile.split("/").pop() ?? selectedFile,
            mtime: 1000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      render(<FileViewer />);
      return { refreshFileTree, fetchSpy: vi.mocked(globalThis.fetch) };
    }

    it("shows Edit in Preview for non-binary .md files", async () => {
      renderPreviewMarkdownFile();

      expect(await screen.findByRole("button", { name: "Edit in Preview" })).toBeInTheDocument();
    });

    it("hides Edit in Preview for .mdx, non-markdown, binary, and changes view", async () => {
      renderPreviewMarkdownFile({ selectedFile: "README.mdx" });
      await waitFor(() => expect(screen.getByText("README.mdx")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: "Edit in Preview" })).not.toBeInTheDocument();

      cleanup();
      vi.restoreAllMocks();
      renderPreviewMarkdownFile({
        selectedFile: "src/index.ts",
        content: "const x = 1;",
        language: "typescript",
      });
      await waitFor(() => expect(screen.getByText("src/index.ts")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: "Edit in Preview" })).not.toBeInTheDocument();

      cleanup();
      vi.restoreAllMocks();
      renderPreviewMarkdownFile({
        selectedFile: "README.md",
        content: "",
        language: "binary",
        isBinary: true,
      });
      await waitFor(() => expect(screen.getByText("Binary file")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: "Edit in Preview" })).not.toBeInTheDocument();

      cleanup();
      vi.restoreAllMocks();
      const fileTree = [
        {
          name: "README.md",
          path: "README.md",
          type: "file" as const,
          status: "modified" as const,
        },
      ];
      const { fetchSpy } = renderPreviewMarkdownFile({ fileTree });
      const user = userEvent.setup();
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ diff: "diff" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      await user.click(await screen.findByText("Changes"));
      await waitFor(() => expect(screen.getByTestId("diff-view")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: "Edit in Preview" })).not.toBeInTheDocument();
    });

    it("enters a single-pane editable rendered preview", async () => {
      renderPreviewMarkdownFile({ content: "# Rich Preview" });
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Edit in Preview" }));

      const editor = screen.getByRole("textbox", { name: "Editable markdown preview" });
      expect(editor).toHaveAttribute("contenteditable", "true");
      expect(screen.getByRole("heading", { name: "Rich Preview" })).toBeInTheDocument();
      expect(screen.queryByLabelText("File editor")).not.toBeInTheDocument();
    });

    it("marks the file dirty after editing inside the preview", async () => {
      renderPreviewMarkdownFile({ content: "# Before" });
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Edit in Preview" }));
      const editor = screen.getByRole("textbox", { name: "Editable markdown preview" });
      editor.innerHTML = "<h1>After</h1>";
      fireEvent.input(editor);

      expect(screen.getByTestId("dirty-indicator")).toBeInTheDocument();
    });

    it("pastes clipboard HTML as plain text instead of live DOM nodes", async () => {
      renderPreviewMarkdownFile({ content: "# Before" });
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Edit in Preview" }));
      const editor = screen.getByRole("textbox", { name: "Editable markdown preview" });
      fireEvent.paste(editor, {
        clipboardData: {
          getData: (type: string) =>
            type === "text/plain"
              ? '<img src="x" onerror="alert(1)">safe'
              : '<img src="x" onerror="alert(1)">unsafe',
        },
      });

      expect(editor.querySelector("img")).toBeNull();
      expect(editor.textContent).toContain('&lt;img src="x" onerror="alert(1)"&gt;safe');
      expect(screen.getByTestId("dirty-indicator")).toBeInTheDocument();
    });

    it("renders Mermaid diagrams as read-only with a source edit hint in Edit in Preview", async () => {
      mockMermaidRender.mockResolvedValue({ svg: '<svg data-testid="mermaid-svg">diagram</svg>' });
      renderPreviewMarkdownFile({
        content: "# Diagram\n\n```mermaid\ngraph TD\n  A --> B\n```",
      });
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Edit in Preview" }));
      const editor = screen.getByRole("textbox", { name: "Editable markdown preview" });

      await waitFor(() => {
        const mermaidBlock = editor.querySelector(".mermaid-block");
        expect(mermaidBlock).toHaveAttribute("contenteditable", "false");
      });
      expect(screen.getByText(MERMAID_EDIT_HINT)).toBeInTheDocument();
      expect(editor.querySelector("svg")).not.toBeNull();
    });

    it("saves serialized markdown, refreshes, and exits Edit in Preview", async () => {
      const refreshFileTree = vi.fn().mockResolvedValue(undefined);
      const { fetchSpy } = renderPreviewMarkdownFile({ content: "# Before", refreshFileTree });
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Edit in Preview" }));
      const editor = screen.getByRole("textbox", { name: "Editable markdown preview" });
      editor.innerHTML = `<h1>Saved</h1><pre class="hljs"><code class="hljs language-typescript"><span class="hljs-keyword">const</span> x = 1;</code></pre>`;
      fireEvent.input(editor);
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: "# Saved\n\n```typescript\nconst x = 1;\n```\n",
            language: "markdown",
            size: 38,
            isBinary: false,
            path: "README.md",
            name: "README.md",
            mtime: 2000,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      await user.click(screen.getByLabelText("Save file"));

      await waitFor(() => expect(refreshFileTree).toHaveBeenCalledTimes(1));
      const putInit = fetchSpy.mock.calls[1][1] as RequestInit;
      const body = JSON.parse(String(putInit.body));
      expect(body.content).toBe("# Saved\n\n```typescript\nconst x = 1;\n```\n");
      expect(body.content).not.toContain("<span");
      expect(body.content).not.toContain("hljs");
      expect(
        screen.queryByRole("textbox", { name: "Editable markdown preview" }),
      ).not.toBeInTheDocument();
    });

    it("keeps Edit in Preview active with user edits on 409 conflict", async () => {
      const { fetchSpy } = renderPreviewMarkdownFile({ content: "# Before" });
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Edit in Preview" }));
      const editor = screen.getByRole("textbox", { name: "Editable markdown preview" });
      editor.innerHTML = "<h1>Conflict</h1>";
      fireEvent.input(editor);
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "File was modified externally", code: "CONFLICT" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await user.click(screen.getByLabelText("Save file"));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "File was modified externally. Reload and try again.",
        );
      });
      expect(
        screen.getByRole("textbox", { name: "Editable markdown preview" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Conflict" })).toBeInTheDocument();
    });

    it("discard exits clean Edit in Preview without confirmation and prompts for dirty edits", async () => {
      renderPreviewMarkdownFile({ content: "# Before" });
      const confirmSpy = vi.spyOn(window, "confirm");
      const user = userEvent.setup();

      await user.click(await screen.findByRole("button", { name: "Edit in Preview" }));
      await user.click(screen.getByLabelText("Discard changes"));
      expect(confirmSpy).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(
          screen.queryByRole("textbox", { name: "Editable markdown preview" }),
        ).not.toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Edit in Preview" }));
      const editor = screen.getByRole("textbox", { name: "Editable markdown preview" });
      editor.innerHTML = "<h1>Dirty</h1>";
      fireEvent.input(editor);
      confirmSpy.mockReturnValueOnce(false);
      await user.click(screen.getByLabelText("Discard changes"));
      expect(
        screen.getByRole("textbox", { name: "Editable markdown preview" }),
      ).toBeInTheDocument();

      confirmSpy.mockReturnValueOnce(true);
      await user.click(screen.getByLabelText("Discard changes"));
      await waitFor(() =>
        expect(
          screen.queryByRole("textbox", { name: "Editable markdown preview" }),
        ).not.toBeInTheDocument(),
      );
    });

    it("prompts before dirty Edit in Preview file switches and restores when cancelled", async () => {
      const selectFileSpy = vi.fn();
      vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
        const url = new URL(String(input), "http://localhost");
        const path = url.searchParams.get("path") ?? "README.md";
        const content = path === "docs/next.md" ? "# Next" : "# Before";
        return Promise.resolve(
          new Response(
            JSON.stringify({
              content,
              language: "markdown",
              size: content.length,
              isBinary: false,
              path,
              name: path.split("/").pop() ?? path,
              mtime: 1000,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      });
      vi.spyOn(window, "confirm").mockReturnValue(false);

      function SelectionHarness() {
        const [selectedFile, setSelectedFile] = useState("README.md");
        mockUseWorkspace.mockReturnValue({
          project: { slug: "test-project", name: "Test", path: "/test", source: "auto" as const },
          selectedFile,
          fileTree: [],
          expandedFolders: new Set<string>(),
          showFileViewer: true,
          showTerminal: true,
          fileTreeLoading: false,
          fileTreeRefreshing: false,
          setProject: vi.fn(),
          selectFile: (path: string | null) => {
            selectFileSpy(path);
            setSelectedFile(path);
          },
          toggleFolder: vi.fn(),
          toggleFileViewer: vi.fn(),
          toggleTerminal: vi.fn(),
          setFileTree: vi.fn(),
          setFileTreeLoading: vi.fn(),
          refreshFileTree: vi.fn().mockResolvedValue(undefined),
          loadDirectoryChildren: vi.fn().mockResolvedValue(undefined),
          fileTreeError: null,
          activeWorktree: null,
          worktreesSectionCollapsed: false,
          setActiveWorktree: vi.fn(),
          toggleWorktreesSection: vi.fn(),
          directoryLoading: new Set<string>(),
          directoryErrors: new Map<string, string>(),
        } as ReturnType<typeof useWorkspace>);

        return (
          <>
            <button type="button" onClick={() => setSelectedFile("docs/next.md")}>
              Switch file
            </button>
            <FileViewer />
          </>
        );
      }

      render(<SelectionHarness />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "Edit in Preview" }));
      const editor = screen.getByRole("textbox", { name: "Editable markdown preview" });
      editor.innerHTML = "<h1>Unsaved</h1>";
      fireEvent.input(editor);
      await user.click(screen.getByRole("button", { name: "Switch file" }));

      expect(selectFileSpy).toHaveBeenCalledWith("README.md");
      expect(
        screen.getByRole("textbox", { name: "Editable markdown preview" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Unsaved" })).toBeInTheDocument();
    });
  });

  describe("4d. Mermaid Rendering", () => {
    const mermaidMd = "# Hello\n\n```mermaid\ngraph TD\n  A --> B\n```";
    const mermaidFileData = {
      content: mermaidMd,
      language: "markdown",
      size: mermaidMd.length,
      isBinary: false,
      path: "README.md",
      name: "README.md",
      mtime: 1000,
    };

    beforeEach(() => {
      mockMermaidRender.mockReset();
      mockMermaidInitialize.mockReset();
      mockMermaidRender.mockResolvedValue({
        svg: '<svg data-testid="mermaid-svg">diagram</svg>',
      });
    });

    it("mermaid placeholder survives sanitization", async () => {
      // Prevent mermaid from replacing innerHTML so we can check the placeholder
      mockMermaidRender.mockImplementation(() => new Promise(() => {}));
      setupWorkspace({ selectedFile: "README.md" });
      mockFetchResponse(mermaidFileData);

      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByRole("article")).toBeInTheDocument();
      });

      const article = screen.getByRole("article");
      const mermaidBlock = article.querySelector("[data-mermaid-source]");
      expect(mermaidBlock).not.toBeNull();
      expect(mermaidBlock?.classList.contains("mermaid-block")).toBe(true);
      // data-mermaid-source is base64-encoded; decode with TextDecoder to match implementation
      const encoded = mermaidBlock?.getAttribute("data-mermaid-source") ?? "";
      const binString = atob(encoded);
      const bytes = Uint8Array.from(binString, (c) => c.codePointAt(0)!);
      const decoded = new TextDecoder().decode(bytes);
      expect(decoded).toContain("graph TD");
    });

    it("mermaid renders SVG diagram", async () => {
      setupWorkspace({ selectedFile: "README.md" });
      mockFetchResponse(mermaidFileData);

      render(<FileViewer />);
      await waitFor(() => {
        const article = screen.getByRole("article");
        const svg = article.querySelector("svg");
        return expect(svg).not.toBeNull();
      });

      expect(mockMermaidInitialize).toHaveBeenCalledWith(
        expect.objectContaining({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "dark",
        }),
      );
      expect(mockMermaidRender).toHaveBeenCalled();
    });

    it("invalid mermaid syntax shows inline error", async () => {
      const invalidMd = "# Test\n\n```mermaid\ninvalid!!!syntax\n```";
      setupWorkspace({ selectedFile: "README.md" });
      mockFetchResponse({
        ...mermaidFileData,
        content: invalidMd,
        size: invalidMd.length,
      });

      mockMermaidRender.mockRejectedValue(new Error("Parse error"));

      render(<FileViewer />);
      await waitFor(() => {
        const article = screen.getByRole("article");
        const errorEl = article.querySelector(".mermaid-error");
        return expect(errorEl).not.toBeNull();
      });

      const article = screen.getByRole("article");
      const errorEl = article.querySelector(".mermaid-error");
      expect(errorEl?.textContent).toContain("Parse error");
      expect(errorEl?.querySelector("pre")).not.toBeNull();
    });

    it("theme mapping — dark theme uses mermaid dark theme", async () => {
      mockUseTheme.mockReturnValue({
        theme: "dark",
        setTheme: vi.fn(),
        toggleTheme: vi.fn(),
      });
      setupWorkspace({ selectedFile: "README.md" });
      mockFetchResponse(mermaidFileData);

      render(<FileViewer />);
      await waitFor(() => {
        expect(mockMermaidInitialize).toHaveBeenCalled();
      });

      expect(mockMermaidInitialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "dark" }),
      );
    });

    it("theme mapping — light theme uses mermaid default theme", async () => {
      mockUseTheme.mockReturnValue({
        theme: "light",
        setTheme: vi.fn(),
        toggleTheme: vi.fn(),
      });
      setupWorkspace({ selectedFile: "README.md" });
      mockFetchResponse(mermaidFileData);

      render(<FileViewer />);
      await waitFor(() => {
        expect(mockMermaidInitialize).toHaveBeenCalled();
      });

      expect(mockMermaidInitialize).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "default" }),
      );
    });

    it("raw mode shows mermaid source as text", async () => {
      setupWorkspace({ selectedFile: "README.md" });
      mockFetchResponse(mermaidFileData);

      render(<FileViewer />);
      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByRole("article")).toBeInTheDocument();
      });

      const rawButton = screen.getByRole("button", { name: /show raw source/i });
      await user.click(rawButton);

      expect(screen.queryByRole("article")).not.toBeInTheDocument();
      // No SVG diagrams in raw mode
      expect(document.querySelector("svg[data-testid='mermaid-svg']")).toBeNull();
    });

    it("non-mermaid code blocks are unaffected", async () => {
      const tsContent = "# Hello\n\n```typescript\nconst x = 1;\n```";
      setupWorkspace({ selectedFile: "README.md" });
      mockFetchResponse({
        content: tsContent,
        language: "markdown",
        size: tsContent.length,
        isBinary: false,
        path: "README.md",
        name: "README.md",
        mtime: 1000,
      });

      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByRole("article")).toBeInTheDocument();
      });

      const article = screen.getByRole("article");
      expect(article.innerHTML).toContain("hljs");
      expect(article.querySelector("[data-mermaid-source]")).toBeNull();
    });

    it("multiple mermaid blocks in one document", async () => {
      const multiMd =
        "# Test\n\n```mermaid\ngraph TD\n  A --> B\n```\n\n```mermaid\nsequenceDiagram\n  A->>B: Hi\n```";
      setupWorkspace({ selectedFile: "README.md" });
      mockFetchResponse({
        ...mermaidFileData,
        content: multiMd,
        size: multiMd.length,
      });

      mockMermaidRender
        .mockResolvedValueOnce({ svg: '<svg class="mermaid-1">diagram1</svg>' })
        .mockResolvedValueOnce({ svg: '<svg class="mermaid-2">diagram2</svg>' });

      render(<FileViewer />);
      await waitFor(() => {
        const article = screen.getByRole("article");
        return expect(article.querySelectorAll("svg").length).toBe(2);
      });

      expect(mockMermaidRender).toHaveBeenCalledTimes(2);
    });

    it("no mermaid import when no mermaid blocks present", async () => {
      const plainMd = "# Just a heading\n\nSome text";
      setupWorkspace({ selectedFile: "README.md" });
      mockFetchResponse({
        content: plainMd,
        language: "markdown",
        size: plainMd.length,
        isBinary: false,
        path: "README.md",
        name: "README.md",
        mtime: 1000,
      });

      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByRole("article")).toBeInTheDocument();
      });

      // mermaid.initialize should not have been called since there are no mermaid blocks
      expect(mockMermaidInitialize).not.toHaveBeenCalled();
    });
  });

  describe("4e. Excalidraw Rendering", () => {
    const validScene = JSON.stringify({
      type: "excalidraw",
      version: 2,
      elements: [{ id: "1", type: "rectangle", x: 0, y: 0, width: 100, height: 50 }],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {
        img1: { id: "img1", dataURL: "data:image/png;base64,abc", mimeType: "image/png" },
      },
    });
    const excalidrawFileData = {
      content: validScene,
      language: "excalidraw",
      size: validScene.length,
      isBinary: false,
      path: "diagram.excalidraw",
      name: "diagram.excalidraw",
      mtime: 1000,
    };

    beforeEach(() => {
      mockExcalidrawProps.mockReset();
    });

    it("T-EX-1 valid scene renders Excalidraw component", async () => {
      setupWorkspace({ selectedFile: "diagram.excalidraw" });
      mockFetchResponse(excalidrawFileData);
      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByTestId("excalidraw-renderer")).toBeInTheDocument();
      });
      expect(screen.queryByRole("article")).not.toBeInTheDocument();
    });

    it("T-EX-2 invalid JSON shows inline error", async () => {
      setupWorkspace({ selectedFile: "bad.excalidraw" });
      mockFetchResponse({
        ...excalidrawFileData,
        content: "{ not valid json",
        path: "bad.excalidraw",
        name: "bad.excalidraw",
      });
      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByText("Invalid Excalidraw file")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("excalidraw-renderer")).not.toBeInTheDocument();
    });

    it("T-EX-3 missing elements shows validation error", async () => {
      const noElements = JSON.stringify({ type: "excalidraw", version: 2 });
      setupWorkspace({ selectedFile: "no-elements.excalidraw" });
      mockFetchResponse({
        ...excalidrawFileData,
        content: noElements,
        path: "no-elements.excalidraw",
        name: "no-elements.excalidraw",
      });
      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByText("Invalid Excalidraw file")).toBeInTheDocument();
      });
      expect(screen.getByText(/missing or invalid 'elements'/)).toBeInTheDocument();
      expect(screen.queryByTestId("excalidraw-renderer")).not.toBeInTheDocument();
    });

    it("T-EX-4 raw mode shows source, not renderer", async () => {
      setupWorkspace({ selectedFile: "diagram.excalidraw" });
      mockFetchResponse(excalidrawFileData);
      render(<FileViewer />);
      const user = userEvent.setup();
      await waitFor(() => {
        expect(screen.getByTestId("excalidraw-renderer")).toBeInTheDocument();
      });
      const rawButton = screen.getByRole("button", { name: /show raw source/i });
      await user.click(rawButton);
      expect(screen.queryByTestId("excalidraw-renderer")).not.toBeInTheDocument();
    });

    it("T-EX-5 dark theme passes theme='dark'", async () => {
      mockUseTheme.mockReturnValue({ theme: "dark", setTheme: vi.fn(), toggleTheme: vi.fn() });
      setupWorkspace({ selectedFile: "diagram.excalidraw" });
      mockFetchResponse(excalidrawFileData);
      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByTestId("excalidraw-renderer")).toBeInTheDocument();
      });
      expect(mockExcalidrawProps).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
    });

    it("T-EX-6 light theme passes theme='light'", async () => {
      mockUseTheme.mockReturnValue({ theme: "light", setTheme: vi.fn(), toggleTheme: vi.fn() });
      setupWorkspace({ selectedFile: "diagram.excalidraw" });
      mockFetchResponse(excalidrawFileData);
      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByTestId("excalidraw-renderer")).toBeInTheDocument();
      });
      expect(mockExcalidrawProps).toHaveBeenCalledWith(expect.objectContaining({ theme: "light" }));
    });

    it("T-EX-7 files field is passed to initialData", async () => {
      setupWorkspace({ selectedFile: "diagram.excalidraw" });
      mockFetchResponse(excalidrawFileData);
      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByTestId("excalidraw-renderer")).toBeInTheDocument();
      });
      expect(mockExcalidrawProps).toHaveBeenCalledWith(
        expect.objectContaining({
          initialData: expect.objectContaining({
            files: expect.objectContaining({ img1: expect.objectContaining({ id: "img1" }) }),
          }),
        }),
      );
    });

    it("T-EX-8 edit mode shows textarea, not renderer", async () => {
      setupWorkspace({ selectedFile: "diagram.excalidraw" });
      mockFetchResponse(excalidrawFileData);
      render(<FileViewer />);
      const user = userEvent.setup();
      await waitFor(() => {
        expect(screen.getByTestId("excalidraw-renderer")).toBeInTheDocument();
      });
      const editButton = screen.getByRole("button", { name: /edit file/i });
      await user.click(editButton);
      expect(screen.getByLabelText("File editor")).toBeInTheDocument();
      expect(screen.queryByTestId("excalidraw-renderer")).not.toBeInTheDocument();
    });

    it("T-EX-9 markdown files still render as markdown, not excalidraw", async () => {
      setupWorkspace({ selectedFile: "README.md" });
      mockFetchResponse({
        content: "# Hello",
        language: "markdown",
        size: 7,
        isBinary: false,
        path: "README.md",
        name: "README.md",
        mtime: 1000,
      });
      render(<FileViewer />);
      await waitFor(() => {
        expect(screen.getByRole("article")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("excalidraw-renderer")).not.toBeInTheDocument();
    });
  });
});
