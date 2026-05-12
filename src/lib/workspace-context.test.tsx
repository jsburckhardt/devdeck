import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";
import { OpenProjectsProvider, useOpenProjects } from "./open-projects-context";
import type { PerProjectWorkspaceState } from "./types";

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
  showFileViewer: false,
  showTerminal: false,
  fileTree: [{ name: "main.ts", path: "main.ts", type: "file" }],
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
    });

    unmount();

    const restored = restoreFn!("proj-a");
    expect(restored).toBeDefined();
    expect(restored!.selectedFile).toBe("test.ts");
    expect(restored!.expandedFolders).toContain("src");
  });

  it("T16: state is restored from cache on mount when cache exists", async () => {
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
    expect(screen.getByTestId("show-file-viewer").textContent).toBe("false");
    expect(screen.getByTestId("show-terminal").textContent).toBe("false");
    expect(screen.getByTestId("expanded-count").textContent).toBe("2");
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
    expect(screen.getByTestId("show-file-viewer").textContent).toBe("true");
    expect(screen.getByTestId("show-terminal").textContent).toBe("true");
    expect(screen.getByTestId("expanded-count").textContent).toBe("0");
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
});
