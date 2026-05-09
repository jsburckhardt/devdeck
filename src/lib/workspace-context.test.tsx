import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
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
