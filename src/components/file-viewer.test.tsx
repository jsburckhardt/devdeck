import type React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  it("shows placeholder when no file is selected", () => {
    setupWorkspace({ selectedFile: null });
    render(<FileViewer />);
    expect(screen.getByText("Select a file to view its contents")).toBeInTheDocument();
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
});
