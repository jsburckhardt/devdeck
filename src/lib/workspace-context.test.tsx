import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";
import { OpenProjectsProvider, useOpenProjects } from "./open-projects-context";
import type { FileNode, PerProjectWorkspaceState } from "./types";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => "/",
}));

const cachedState: PerProjectWorkspaceState = {
  selectedFile: "main.ts",
  expandedFolders: ["src", "src/lib"],
  showExplorer: false,
  showFileViewer: false,
  showTerminal: false,
  fileTree: [{ name: "main.ts", path: "main.ts", type: "file", kind: "regular-file" as const }],
};

// Consumer component to read workspace state
function WorkspaceConsumer({
  onState,
}: {
  onState: (state: ReturnType<typeof useWorkspace>) => void;
}) {
  const state = useWorkspace();
  onState(state);
  return (
    <div>
      <span data-testid="selected-file">{state.selectedFile ?? "null"}</span>
      <span data-testid="show-explorer">{String(state.showExplorer)}</span>
      <span data-testid="show-file-viewer">{String(state.showFileViewer)}</span>
      <span data-testid="show-terminal">{String(state.showTerminal)}</span>
      <span data-testid="expanded-count">{state.expandedFolders.size}</span>
    </div>
  );
}

// Helper to setup cache before rendering workspace
function CacheSetup({
  slug,
  state,
  children,
}: {
  slug: string;
  state: PerProjectWorkspaceState;
  children: React.ReactNode;
}) {
  const { saveWorkspaceState } = useOpenProjects();
  saveWorkspaceState(slug, state);
  return <>{children}</>;
}

