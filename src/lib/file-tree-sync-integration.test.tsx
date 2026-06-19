import { useEffect } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenProjectsProvider } from "./open-projects-context";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";
import { useFileTreeSync } from "@/hooks/use-file-tree-sync";
import type { FileTreeChangedEvent, Project } from "./types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(eventName: string, listener: (event: MessageEvent) => void) {
    const listeners = this.listeners.get(eventName) ?? [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
  }

  emit(eventName: string, payload: unknown) {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener({ data: JSON.stringify(payload) } as MessageEvent);
    }
  }
}

const project: Project = {
  slug: "demo",
  name: "Demo",
  path: "/demo",
  description: "",
  source: "auto",
};

function Harness() {
  const ws = useWorkspace();

  useEffect(() => {
    ws.setProject(project);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ws.project?.slug !== "demo" || ws.fileTree.length > 0) return;
    ws.setFileTree([
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
    ws.selectFile("src/old.ts");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.project?.slug, ws.fileTree.length]);

  useFileTreeSync({
    slug: "demo",
    worktree: null,
    retryNonce: ws.fileTreeSyncRetryNonce,
    onStatusChange: ws.updateFileTreeSyncState,
    onFallbackChange: ws.setFileTreeSyncFallbackActive,
    onReady: ws.refreshFileTreeScope,
    onChanged: ws.invalidateFileTreeScope,
  });

  return (
    <div>
      <span data-testid="tree-json">{JSON.stringify(ws.fileTree)}</span>
      <span data-testid="selected-file">{ws.selectedFile ?? ""}</span>
      <span data-testid="sync-status">{ws.fileTreeSyncStatus}</span>
    </div>
  );
}

function renderHarness() {
  return render(
    <OpenProjectsProvider>
      <WorkspaceProvider slug="demo">
        <Harness />
      </WorkspaceProvider>
    </OpenProjectsProvider>,
  );
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("file-tree sync integration", () => {
  it("applies ready, external create, and delete invalidations through EventSource → WorkspaceContext canonical refreshes", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const jsonResponse = (payload: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    let srcRefreshCount = 0;
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/files/events?slug=demo&preflight=1") {
        return jsonResponse({
          ok: true,
          scope: { slug: "demo", worktree: null },
          pollIntervalMs: 5000,
        });
      }
      if (url === "/api/files?slug=demo") {
        return jsonResponse([
          {
            name: "src",
            path: "src",
            type: "directory",
            kind: "directory",
            hasChildren: true,
            childrenLoaded: false,
          },
        ]);
      }
      if (url === "/api/files?slug=demo&path=src") {
        srcRefreshCount += 1;
        if (srcRefreshCount === 1) {
          return jsonResponse([
            { name: "old.ts", path: "src/old.ts", type: "file", kind: "regular-file" },
            {
              name: "ready-gap.ts",
              path: "src/ready-gap.ts",
              type: "file",
              kind: "regular-file",
            },
          ]);
        }
        if (srcRefreshCount === 2) {
          return jsonResponse([
            { name: "old.ts", path: "src/old.ts", type: "file", kind: "regular-file" },
            {
              name: "ready-gap.ts",
              path: "src/ready-gap.ts",
              type: "file",
              kind: "regular-file",
            },
            { name: "new.ts", path: "src/new.ts", type: "file", kind: "regular-file" },
          ]);
        }
        return jsonResponse([
          {
            name: "ready-gap.ts",
            path: "src/ready-gap.ts",
            type: "file",
            kind: "regular-file",
          },
          { name: "new.ts", path: "src/new.ts", type: "file", kind: "regular-file" },
        ]);
      }
      return Promise.resolve(new Response("Unexpected request", { status: 500 }));
    });

    const { unmount } = renderHarness();
    await waitFor(() => expect(MockEventSource.instances).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId("tree-json").textContent).toContain("src/old.ts"),
    );
    expect(MockEventSource.instances[0].url).toBe("/api/files/events?slug=demo");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/files/events?slug=demo&preflight=1",
      expect.objectContaining({ cache: "no-store" }),
    );

    await act(async () => {
      MockEventSource.instances[0].emit("file-tree:ready", {
        type: "file-tree:ready",
        scope: { slug: "demo", worktree: null },
        pollIntervalMs: 5000,
      });
      await Promise.resolve();
    });
    expect(screen.getByTestId("sync-status").textContent).toBe("ready");
    await waitFor(() =>
      expect(screen.getByTestId("tree-json").textContent).toContain("src/ready-gap.ts"),
    );
    expect(fetchSpy).toHaveBeenCalledWith("/api/files?slug=demo", { cache: "no-store" });
    expect(fetchSpy).toHaveBeenCalledWith("/api/files?slug=demo&path=src", {
      cache: "no-store",
    });

    const createEvent: FileTreeChangedEvent = {
      type: "file-tree:changed",
      scope: { slug: "demo", worktree: null },
      paths: ["src/new.ts"],
      directories: ["src"],
      rootChanged: false,
      gitStatusChanged: false,
      truncated: false,
      version: 1,
    };
    await act(async () => {
      MockEventSource.instances[0].emit("file-tree:changed", createEvent);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByTestId("tree-json").textContent).toContain("src/new.ts"),
    );
    expect(fetchSpy).toHaveBeenCalledWith("/api/files?slug=demo&path=src", {
      cache: "no-store",
    });

    const deleteEvent: FileTreeChangedEvent = {
      ...createEvent,
      paths: ["src/old.ts"],
      version: 2,
    };
    await act(async () => {
      MockEventSource.instances[0].emit("file-tree:changed", deleteEvent);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId("selected-file").textContent).toBe(""));
    unmount();
  });
});
