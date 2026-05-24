import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import {
  closeNavigationTarget,
  OpenProjectsProvider,
  projectRoute,
  useOpenProjects,
} from "./open-projects-context";
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

describe("closeNavigationTarget", () => {
  const projects = [{ slug: "alpha" }, { slug: "beta" }, { slug: "gamma" }];

  it("P36-1: active first tab closes to right neighbor", () => {
    expect(closeNavigationTarget(projects, "alpha", "alpha")).toBe("/project/beta");
  });

  it("P36-2: active middle tab closes to same-index right neighbor", () => {
    expect(closeNavigationTarget(projects, "beta", "beta")).toBe("/project/gamma");
  });

  it("P36-3: active last tab closes to previous remaining project", () => {
    expect(closeNavigationTarget(projects, "gamma", "gamma")).toBe("/project/beta");
  });

  it("P36-4: only active tab closes to home", () => {
    expect(closeNavigationTarget([{ slug: "alpha" }], "alpha", "alpha")).toBe("/");
  });

  it("P36-5: inactive tab close returns no navigation target", () => {
    expect(closeNavigationTarget(projects, "gamma", "alpha")).toBeNull();
  });

  it("P36-6: project routes encode slugs", () => {
    const targetSlug = "project with/slash";
    expect(projectRoute(targetSlug)).toBe(`/project/${encodeURIComponent(targetSlug)}`);
    expect(closeNavigationTarget([{ slug: "alpha" }, { slug: targetSlug }], "alpha", "alpha")).toBe(
      `/project/${encodeURIComponent(targetSlug)}`,
    );
  });
});

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

  it("P36-7: closeProject removes the project and preserves persistence/cache contracts", async () => {
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
    const otherState: PerProjectWorkspaceState = {
      ...sampleState,
      selectedFile: "other.py",
      expandedFolders: ["lib"],
    };

    await act(async () => {
      ctx!.saveWorkspaceState("proj-a", sampleState);
      ctx!.saveWorkspaceState("proj-b", otherState);
    });
    await act(async () => {
      ctx!.closeProject("proj-a");
    });

    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.queryByTestId("project-proj-a")).not.toBeInTheDocument();
    expect(ctx!.restoreWorkspaceState("proj-a")).toBeUndefined();
    expect(ctx!.restoreWorkspaceState("proj-b")).toEqual(otherState);
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

    const otherState: PerProjectWorkspaceState = {
      ...sampleState,
      selectedFile: "other.py",
      expandedFolders: ["lib"],
    };

    await act(async () => {
      ctx!.saveWorkspaceState("proj-a", sampleState);
      ctx!.saveWorkspaceState("proj-b", otherState);
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

  it("T21: closing the last open project only updates provider state", async () => {
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

    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(JSON.parse(localStorage.getItem("devdeck-open-projects")!)).toEqual([]);
    expect(mockPush).not.toHaveBeenCalled();
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

describe("Copilot status methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve([]),
      ok: true,
    } as Response);
  });

  it("T9: getCopilotStatus returns idle for unknown slug", () => {
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

    expect(ctx!.getCopilotStatus("nonexistent-slug")).toBe("idle");
  });

  it("T10: updateCopilotStatus and getCopilotStatus round-trip", async () => {
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
      ctx!.updateCopilotStatus("my-project", "running");
    });

    expect(ctx!.getCopilotStatus("my-project")).toBe("running");
  });

  it("T11: closeProject clears copilot status", async () => {
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
      ctx!.updateCopilotStatus("proj-a", "waiting");
    });
    await act(async () => {
      ctx!.closeProject("proj-a");
    });

    expect(ctx!.getCopilotStatus("proj-a")).toBe("idle");
  });

  it("T12: multiple projects maintain independent copilot statuses", async () => {
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
      ctx!.updateCopilotStatus("project-a", "running");
      ctx!.updateCopilotStatus("project-b", "waiting");
    });

    expect(ctx!.getCopilotStatus("project-a")).toBe("running");
    expect(ctx!.getCopilotStatus("project-b")).toBe("waiting");
  });
});