describe("WorkspaceProvider with slug integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve([]),
      ok: true,
    } as Response);
  });

  it("T15: state is saved to cache on unmount", async () => {
    let wsState: ReturnType<typeof useWorkspace>;
    let restoreFn: (slug: string) => PerProjectWorkspaceState | undefined;

    function OpenProjectsConsumer({ children }: { children: React.ReactNode }) {
      const ctx = useOpenProjects();
      // Store the restore function via effect to avoid lint error
      useEffect(() => {
        restoreFn = ctx.restoreWorkspaceState;
      });
      return <>{children}</>;
    }

    const { unmount } = render(
      <OpenProjectsProvider>
        <OpenProjectsConsumer>
          <WorkspaceProvider slug="proj-a">
            <WorkspaceConsumer
              onState={(s) => {
                wsState = s;
              }}
            />
          </WorkspaceProvider>
        </OpenProjectsConsumer>
      </OpenProjectsProvider>,
    );

    // Modify some state
    await act(async () => {
      wsState!.selectFile("test.ts");
      wsState!.toggleFolder("src");
      wsState!.toggleExplorer();
    });

    unmount();

    const restored = restoreFn!("proj-a");
    expect(restored).toBeDefined();
    expect(restored!.selectedFile).toBe("test.ts");
    expect(restored!.expandedFolders).toContain("src");
    expect(restored!.showExplorer).toBe(false);
  });

  it("Issue #69 TP1: all-hidden cached visibility normalizes to Terminal-only", async () => {
    render(
      <OpenProjectsProvider>
        <CacheSetup slug="proj-a" state={cachedState}>
          <WorkspaceProvider slug="proj-a">
            <WorkspaceConsumer onState={() => {}} />
          </WorkspaceProvider>
        </CacheSetup>
      </OpenProjectsProvider>,
    );

    expect(screen.getByTestId("selected-file").textContent).toBe("main.ts");
    expect(screen.getByTestId("show-explorer").textContent).toBe("false");
    expect(screen.getByTestId("show-file-viewer").textContent).toBe("false");
    expect(screen.getByTestId("show-terminal").textContent).toBe("true");
    expect(screen.getByTestId("expanded-count").textContent).toBe("2");
  });

  it.each([
    {
      label: "Terminal-only",
      visibility: { showExplorer: false, showFileViewer: false, showTerminal: true },
    },
    {
      label: "Explorer-only",
      visibility: { showExplorer: true, showFileViewer: false, showTerminal: false },
    },
    {
      label: "File Preview-only",
      visibility: { showExplorer: false, showFileViewer: true, showTerminal: false },
    },
    {
      label: "Explorer + File Preview",
      visibility: { showExplorer: true, showFileViewer: true, showTerminal: false },
    },
    {
      label: "Explorer + Terminal",
      visibility: { showExplorer: true, showFileViewer: false, showTerminal: true },
    },
    {
      label: "File Preview + Terminal",
      visibility: { showExplorer: false, showFileViewer: true, showTerminal: true },
    },
    {
      label: "all panels",
      visibility: { showExplorer: true, showFileViewer: true, showTerminal: true },
    },
  ] as const)("Issue #69 TP1: preserves valid cached visibility state $label", ({ visibility }) => {
    const validCachedState: PerProjectWorkspaceState = {
      selectedFile: null,
      expandedFolders: [],
      ...visibility,
      fileTree: [],
    };

    render(
      <OpenProjectsProvider>
        <CacheSetup slug="proj-a" state={validCachedState}>
          <WorkspaceProvider slug="proj-a">
            <WorkspaceConsumer onState={() => {}} />
          </WorkspaceProvider>
        </CacheSetup>
      </OpenProjectsProvider>,
    );

    expect(screen.getByTestId("show-explorer").textContent).toBe(String(visibility.showExplorer));
    expect(screen.getByTestId("show-file-viewer").textContent).toBe(
      String(visibility.showFileViewer),
    );
    expect(screen.getByTestId("show-terminal").textContent).toBe(String(visibility.showTerminal));
  });

  it("T17: default state is used when no cache exists", () => {
    render(
      <OpenProjectsProvider>
        <WorkspaceProvider slug="new-proj">
          <WorkspaceConsumer onState={() => {}} />
        </WorkspaceProvider>
      </OpenProjectsProvider>,
    );

    expect(screen.getByTestId("selected-file").textContent).toBe("null");
    expect(screen.getByTestId("show-explorer").textContent).toBe("true");
    expect(screen.getByTestId("show-file-viewer").textContent).toBe("true");
    expect(screen.getByTestId("show-terminal").textContent).toBe("true");
    expect(screen.getByTestId("expanded-count").textContent).toBe("0");
  });

  it("Issue #59 TP2: toggleExplorer flips Explorer visibility", async () => {
    let wsState: ReturnType<typeof useWorkspace>;

    render(
      <OpenProjectsProvider>
        <WorkspaceProvider slug="proj-a">
          <WorkspaceConsumer
            onState={(s) => {
              wsState = s;
            }}
          />
        </WorkspaceProvider>
      </OpenProjectsProvider>,
    );

    expect(screen.getByTestId("show-explorer").textContent).toBe("true");

    await act(async () => {
      wsState!.toggleExplorer();
    });
    expect(screen.getByTestId("show-explorer").textContent).toBe("false");

    await act(async () => {
      wsState!.toggleExplorer();
    });
    expect(screen.getByTestId("show-explorer").textContent).toBe("true");
  });

  it("Issue #59 TP4: cached state missing showExplorer defaults to true", () => {
    const legacyCachedState: PerProjectWorkspaceState = {
      selectedFile: "legacy.ts",
      expandedFolders: [],
      showFileViewer: true,
      showTerminal: true,
      fileTree: [],
    };

    render(
      <OpenProjectsProvider>
        <CacheSetup slug="proj-a" state={legacyCachedState}>
          <WorkspaceProvider slug="proj-a">
            <WorkspaceConsumer onState={() => {}} />
          </WorkspaceProvider>
        </CacheSetup>
      </OpenProjectsProvider>,
    );

    expect(screen.getByTestId("show-explorer").textContent).toBe("true");
  });

  it("T18: state round-trip — modify, unmount, remount, verify restored", async () => {
    let wsState: ReturnType<typeof useWorkspace>;

    function App({ showWorkspace }: { showWorkspace: boolean }) {
      return (
        <OpenProjectsProvider>
          {showWorkspace && (
            <WorkspaceProvider slug="proj-a">
              <WorkspaceConsumer
                onState={(s) => {
                  wsState = s;
                }}
              />
            </WorkspaceProvider>
          )}
        </OpenProjectsProvider>
      );
    }

    const { rerender } = render(<App showWorkspace={true} />);

    // Modify state
    await act(async () => {
      wsState!.selectFile("index.ts");
      wsState!.toggleFolder("components");
      wsState!.toggleTerminal(); // turn off
    });

    // Unmount workspace (saves state)
    rerender(<App showWorkspace={false} />);

    // Remount workspace (should restore)
    rerender(<App showWorkspace={true} />);

    expect(screen.getByTestId("selected-file").textContent).toBe("index.ts");
    expect(screen.getByTestId("show-terminal").textContent).toBe("false");
    expect(screen.getByTestId("expanded-count").textContent).toBe("1");
  });
});

