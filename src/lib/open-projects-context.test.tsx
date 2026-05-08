import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { OpenProjectsProvider, useOpenProjects } from "./open-projects-context";
import type { Project, PerProjectWorkspaceState } from "./types";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => "/",
}));

const projA: Project = {
  slug: "proj-a",
  name: "Project A",
  description: "Description A",
  language: "TypeScript",
  path: "/workspaces/proj-a",
  source: "auto",
};

const projB: Project = {
  slug: "proj-b",
  name: "Project B",
  description: "Description B",
  language: "Python",
  path: "/workspaces/proj-b",
  source: "auto",
};

const sampleState: PerProjectWorkspaceState = {
  selectedFile: "main.ts",
  expandedFolders: ["src"],
  showFileViewer: true,
  showTerminal: false,
  fileTree: [],
};

// Test consumer component to interact with context
function TestConsumer({
  onContext,
}: {
  onContext: (ctx: ReturnType<typeof useOpenProjects>) => void;
}) {
  const ctx = useOpenProjects();
  onContext(ctx);
  return (
    <div>
      <span data-testid="count">{ctx.openProjects.length}</span>
      {ctx.openProjects.map((p) => (
        <span key={p.slug} data-testid={`project-${p.slug}`}>
          {p.name}
        </span>
      ))}
    </div>
  );
}

describe("OpenProjectsProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default mock: empty projects API
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve([]),
      ok: true,
    } as Response);
  });

  it("T2: openProject adds a project and persists to localStorage", async () => {
    let ctx: ReturnType<typeof useOpenProjects>;
    render(
      <OpenProjectsProvider>
        <TestConsumer
          onContext={(c) => {
            ctx = c;
          }}
        />
      </OpenProjectsProvider>,
    );

    await act(async () => {
      ctx!.openProject(projA);
    });

    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("project-proj-a")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("devdeck-open-projects")!)).toEqual(["proj-a"]);
  });

  it("T3: openProject with duplicate slug does not create duplicate", async () => {
    let ctx: ReturnType<typeof useOpenProjects>;
    render(
      <OpenProjectsProvider>
        <TestConsumer
          onContext={(c) => {
            ctx = c;
          }}
        />
      </OpenProjectsProvider>,
    );

    await act(async () => {
      ctx!.openProject(projA);
    });
    await act(async () => {
      ctx!.openProject(projA);
    });

    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("T4: closeProject removes the project and deletes cached workspace state", async () => {
    let ctx: ReturnType<typeof useOpenProjects>;
    render(
      <OpenProjectsProvider>
        <TestConsumer
          onContext={(c) => {
            ctx = c;
          }}
        />
      </OpenProjectsProvider>,
    );

    await act(async () => {
      ctx!.openProject(projA);
      ctx!.openProject(projB);
    });
    await act(async () => {
      ctx!.saveWorkspaceState("proj-a", sampleState);
    });
    await act(async () => {
      ctx!.closeProject("proj-a");
    });

    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.queryByTestId("project-proj-a")).not.toBeInTheDocument();
    expect(ctx!.restoreWorkspaceState("proj-a")).toBeUndefined();
    expect(JSON.parse(localStorage.getItem("devdeck-open-projects")!)).toEqual(["proj-b"]);
  });

  it("T5: stale slugs are pruned on mount", async () => {
    localStorage.setItem("devdeck-open-projects", JSON.stringify(["proj-a", "stale-slug"]));
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve([projA]),
      ok: true,
    } as Response);

    render(
      <OpenProjectsProvider>
        <TestConsumer onContext={() => {}} />
      </OpenProjectsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("count").textContent).toBe("1");
    });

    expect(screen.getByTestId("project-proj-a")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("devdeck-open-projects")!)).toEqual(["proj-a"]);
  });

  it("T6: saveWorkspaceState stores and restoreWorkspaceState retrieves state", async () => {
    let ctx: ReturnType<typeof useOpenProjects>;
    render(
      <OpenProjectsProvider>
        <TestConsumer
          onContext={(c) => {
            ctx = c;
          }}
        />
      </OpenProjectsProvider>,
    );

    await act(async () => {
      ctx!.saveWorkspaceState("proj-a", sampleState);
    });

    const restored = ctx!.restoreWorkspaceState("proj-a");
    expect(restored).toEqual(sampleState);
  });

  it("T6b: restoreWorkspaceState returns undefined for unknown slug", async () => {
    let ctx: ReturnType<typeof useOpenProjects>;
    render(
      <OpenProjectsProvider>
        <TestConsumer
          onContext={(c) => {
            ctx = c;
          }}
        />
      </OpenProjectsProvider>,
    );

    expect(ctx!.restoreWorkspaceState("nonexistent")).toBeUndefined();
  });

  it("T21: closing the last open project navigates to /", async () => {
    let ctx: ReturnType<typeof useOpenProjects>;
    render(
      <OpenProjectsProvider>
        <TestConsumer
          onContext={(c) => {
            ctx = c;
          }}
        />
      </OpenProjectsProvider>,
    );

    await act(async () => {
      ctx!.openProject(projA);
    });
    await act(async () => {
      ctx!.closeProject("proj-a");
    });

    expect(mockPush).toHaveBeenCalledWith("/");
  });
});

describe("useOpenProjects", () => {
  it("T7: throws outside provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    function Orphan() {
      useOpenProjects();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow(
      "useOpenProjects must be used within an OpenProjectsProvider",
    );

    spy.mockRestore();
  });
});