describe("WorkspaceProvider.refreshFileTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  type FetchInit = { cache?: RequestCache } | undefined;

  function renderHarness(opts: { withProject: boolean }) {
    const captured: { state: ReturnType<typeof useWorkspace> | null } = { state: null };

    function Probe() {
      const ws = useWorkspace();
      useEffect(() => {
        captured.state = ws;
      });
      return (
        <div>
          <span data-testid="refreshing">{String(ws.fileTreeRefreshing)}</span>
          <span data-testid="loading">{String(ws.fileTreeLoading)}</span>
          <span data-testid="tree-len">{ws.fileTree.length}</span>
          <span data-testid="file-tree-error">{ws.fileTreeError ?? ""}</span>
          <span data-testid="directory-loading">{Array.from(ws.directoryLoading).join(",")}</span>
          <span data-testid="directory-errors">
            {Array.from(ws.directoryErrors.entries())
              .map(([path, error]) => `${path}:${error}`)
              .join(",")}
          </span>
          <span data-testid="tree-json">{JSON.stringify(ws.fileTree)}</span>
          <span data-testid="selected-json">{ws.selectedFile ?? ""}</span>
          <span data-testid="expanded-json">{Array.from(ws.expandedFolders).join(",")}</span>
          <span data-testid="active-worktree">{ws.activeWorktree ?? "root"}</span>
          <span data-testid="sync-status">{ws.fileTreeSyncStatus}</span>
          <span data-testid="sync-error">{ws.fileTreeSyncError?.code ?? ""}</span>
          <span data-testid="sync-fallback">{String(ws.fileTreeSyncFallbackActive)}</span>
          <span data-testid="sync-retry-nonce">{ws.fileTreeSyncRetryNonce}</span>
        </div>
      );
    }

    function ProjectSeed({ children }: { children: React.ReactNode }) {
      const ws = useWorkspace();
      // Seed the active project once via setProject so refreshFileTree has a slug.
      useEffect(() => {
        if (opts.withProject) {
          ws.setProject({
            slug: "demo",
            name: "Demo",
            path: "/demo",
            description: "",
            source: "auto",
          });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <>{children}</>;
    }

    const utils = render(
      <OpenProjectsProvider>
        <WorkspaceProvider slug={opts.withProject ? "demo" : undefined}>
          <ProjectSeed>
            <Probe />
          </ProjectSeed>
        </WorkspaceProvider>
      </OpenProjectsProvider>,
    );

    return { ...utils, captured };
  }

  it("T1: issues no-store GET against /api/files and updates fileTree on success", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ name: "a", path: "a", type: "file" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      await captured.state!.refreshFileTree();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/files?slug=demo");
    expect((init as FetchInit)?.cache).toBe("no-store");
    expect(screen.getByTestId("tree-len").textContent).toBe("1");
  });

  it("T2: toggles fileTreeRefreshing true→false and never mutates fileTreeLoading", async () => {
    let resolveFetch: (res: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { captured } = renderHarness({ withProject: true });

    expect(screen.getByTestId("refreshing").textContent).toBe("false");
    const loadingBefore = screen.getByTestId("loading").textContent;

    let pending: Promise<void>;
    act(() => {
      pending = captured.state!.refreshFileTree();
    });

    await waitFor(() => {
      expect(screen.getByTestId("refreshing").textContent).toBe("true");
    });
    expect(screen.getByTestId("loading").textContent).toBe(loadingBefore);

    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      await pending!;
    });

    expect(screen.getByTestId("refreshing").textContent).toBe("false");
    expect(screen.getByTestId("loading").textContent).toBe(loadingBefore);
  });

  it("T3: no-op when no active project — no fetch, refreshing stays false", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { captured } = renderHarness({ withProject: false });

    await act(async () => {
      await captured.state!.refreshFileTree();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("refreshing").textContent).toBe("false");
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("T4: preserves prior fileTree on non-OK and on rejection, logs error", async () => {
    const okPayload = [{ name: "a", path: "a", type: "file" as const }];
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Initial successful refresh seeds PREV.
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(okPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      await captured.state!.refreshFileTree();
    });
    expect(screen.getByTestId("tree-len").textContent).toBe("1");

    // (a) non-OK: 500
    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await act(async () => {
      await captured.state!.refreshFileTree();
    });
    expect(screen.getByTestId("tree-len").textContent).toBe("1");
    expect(screen.getByTestId("refreshing").textContent).toBe("false");
    expect(errSpy).toHaveBeenCalled();

    errSpy.mockClear();

    // (b) rejection
    fetchSpy.mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      await captured.state!.refreshFileTree();
    });
    expect(screen.getByTestId("tree-len").textContent).toBe("1");
    expect(screen.getByTestId("refreshing").textContent).toBe("false");
    expect(errSpy).toHaveBeenCalled();
  });

  it("Issue #81 T3: root refresh failures preserve selected file, expansion, and loaded subtrees", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      captured.state!.setFileTree([
        {
          name: "src",
          path: "src",
          type: "directory",
          kind: "directory",
          hasChildren: true,
          childrenLoaded: true,
          children: [
            {
              name: "index.ts",
              path: "src/index.ts",
              type: "file",
              kind: "regular-file",
            },
          ],
        },
      ]);
      captured.state!.selectFile("src/index.ts");
      captured.state!.toggleFolder("src");
    });

    await act(async () => {
      await captured.state!.refreshFileTree();
    });

    expect(screen.getByTestId("file-tree-error").textContent).toBe("HTTP 503");
    expect(screen.getByTestId("tree-json").textContent).toContain("src/index.ts");
    expect(screen.getByTestId("selected-json").textContent).toBe("src/index.ts");
    expect(screen.getByTestId("expanded-json").textContent).toBe("src");
  });

  it("T9: refreshFileTree(explicitSlug) fetches that slug even when no context project is set", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ name: "x", path: "x", type: "file" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { captured } = renderHarness({ withProject: false });

    await act(async () => {
      await captured.state!.refreshFileTree("explicit");
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/files?slug=explicit");
    expect((init as FetchInit)?.cache).toBe("no-store");
    expect(screen.getByTestId("tree-len").textContent).toBe("1");
  });

  it("TP6: concurrent duplicate root refreshes share one in-flight request", async () => {
    const resolvers: Array<(res: Response) => void> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const { captured } = renderHarness({ withProject: true });

    let firstPending: Promise<void>;
    let secondPending: Promise<void>;

    act(() => {
      firstPending = captured.state!.refreshFileTree();
      secondPending = captured.state!.refreshFileTree();
    });

    await waitFor(() => {
      expect(screen.getByTestId("refreshing").textContent).toBe("true");
    });
    expect(resolvers).toHaveLength(1);

    await act(async () => {
      resolvers[0](new Response("[]", { status: 200 }));
      await firstPending!;
      await secondPending!;
    });
    expect(screen.getByTestId("refreshing").textContent).toBe("false");
  });

  it("TP7: deduplicates duplicate same-directory child requests and merges children", async () => {
    const resolvers: Array<(res: Response) => void> = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { captured } = renderHarness({ withProject: true });
    const root: FileNode[] = [
      {
        name: "src",
        path: "src",
        type: "directory",
        kind: "directory",
        hasChildren: true,
        childrenLoaded: false,
      },
    ];

    await act(async () => {
      captured.state!.setFileTree(root);
    });

    let firstPending: Promise<void>;
    let secondPending: Promise<void>;
    act(() => {
      firstPending = captured.state!.loadDirectoryChildren("src");
      secondPending = captured.state!.loadDirectoryChildren("src");
    });

    await waitFor(() => expect(screen.getByTestId("directory-loading").textContent).toBe("src"));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/api/files?slug=demo&path=src", { cache: "no-store" });

    await act(async () => {
      resolvers[0](
        new Response(
          JSON.stringify([
            { name: "index.ts", path: "src/index.ts", type: "file", kind: "regular-file" },
          ]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
      await firstPending!;
      await secondPending!;
    });

    expect(screen.getByTestId("directory-loading").textContent).toBe("");
    expect(screen.getByTestId("tree-json").textContent).toContain("src/index.ts");
  });

  it("TP8: allows independent different-directory child requests", async () => {
    const resolvers: Array<(res: Response) => void> = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      captured.state!.setFileTree([
        {
          name: "src",
          path: "src",
          type: "directory",
          kind: "directory",
          hasChildren: true,
          childrenLoaded: false,
        },
        {
          name: "docs",
          path: "docs",
          type: "directory",
          kind: "directory",
          hasChildren: true,
          childrenLoaded: false,
        },
      ]);
    });

    act(() => {
      void captured.state!.loadDirectoryChildren("src");
      void captured.state!.loadDirectoryChildren("docs");
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(String(fetchSpy.mock.calls[0][0])).toContain("path=src");
    expect(String(fetchSpy.mock.calls[1][0])).toContain("path=docs");

    await act(async () => {
      resolvers[0](new Response("[]", { status: 200 }));
      resolvers[1](new Response("[]", { status: 200 }));
    });
  });

  it("TP9: ignores stale project responses", async () => {
    let resolveFetch: (res: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { captured } = renderHarness({ withProject: true });

    let pending: Promise<void>;
    act(() => {
      pending = captured.state!.refreshFileTree("demo");
    });
    await waitFor(() => expect(screen.getByTestId("refreshing").textContent).toBe("true"));

    await act(async () => {
      captured.state!.setProject({
        slug: "beta",
        name: "Beta",
        path: "/beta",
        description: "",
        source: "auto",
      });
    });

    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify([{ name: "stale", path: "stale", type: "file", kind: "regular-file" }]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
      await pending!;
    });

    expect(screen.getByTestId("tree-json").textContent).not.toContain("stale");
  });

  it("TP10: preserves tree and records path-scoped errors on child-load failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      captured.state!.setFileTree([
        {
          name: "src",
          path: "src",
          type: "directory",
          kind: "directory",
          hasChildren: true,
          childrenLoaded: false,
        },
        {
          name: "docs",
          path: "docs",
          type: "directory",
          kind: "directory",
          hasChildren: true,
          childrenLoaded: false,
        },
      ]);
      captured.state!.selectFile("docs/readme.md");
      captured.state!.toggleFolder("docs");
    });

    await act(async () => {
      await captured.state!.loadDirectoryChildren("src");
    });

    expect(screen.getByTestId("tree-json").textContent).toContain("docs");
    expect(screen.getByTestId("directory-errors").textContent).toContain("src:HTTP 500");
    expect(screen.getByTestId("selected-json").textContent).toBe("docs/readme.md");
    expect(screen.getByTestId("expanded-json").textContent).toBe("docs");
  });

  it("Issue #52: root and directory request keys include activeWorktree", async () => {
    const resolvers: Array<(res: Response) => void> = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      captured.state!.setActiveWorktree(".trees/feat");
    });

    let firstRoot!: Promise<void>;
    let duplicateRoot!: Promise<void>;
    act(() => {
      firstRoot = captured.state!.refreshFileTree();
      duplicateRoot = captured.state!.refreshFileTree();
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy).toHaveBeenCalledWith("/api/files?slug=demo&worktree=.trees%2Ffeat", {
      cache: "no-store",
    });

    await act(async () => {
      resolvers[0](new Response("[]", { status: 200 }));
      await firstRoot;
      await duplicateRoot;
    });

    await act(async () => {
      captured.state!.setFileTree([
        { name: "src", path: "src", type: "directory", kind: "directory", hasChildren: true },
      ]);
    });

    let child!: Promise<void>;
    act(() => {
      child = captured.state!.loadDirectoryChildren("src");
      void captured.state!.loadDirectoryChildren("src");
    });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy).toHaveBeenLastCalledWith(
      "/api/files?slug=demo&path=src&worktree=.trees%2Ffeat",
      { cache: "no-store" },
    );
    await act(async () => {
      resolvers[1](new Response("[]", { status: 200 }));
      await child;
    });
  });

  it("Issue #52: duplicate paths dedupe separately per worktree", async () => {
    const resolvers: Array<(res: Response) => void> = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { captured } = renderHarness({ withProject: true });

    act(() => {
      void captured.state!.refreshFileTree();
    });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    await act(async () => {
      captured.state!.setActiveWorktree(".trees/feat");
    });
    act(() => {
      void captured.state!.refreshFileTree();
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolvers[0](new Response("[]", { status: 200 }));
      resolvers[1](new Response("[]", { status: 200 }));
    });
  });

  it("Issue #52: ignores stale worktree responses", async () => {
    let resolveFetch: (res: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      captured.state!.setActiveWorktree(".trees/a");
    });
    let pending!: Promise<void>;
    act(() => {
      pending = captured.state!.refreshFileTree();
    });
    await waitFor(() => expect(screen.getByTestId("refreshing").textContent).toBe("true"));

    await act(async () => {
      captured.state!.setActiveWorktree(".trees/b");
    });
    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify([{ name: "stale", path: "stale", type: "file", kind: "regular-file" }]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      await pending;
    });

    expect(screen.getByTestId("tree-json").textContent).not.toContain("stale");
  });

  it("Issue #52: saves and restores file-tree state per project root and worktree", async () => {
    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      captured.state!.setFileTree([
        { name: "root.ts", path: "root.ts", type: "file", kind: "regular-file" },
      ]);
      captured.state!.selectFile("root.ts");
      captured.state!.toggleFolder("root-folder");
    });

    await act(async () => {
      captured.state!.setActiveWorktree(".trees/a");
    });
    expect(screen.getByTestId("tree-json").textContent).toBe("[]");

    await act(async () => {
      captured.state!.setFileTree([
        { name: "worktree.ts", path: "worktree.ts", type: "file", kind: "regular-file" },
      ]);
      captured.state!.selectFile("worktree.ts");
      captured.state!.toggleFolder("worktree-folder");
    });

    await act(async () => {
      captured.state!.setActiveWorktree(null);
    });
    expect(screen.getByTestId("tree-json").textContent).toContain("root.ts");
    expect(screen.getByTestId("selected-json").textContent).toBe("root.ts");
    expect(screen.getByTestId("expanded-json").textContent).toBe("root-folder");

    await act(async () => {
      captured.state!.setActiveWorktree(".trees/a");
    });
    expect(screen.getByTestId("tree-json").textContent).toContain("worktree.ts");
    expect(screen.getByTestId("selected-json").textContent).toBe("worktree.ts");
    expect(screen.getByTestId("expanded-json").textContent).toBe("worktree-folder");
  });

  it("Issue #81 T3: invalidates root and loaded directories through canonical no-store requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      captured.state!.setFileTree([
        {
          name: "src",
          path: "src",
          type: "directory",
          kind: "directory",
          hasChildren: true,
          childrenLoaded: true,
          children: [{ name: "old.ts", path: "src/old.ts", type: "file", kind: "regular-file" }],
        },
      ]);
      captured.state!.toggleFolder("src");
    });

    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              name: "src",
              path: "src",
              type: "directory",
              kind: "directory",
              hasChildren: true,
              childrenLoaded: false,
            },
            { name: "package.json", path: "package.json", type: "file", kind: "regular-file" },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { name: "new.ts", path: "src/new.ts", type: "file", kind: "regular-file" },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    await act(async () => {
      await captured.state!.invalidateFileTreeScope({
        type: "file-tree:changed",
        scope: { slug: "demo", worktree: null },
        paths: ["package.json", "src/new.ts"],
        directories: ["src"],
        rootChanged: true,
        gitStatusChanged: false,
        truncated: false,
        version: 1,
      });
    });

    expect(fetchSpy).toHaveBeenNthCalledWith(1, "/api/files?slug=demo", { cache: "no-store" });
    expect(fetchSpy).toHaveBeenNthCalledWith(2, "/api/files?slug=demo&path=src", {
      cache: "no-store",
    });
    expect(screen.getByTestId("tree-json").textContent).toContain("package.json");
    expect(screen.getByTestId("tree-json").textContent).toContain("src/new.ts");
    expect(screen.getByTestId("expanded-json").textContent).toBe("src");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("Issue #81 T3: updates collapsed hasChildren metadata and empty transitions", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      captured.state!.setFileTree([
        {
          name: "empty",
          path: "empty",
          type: "directory",
          kind: "directory",
          hasChildren: false,
          childrenLoaded: true,
          children: [],
        },
        {
          name: "collapsed",
          path: "collapsed",
          type: "directory",
          kind: "directory",
          hasChildren: false,
          childrenLoaded: true,
          children: [],
        },
      ]);
      captured.state!.toggleFolder("empty");
    });

    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              name: "empty",
              path: "empty",
              type: "directory",
              kind: "directory",
              hasChildren: true,
              childrenLoaded: false,
            },
            {
              name: "collapsed",
              path: "collapsed",
              type: "directory",
              kind: "directory",
              hasChildren: true,
              childrenLoaded: false,
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { name: "child.txt", path: "empty/child.txt", type: "file", kind: "regular-file" },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              name: "new.txt",
              path: "collapsed/new.txt",
              type: "file",
              kind: "regular-file",
            },
          ]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await act(async () => {
      await captured.state!.invalidateFileTreeScope({
        type: "file-tree:changed",
        scope: { slug: "demo", worktree: null },
        paths: ["collapsed/new.txt", "empty/child.txt"],
        directories: ["empty"],
        rootChanged: true,
        gitStatusChanged: false,
        truncated: false,
        version: 1,
      });
    });

    expect(screen.getByTestId("tree-json").textContent).toContain('"hasChildren":true');
    expect(screen.getByTestId("tree-json").textContent).toContain("empty/child.txt");
    expect(screen.getByTestId("expanded-json").textContent).toBe("empty");

    await act(async () => {
      await captured.state!.loadDirectoryChildren("empty");
    });
    expect(screen.getByTestId("tree-json").textContent).toContain('"children":[]');
  });

  it("Issue #81 T3: ignores stale scopes and clears selected files only when deletion is proven", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      captured.state!.setFileTree([
        {
          name: "src",
          path: "src",
          type: "directory",
          kind: "directory",
          hasChildren: true,
          childrenLoaded: true,
          children: [
            { name: "selected.ts", path: "src/selected.ts", type: "file", kind: "regular-file" },
          ],
        },
      ]);
      captured.state!.selectFile("src/selected.ts");
    });

    await act(async () => {
      await captured.state!.invalidateFileTreeScope({
        type: "file-tree:changed",
        scope: { slug: "other", worktree: null },
        paths: ["src/selected.ts"],
        directories: ["src"],
        rootChanged: true,
        gitStatusChanged: false,
        truncated: false,
        version: 1,
      });
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("selected-json").textContent).toBe("src/selected.ts");

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await act(async () => {
      await captured.state!.invalidateFileTreeScope({
        type: "file-tree:changed",
        scope: { slug: "demo", worktree: null },
        paths: ["src/selected.ts"],
        directories: ["src"],
        rootChanged: false,
        gitStatusChanged: false,
        truncated: false,
        version: 2,
      });
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/files?slug=demo&path=src", { cache: "no-store" });
    expect(screen.getByTestId("selected-json").textContent).toBe("");
  });

  it("Issue #81 T3: exposes sync status, retry, and fallback state APIs", async () => {
    const { captured } = renderHarness({ withProject: true });
    const initialNonce = Number(screen.getByTestId("sync-retry-nonce").textContent);

    await act(async () => {
      captured.state!.updateFileTreeSyncState("degraded", {
        code: "WATCHER_ERROR",
        message: "Watcher failed",
        retryable: true,
        pollIntervalMs: 5000,
      });
      captured.state!.setFileTreeSyncFallbackActive(true);
    });

    expect(screen.getByTestId("sync-status").textContent).toBe("degraded");
    expect(screen.getByTestId("sync-error").textContent).toBe("WATCHER_ERROR");
    expect(screen.getByTestId("sync-fallback").textContent).toBe("true");

    await act(async () => {
      captured.state!.retryFileTreeSync();
    });

    expect(screen.getByTestId("sync-status").textContent).toBe("connecting");
    expect(screen.getByTestId("sync-error").textContent).toBe("");
    expect(screen.getByTestId("sync-fallback").textContent).toBe("true");
    expect(Number(screen.getByTestId("sync-retry-nonce").textContent)).toBe(initialNonce + 1);
  });
});

describe("WorkspaceProvider.fileTreeError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function renderHarness(opts: { withProject: boolean }) {
    const captured: { state: ReturnType<typeof useWorkspace> | null } = { state: null };

    function Probe() {
      const ws = useWorkspace();
      useEffect(() => {
        captured.state = ws;
      });
      return (
        <div>
          <span data-testid="file-tree-error">{ws.fileTreeError ?? ""}</span>
          <span data-testid="tree-len">{ws.fileTree.length}</span>
          <span data-testid="refreshing">{String(ws.fileTreeRefreshing)}</span>
        </div>
      );
    }

    function ProjectSeed({ children }: { children: React.ReactNode }) {
      const ws = useWorkspace();
      useEffect(() => {
        if (opts.withProject) {
          ws.setProject({
            slug: "demo",
            name: "Demo",
            path: "/demo",
            description: "",
            source: "auto",
          });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <>{children}</>;
    }

    const utils = render(
      <OpenProjectsProvider>
        <WorkspaceProvider slug={opts.withProject ? "demo" : undefined}>
          <ProjectSeed>
            <Probe />
          </ProjectSeed>
        </WorkspaceProvider>
      </OpenProjectsProvider>,
    );

    return { ...utils, captured };
  }

  it("T1-ctx-1: sets fileTreeError on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      await captured.state!.refreshFileTree();
    });

    expect(screen.getByTestId("file-tree-error").textContent).toBe("HTTP 500");
    expect(screen.getByTestId("tree-len").textContent).toBe("0");
  });

  it("T1-ctx-2: sets fileTreeError on network rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network failure"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      await captured.state!.refreshFileTree();
    });

    expect(screen.getByTestId("file-tree-error").textContent).toBe("Network failure");
  });

  it("T1-ctx-3: clears fileTreeError on successful refresh after failure", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.spyOn(console, "error").mockImplementation(() => {});

    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 500 }));

    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      await captured.state!.refreshFileTree();
    });
    expect(screen.getByTestId("file-tree-error").textContent).toBe("HTTP 500");

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([{ name: "a", path: "a", type: "file" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await act(async () => {
      await captured.state!.refreshFileTree();
    });

    expect(screen.getByTestId("file-tree-error").textContent).toBe("");
    expect(screen.getByTestId("tree-len").textContent).toBe("1");
  });

  it("T1-ctx-4: clears fileTreeError at start of new refresh", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.spyOn(console, "error").mockImplementation(() => {});

    fetchSpy.mockResolvedValueOnce(new Response("nope", { status: 500 }));

    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      await captured.state!.refreshFileTree();
    });
    expect(screen.getByTestId("file-tree-error").textContent).toBe("HTTP 500");

    let resolveFetch: (res: Response) => void = () => {};
    fetchSpy.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    let pending: Promise<void>;
    act(() => {
      pending = captured.state!.refreshFileTree();
    });

    await waitFor(() => {
      expect(screen.getByTestId("file-tree-error").textContent).toBe("");
    });

    await act(async () => {
      resolveFetch(new Response("[]", { status: 200 }));
      await pending!;
    });
  });

  it("T1-ctx-5: does not set fileTreeError for stale project response", async () => {
    let resolveFetch: (res: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { captured } = renderHarness({ withProject: true });

    let pending: Promise<void>;
    act(() => {
      pending = captured.state!.refreshFileTree("demo");
    });
    await waitFor(() => expect(screen.getByTestId("refreshing").textContent).toBe("true"));

    await act(async () => {
      captured.state!.setProject({
        slug: "beta",
        name: "Beta",
        path: "/beta",
        description: "",
        source: "auto",
      });
    });

    await act(async () => {
      resolveFetch(new Response("nope", { status: 500 }));
      await pending!;
    });

    expect(screen.getByTestId("file-tree-error").textContent).toBe("");
  });

  it("T1-ctx-7: existing error survives when a stale-slug refresh starts", async () => {
    let resolveFetch!: (v: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = r;
        }),
    );

    const { captured } = renderHarness({ withProject: true });

    // Trigger an error on the active project
    await act(async () => {
      const p = captured.state!.refreshFileTree();
      resolveFetch(new Response("server down", { status: 500 }));
      await p;
    });

    expect(screen.getByTestId("file-tree-error").textContent).toBe("HTTP 500");

    // Switch to a new project
    await act(async () => {
      captured.state!.setProject({
        slug: "other",
        name: "Other",
        path: "/other",
        description: "",
        source: "auto",
      });
    });

    // Start a stale refresh for the OLD project — should NOT clear the
    // current (now "other") project's error state, since we haven't
    // triggered an error or a fresh load for "other" yet.
    // First, set an error for the active project "other"
    await act(async () => {
      const p = captured.state!.refreshFileTree();
      resolveFetch(new Response("other error", { status: 502 }));
      await p;
    });

    expect(screen.getByTestId("file-tree-error").textContent).toBe("HTTP 502");

    // Now start a stale refresh for the OLD slug — it must NOT clear the error
    await act(async () => {
      captured.state!.refreshFileTree("test-project");
    });

    // The active project's error must still be present
    expect(screen.getByTestId("file-tree-error").textContent).toBe("HTTP 502");

    // Resolve the stale request — error must still be present
    await act(async () => {
      resolveFetch(new Response("stale fail", { status: 500 }));
    });

    expect(screen.getByTestId("file-tree-error").textContent).toBe("HTTP 502");
  });

  it("T1-ctx-6: successful empty root response shows no error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { captured } = renderHarness({ withProject: true });

    await act(async () => {
      await captured.state!.refreshFileTree();
    });

    expect(screen.getByTestId("file-tree-error").textContent).toBe("");
    expect(screen.getByTestId("tree-len").textContent).toBe("0");
  });
});
