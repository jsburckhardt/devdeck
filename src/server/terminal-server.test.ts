// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import type { TerminalServerHandle } from "./terminal-server.mts";
import { detectCopilotState, stripAnsi } from "./terminal-server.mts";

// --- Fake IPty ---
function createFakePty() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    onData: vi.fn((cb: (data: string) => void) => {
      handlers.data = cb;
    }),
    onExit: vi.fn((cb: (e: { exitCode: number; signal: number }) => void) => {
      handlers.exit = cb;
    }),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
    cols: 80,
    rows: 24,
    process: "bash",
    handleFlowControl: false,
    _emitData(data: string) {
      handlers.data?.(data);
    },
    _emitExit(code = 0, signal = 0) {
      handlers.exit?.({ exitCode: code, signal });
    },
  };
}

let fakePty = createFakePty();
let spawnShouldThrow = false;
let spawnError: Error = new Error("spawn failed");

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => {
    if (spawnShouldThrow) throw spawnError;
    return fakePty;
  }),
}));

// --- Mocks for slug/tmux support ---
let resolvePathShouldThrow = false;

// mockRegistryJson controls what resolveProjectPath (inlined in terminal-server)
// reads from the registry file. Set to null to simulate missing registry.
let mockRegistryJson: { projects: { slug: string; path: string }[] } | null = null;

let fsStatResults: Record<string, { isDirectory: boolean; isSocket: boolean }> = {};
let fsStatErrors: Record<string, string> = {};

vi.mock("fs/promises", () => ({
  default: {
    readFile: vi.fn(async (_p: string) => {
      if (resolvePathShouldThrow) throw new Error("Registry lookup failed");
      if (!mockRegistryJson) {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      return JSON.stringify(mockRegistryJson);
    }),
    stat: vi.fn(async (p: string) => {
      const customCode = fsStatErrors[p];
      if (customCode) {
        const err = new Error(`${customCode}: stat '${p}'`) as NodeJS.ErrnoException;
        err.code = customCode;
        throw err;
      }
      const result = fsStatResults[p];
      if (!result) {
        const err = new Error(
          `ENOENT: no such file or directory, stat '${p}'`,
        ) as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      return {
        isDirectory: () => result.isDirectory,
        isSocket: () => result.isSocket,
      };
    }),
  },
}));

let tmuxHasSessionResult = false;

vi.mock("child_process", async () => {
  const actual = await vi.importActual<typeof import("child_process")>("child_process");
  return {
    ...actual,
    execFile: vi.fn((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
      if (tmuxHasSessionResult) {
        cb(null);
      } else {
        cb(new Error("session not found"));
      }
    }),
  };
});

// --- Helpers ---
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

async function createServer(
  opts?: Partial<import("./terminal-server.mts").TerminalServerOptions>,
): Promise<{ handle: TerminalServerHandle; port: number }> {
  const { createTerminalServer } = await import("./terminal-server.mts");
  const handle = createTerminalServer({ port: 0, ...opts });
  const port = await new Promise<number>((resolve) => {
    const addr = handle.wss.address();
    if (addr && typeof addr === "object") return resolve(addr.port);
    handle.wss.on("listening", () => {
      const a = handle.wss.address();
      resolve(typeof a === "object" && a ? a.port : 0);
    });
  });
  return { handle, port };
}

function connectClient(port: number, token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url = token
      ? `ws://127.0.0.1:${port}?token=${encodeURIComponent(token)}`
      : `ws://127.0.0.1:${port}`;
    const client = new WebSocket(url);
    client.on("open", () => resolve(client));
    client.on("error", reject);
  });
}

function connectClientWithSlug(port: number, slug: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${port}?slug=${encodeURIComponent(slug)}`);
    client.on("open", () => resolve(client));
    client.on("error", reject);
  });
}

function connectClientWithCookie(port: number, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { cookie: `devdeck_token=${token}` },
    });
    client.on("open", () => resolve(client));
    client.on("error", reject);
  });
}

function waitForClose(client: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    client.once("close", (code: number, reason: Buffer) => {
      resolve({ code, reason: reason.toString() });
    });
  });
}

// --- Tests ---
describe("terminal-server", () => {
  let handle: TerminalServerHandle | null = null;
  const clients: WebSocket[] = [];
  const savedToken = process.env.DEVDECK_TOKEN;
  const savedWorkspaceRoot = process.env.DEVDECK_WORKSPACE_ROOT;
  const savedTmux = process.env.TMUX;

  beforeEach(() => {
    fakePty = createFakePty();
    spawnShouldThrow = false;
    clients.length = 0;
    delete process.env.DEVDECK_TOKEN;
    delete process.env.DEVDECK_WORKSPACE_ROOT;
    delete process.env.TMUX;
    // Reset slug/tmux mock state
    resolvePathShouldThrow = false;
    mockRegistryJson = null;
    fsStatResults = {};
    fsStatErrors = {};
    tmuxHasSessionResult = false;
  });

  afterEach(async () => {
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN || c.readyState === WebSocket.CONNECTING) {
        c.close();
      }
    }
    if (handle) {
      handle.cleanup();
      await tick(50);
      handle = null;
    }
    if (savedToken !== undefined) {
      process.env.DEVDECK_TOKEN = savedToken;
    } else {
      delete process.env.DEVDECK_TOKEN;
    }
    if (savedWorkspaceRoot !== undefined) {
      process.env.DEVDECK_WORKSPACE_ROOT = savedWorkspaceRoot;
    } else {
      delete process.env.DEVDECK_WORKSPACE_ROOT;
    }
    if (savedTmux !== undefined) {
      process.env.TMUX = savedTmux;
    } else {
      delete process.env.TMUX;
    }
  });

  it("T1: PTY spawn configuration", async () => {
    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClient(srv.port);
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    expect(spawnFn).toHaveBeenCalled();

    const lastCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string; env: Record<string, string> },
    ];
    const [shell, args, opts] = lastCall;

    expect(shell).toBe(process.env.SHELL ?? "/bin/bash");
    // Default cwd should be homedir (not process.cwd())
    const { homedir } = await import("os");
    expect(opts.cwd).toBe(homedir());
    // Login shell flag
    expect(args).toContain("-l");

    for (const val of Object.values(opts.env)) {
      expect(typeof val).toBe("string");
    }
  });

  it("T2: binary message routes to PTY", async () => {
    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClient(srv.port);
    clients.push(client);
    await tick();

    client.send(Buffer.from("ls -la\n"));
    await tick();

    expect(fakePty.write).toHaveBeenCalledWith("ls -la\n");
  });

  it("T3: resize message validates and clamps", async () => {
    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClient(srv.port);
    clients.push(client);
    await tick();

    client.send(JSON.stringify({ type: "resize", cols: 1000, rows: -5 }));
    await tick();

    expect(fakePty.resize).toHaveBeenCalledWith(500, 1);
  });

  it("T4: malformed JSON ignored", async () => {
    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClient(srv.port);
    clients.push(client);
    await tick();

    client.send("not valid json {{{");
    await tick();

    expect(fakePty.write).not.toHaveBeenCalled();
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it("T5: oversized control message ignored", async () => {
    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClient(srv.port);
    clients.push(client);
    await tick();

    client.send("x".repeat(2000));
    await tick();

    expect(fakePty.write).not.toHaveBeenCalled();
    expect(fakePty.resize).not.toHaveBeenCalled();
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it("T6: PTY exit closes WebSocket", async () => {
    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClient(srv.port);
    clients.push(client);
    await tick();

    const closePromise = waitForClose(client);
    fakePty._emitExit(0, 0);
    const { code } = await closePromise;

    expect(client.readyState).toBe(WebSocket.CLOSED);
    expect(code).toBe(1011);
  });

  it("T7: WebSocket close kills PTY (idempotent)", async () => {
    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClient(srv.port);
    clients.push(client);
    await tick();

    client.close();
    await tick(100);

    expect(fakePty.kill).toHaveBeenCalledTimes(1);
  });

  it("T8: PTY spawn failure sends structured error", async () => {
    spawnShouldThrow = true;
    spawnError = new Error("no such file");

    const srv = await createServer();
    handle = srv.handle;

    const msgPromise = new Promise<string>((resolve) => {
      const client = new WebSocket(`ws://127.0.0.1:${srv.port}`);
      clients.push(client);
      client.on("message", (data: Buffer) => {
        resolve(data.toString());
      });
    });

    const msg = await msgPromise;
    const parsed = JSON.parse(msg) as { type: string; message: string };
    expect(parsed.type).toBe("error");
    expect(parsed.message).toContain("no such file");
  });

  it("T9: resize with NaN/Infinity clamped", async () => {
    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClient(srv.port);
    clients.push(client);
    await tick();

    client.send(JSON.stringify({ type: "resize", cols: null, rows: null }));
    await tick();

    expect(fakePty.resize).toHaveBeenCalledWith(1, 1);
  });

  // --- Authentication tests ---

  it("T10: rejects unauthenticated WebSocket when token is configured", async () => {
    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const callsBefore = spawnFn.mock.calls.length;

    const srv = await createServer({ token: "test-secret-token" });
    handle = srv.handle;

    const closePromise = new Promise<number>((resolve) => {
      const client = new WebSocket(`ws://127.0.0.1:${srv.port}`);
      clients.push(client);
      client.on("close", (code: number) => resolve(code));
    });

    const code = await closePromise;
    expect(code).toBe(4401);

    // PTY should NOT have been spawned for this connection
    expect(spawnFn.mock.calls.length).toBe(callsBefore);
  });

  it("T11: rejects WebSocket with wrong token", async () => {
    const srv = await createServer({ token: "correct-token" });
    handle = srv.handle;

    const closePromise = new Promise<number>((resolve) => {
      const client = new WebSocket(`ws://127.0.0.1:${srv.port}?token=wrong-token`);
      clients.push(client);
      client.on("close", (code: number) => resolve(code));
    });

    const code = await closePromise;
    expect(code).toBe(4401);
  });

  it("T12: accepts WebSocket with valid query token", async () => {
    const srv = await createServer({ token: "valid-token-123" });
    handle = srv.handle;

    const client = await connectClient(srv.port, "valid-token-123");
    clients.push(client);
    await tick();

    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it("T13: accepts WebSocket with valid cookie token", async () => {
    const srv = await createServer({ token: "cookie-token-456" });
    handle = srv.handle;

    const client = await connectClientWithCookie(srv.port, "cookie-token-456");
    clients.push(client);
    await tick();

    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it("T14: no auth required when token is not configured", async () => {
    const srv = await createServer({ token: "" });
    handle = srv.handle;

    const client = await connectClient(srv.port);
    clients.push(client);
    await tick();

    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it("T15: custom cwd is respected", async () => {
    const srv = await createServer({ cwd: "/tmp" });
    handle = srv.handle;

    const client = await connectClient(srv.port);
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const lastCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];
    expect(lastCall[2].cwd).toBe("/tmp");
  });

  // --- Slug and tmux tests ---

  it("T16: slug in URL resolves project CWD", async () => {
    // No registry entry — resolveProjectPath falls back to /workspaces/my-project
    fsStatResults["/workspaces/my-project"] = { isDirectory: true, isSocket: false };

    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClientWithSlug(srv.port, "my-project");
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const lastCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];
    expect(lastCall[2].cwd).toBe("/workspaces/my-project");
  });

  it("T17: tmux shared session detected and spawned", async () => {
    fsStatResults["/workspaces/tmux-proj"] = { isDirectory: true, isSocket: false };
    fsStatResults["/workspaces/tmux-proj/.devcontainer/.tmux-shared"] = {
      isDirectory: false,
      isSocket: true,
    };
    tmuxHasSessionResult = true;

    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClientWithSlug(srv.port, "tmux-proj");
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const lastCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];
    expect(lastCall[0]).toBe("tmux");
    expect(lastCall[1]).toContain("-S");
    expect(lastCall[1]).toContain("/workspaces/tmux-proj/.devcontainer/.tmux-shared");
    expect(lastCall[1]).toContain("attach-session");
    expect(lastCall[1]).toContain("-t");
    expect(lastCall[1]).toContain("tmux-proj");
    expect(lastCall[2].cwd).toBe("/workspaces/tmux-proj");
  });

  it("T18: no slug falls back to homedir", async () => {
    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClient(srv.port);
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const lastCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];
    const { homedir } = await import("os");
    expect(lastCall[2].cwd).toBe(homedir());
  });

  it("T19: resolved path not existing falls back to default CWD", async () => {
    // No fsStatResults entry for /workspaces/missing-project → fs.stat will throw ENOENT

    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClientWithSlug(srv.port, "missing-project");
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const lastCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];
    const { homedir } = await import("os");
    expect(lastCall[2].cwd).toBe(homedir());
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it("T20: tmux session not found falls back to regular shell", async () => {
    fsStatResults["/workspaces/no-session"] = { isDirectory: true, isSocket: false };
    fsStatResults["/workspaces/no-session/.devcontainer/.tmux-shared"] = {
      isDirectory: false,
      isSocket: true,
    };
    tmuxHasSessionResult = false; // tmux has-session returns failure

    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClientWithSlug(srv.port, "no-session");
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const lastCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];
    // Should fall back to shell, not tmux
    expect(lastCall[0]).not.toBe("tmux");
    expect(lastCall[2].cwd).toBe("/workspaces/no-session");
  });

  it("T21: tmux session name is sanitized", async () => {
    const dirtySlug = "my project!@#$%^&*()";
    // After sanitization: "myproject" → resolveProjectPath fallback: /workspaces/myproject
    fsStatResults["/workspaces/myproject"] = { isDirectory: true, isSocket: false };
    fsStatResults["/workspaces/myproject/.devcontainer/.tmux-shared"] = {
      isDirectory: false,
      isSocket: true,
    };
    tmuxHasSessionResult = true;

    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClientWithSlug(srv.port, dirtySlug);
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const lastCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];
    expect(lastCall[0]).toBe("tmux");
    // The session name should only contain [a-zA-Z0-9_-]
    const sessionNameArg = lastCall[1][lastCall[1].indexOf("-t") + 1];
    expect(sessionNameArg).toBe("myproject");
    expect(sessionNameArg).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("T22: tmux PTY exit with non-zero code falls back to regular shell", async () => {
    fsStatResults["/workspaces/tmux-fail"] = { isDirectory: true, isSocket: false };
    fsStatResults["/workspaces/tmux-fail/.devcontainer/.tmux-shared"] = {
      isDirectory: false,
      isSocket: true,
    };
    tmuxHasSessionResult = true;

    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClientWithSlug(srv.port, "tmux-fail");
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;

    // First spawn should be tmux
    const tmuxCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];
    expect(tmuxCall[0]).toBe("tmux");

    // Create a new fakePty for the fallback spawn
    const fallbackPty = createFakePty();
    spawnFn.mockReturnValueOnce(fallbackPty);

    // Simulate tmux PTY exiting with non-zero code
    fakePty._emitExit(1, 0);
    await tick();

    // A second spawn should have occurred with the regular shell
    expect(spawnFn.mock.calls.length).toBeGreaterThan(1);
    const fallbackCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];
    expect(fallbackCall[0]).not.toBe("tmux");
    expect(fallbackCall[2].cwd).toBe("/workspaces/tmux-fail");

    // Client should still be open
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it("T23: missing tmux shared socket spawns system-default tmux session", async () => {
    process.env.TMUX = "/tmp/tmux-1000/default,123,0";
    fsStatResults["/workspaces/system-tmux"] = { isDirectory: true, isSocket: false };

    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClientWithSlug(srv.port, "system-tmux");
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const lastCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string; env: Record<string, string> },
    ];

    expect(lastCall[0]).toBe("tmux");
    expect(lastCall[1]).toEqual(["new-session", "-A", "-s", "system-tmux"]);
    expect(lastCall[1]).not.toContain("-S");
    expect(lastCall[2].cwd).toBe("/workspaces/system-tmux");
    expect(lastCall[2].env.TMUX).toBeUndefined();
  });

  it("T24: tmux spawn throw falls back to regular shell and cleans it up", async () => {
    fsStatResults["/workspaces/tmux-missing"] = { isDirectory: true, isSocket: false };

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const fallbackPty = createFakePty();
    spawnFn.mockImplementationOnce(() => {
      throw new Error("tmux not found");
    });
    spawnFn.mockReturnValueOnce(fallbackPty);

    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClientWithSlug(srv.port, "tmux-missing");
    clients.push(client);
    await tick();

    expect(spawnFn.mock.calls.length).toBeGreaterThanOrEqual(2);
    const tmuxCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 2] as [
      string,
      string[],
      { cwd: string },
    ];
    const fallbackCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];

    expect(tmuxCall[0]).toBe("tmux");
    expect(fallbackCall[0]).not.toBe("tmux");
    expect(fallbackCall[2].cwd).toBe("/workspaces/tmux-missing");
    expect(client.readyState).toBe(WebSocket.OPEN);

    client.close();
    await tick(100);
    expect(fallbackPty.kill).toHaveBeenCalledTimes(1);
  });

  it("T25: system-default tmux PTY exit with non-zero code falls back to regular shell", async () => {
    fsStatResults["/workspaces/system-tmux-fail"] = { isDirectory: true, isSocket: false };

    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClientWithSlug(srv.port, "system-tmux-fail");
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const tmuxCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];
    expect(tmuxCall[0]).toBe("tmux");
    expect(tmuxCall[1]).toEqual(["new-session", "-A", "-s", "system-tmux-fail"]);

    const fallbackPty = createFakePty();
    spawnFn.mockReturnValueOnce(fallbackPty);

    fakePty._emitExit(1, 0);
    await tick();

    expect(spawnFn.mock.calls.length).toBeGreaterThan(1);
    const fallbackCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];
    expect(fallbackCall[0]).not.toBe("tmux");
    expect(fallbackCall[2].cwd).toBe("/workspaces/system-tmux-fail");
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  it("T26: slug that sanitizes empty falls back to default CWD shell", async () => {
    const srv = await createServer({ cwd: "/tmp" });
    handle = srv.handle;

    const client = await connectClientWithSlug(srv.port, "!@#$%^&*()");
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const lastCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];

    expect(lastCall[0]).not.toBe("tmux");
    expect(lastCall[2].cwd).toBe("/tmp");
  });

  it("T27: non-ENOENT tmux socket stat error falls back to regular shell (no system tmux)", async () => {
    fsStatResults["/workspaces/eacces-proj"] = { isDirectory: true, isSocket: false };
    fsStatErrors["/workspaces/eacces-proj/.devcontainer/.tmux-shared"] = "EACCES";

    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClientWithSlug(srv.port, "eacces-proj");
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const lastCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string },
    ];

    expect(lastCall[0]).not.toBe("tmux");
    expect(lastCall[2].cwd).toBe("/workspaces/eacces-proj");
  });

  it("T28: tmux spawn throw fallback strips TMUX from shell env", async () => {
    process.env.TMUX = "/tmp/tmux-1000/default,9999,0";
    fsStatResults["/workspaces/tmux-env-leak"] = { isDirectory: true, isSocket: false };

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const fallbackPty = createFakePty();
    spawnFn.mockImplementationOnce(() => {
      throw new Error("tmux not found");
    });
    spawnFn.mockReturnValueOnce(fallbackPty);

    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClientWithSlug(srv.port, "tmux-env-leak");
    clients.push(client);
    await tick();

    const fallbackCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string; env: Record<string, string> },
    ];

    expect(fallbackCall[0]).not.toBe("tmux");
    expect(fallbackCall[2].env.TMUX).toBeUndefined();
  });

  it("T29: tmux PTY exit fallback strips TMUX from shell env", async () => {
    process.env.TMUX = "/tmp/tmux-1000/default,9999,0";
    fsStatResults["/workspaces/tmux-exit-env"] = { isDirectory: true, isSocket: false };

    const srv = await createServer();
    handle = srv.handle;

    const client = await connectClientWithSlug(srv.port, "tmux-exit-env");
    clients.push(client);
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;
    const fallbackPty = createFakePty();
    spawnFn.mockReturnValueOnce(fallbackPty);

    fakePty._emitExit(1, 0);
    await tick();

    const fallbackCall = spawnFn.mock.calls[spawnFn.mock.calls.length - 1] as [
      string,
      string[],
      { cwd: string; env: Record<string, string> },
    ];

    expect(fallbackCall[0]).not.toBe("tmux");
    expect(fallbackCall[2].env.TMUX).toBeUndefined();
  });

  it("T30: shell connection sends setup message with mode shell", async () => {
    const srv = await createServer();
    handle = srv.handle;

    const messages: string[] = [];
    const client = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
      ws.on("message", (data: Buffer, isBinary: boolean) => {
        if (!isBinary) messages.push(data.toString());
      });
      ws.on("open", () => resolve(ws));
      ws.on("error", reject);
    });
    clients.push(client);
    await tick();

    const setupMsg = messages.find((m) => {
      try {
        return (JSON.parse(m) as { type?: string }).type === "setup";
      } catch {
        return false;
      }
    });
    expect(setupMsg).toBeDefined();
    const parsed = JSON.parse(setupMsg!) as { type: string; mode: string };
    expect(parsed.type).toBe("setup");
    expect(parsed.mode).toBe("shell");
  });

  it("T31: tmux connection sends setup message with mode tmux", async () => {
    fsStatResults["/workspaces/tmux-setup"] = { isDirectory: true, isSocket: false };
    fsStatResults["/workspaces/tmux-setup/.devcontainer/.tmux-shared"] = {
      isDirectory: false,
      isSocket: true,
    };
    tmuxHasSessionResult = true;

    const srv = await createServer();
    handle = srv.handle;

    const messages: string[] = [];
    const client = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${srv.port}?slug=${encodeURIComponent("tmux-setup")}`,
      );
      ws.on("message", (data: Buffer, isBinary: boolean) => {
        if (!isBinary) messages.push(data.toString());
      });
      ws.on("open", () => resolve(ws));
      ws.on("error", reject);
    });
    clients.push(client);
    await tick();

    const setupMsg = messages.find((m) => {
      try {
        return (JSON.parse(m) as { type?: string }).type === "setup";
      } catch {
        return false;
      }
    });
    expect(setupMsg).toBeDefined();
    const parsed = JSON.parse(setupMsg!) as { type: string; mode: string };
    expect(parsed.type).toBe("setup");
    expect(parsed.mode).toBe("tmux");
  });

  it("T32: tmux exit code 1 sends fallback setup message", async () => {
    fsStatResults["/workspaces/tmux-fb"] = { isDirectory: true, isSocket: false };
    fsStatResults["/workspaces/tmux-fb/.devcontainer/.tmux-shared"] = {
      isDirectory: false,
      isSocket: true,
    };
    tmuxHasSessionResult = true;

    const srv = await createServer();
    handle = srv.handle;

    const messages: string[] = [];
    const client = await connectClientWithSlug(srv.port, "tmux-fb");
    clients.push(client);
    client.on("message", (data: Buffer, isBinary: boolean) => {
      if (!isBinary) messages.push(data.toString());
    });
    await tick();

    const nodePty = await import("node-pty");
    const spawnFn = nodePty.spawn as ReturnType<typeof vi.fn>;

    // Create fallback PTY
    const fallbackPty = createFakePty();
    spawnFn.mockReturnValueOnce(fallbackPty);

    // Simulate tmux exit with code 1
    fakePty._emitExit(1, 0);
    await tick();

    // Find fallback setup message
    const fallbackMsg = messages.find((m) => {
      try {
        const p = JSON.parse(m) as { type?: string; fallback?: boolean };
        return p.type === "setup" && p.fallback === true;
      } catch {
        return false;
      }
    });
    expect(fallbackMsg).toBeDefined();
    const parsed = JSON.parse(fallbackMsg!) as {
      type: string;
      mode: string;
      fallback: boolean;
      reason: string;
    };
    expect(parsed.type).toBe("setup");
    expect(parsed.mode).toBe("shell");
    expect(parsed.fallback).toBe(true);
    expect(parsed.reason).toBe("tmux-attach-failed");

    // Client should still be connected
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  describe("worktree support", () => {
    function connectClientWithWorktree(
      port: number,
      slug: string,
      worktree: string,
    ): Promise<WebSocket> {
      return new Promise((resolve, reject) => {
        const params = new URLSearchParams({ slug, worktree });
        const client = new WebSocket(`ws://127.0.0.1:${port}?${params.toString()}`);
        client.on("open", () => resolve(client));
        client.on("error", reject);
      });
    }

    it("T11: extractWorktree returns null for missing worktree param", async () => {
      const projectPath = "/workspaces/demo-project";
      mockRegistryJson = { projects: [{ slug: "demo", path: projectPath }] };
      fsStatResults[projectPath] = { isDirectory: true, isSocket: false };

      const { handle: h, port } = await createServer();
      handle = h;

      const client = await connectClientWithSlug(port, "demo");
      clients.push(client);
      await tick(200);

      // Should connect to project root (shell mode), not a worktree
      const { spawn } = await import("node-pty");
      const spawnMock = vi.mocked(spawn);
      const lastCall = spawnMock.mock.calls[spawnMock.mock.calls.length - 1];
      expect((lastCall[2] as { cwd: string })?.cwd).toBe(projectPath);
    });

    it("T12: extractWorktree returns null for absolute path", async () => {
      const projectPath = "/workspaces/demo-project";
      mockRegistryJson = { projects: [{ slug: "demo", path: projectPath }] };
      fsStatResults[projectPath] = { isDirectory: true, isSocket: false };

      const { handle: h, port } = await createServer();
      handle = h;

      // Connect with absolute worktree path - should be ignored
      const client = await connectClientWithWorktree(port, "demo", "/etc/passwd");
      clients.push(client);
      await tick(200);

      const { spawn } = await import("node-pty");
      const spawnMock = vi.mocked(spawn);
      const lastCall = spawnMock.mock.calls[spawnMock.mock.calls.length - 1];
      // Should fall back to project root since absolute path is rejected
      expect((lastCall[2] as { cwd: string })?.cwd).toBe(projectPath);
    });

    it("T13: extractWorktree returns null for path traversal", async () => {
      const projectPath = "/workspaces/demo-project";
      mockRegistryJson = { projects: [{ slug: "demo", path: projectPath }] };
      fsStatResults[projectPath] = { isDirectory: true, isSocket: false };

      const { handle: h, port } = await createServer();
      handle = h;

      const client = await connectClientWithWorktree(port, "demo", "../../etc/passwd");
      clients.push(client);
      await tick(200);

      const { spawn } = await import("node-pty");
      const spawnMock = vi.mocked(spawn);
      const lastCall = spawnMock.mock.calls[spawnMock.mock.calls.length - 1];
      expect((lastCall[2] as { cwd: string })?.cwd).toBe(projectPath);
    });

    it("T14: worktree bypasses tmux and spawns shell-only", async () => {
      const projectPath = "/workspaces/demo-project";
      const worktreePath = `${projectPath}/.trees/feat`;
      mockRegistryJson = { projects: [{ slug: "demo", path: projectPath }] };
      fsStatResults[projectPath] = { isDirectory: true, isSocket: false };
      fsStatResults[worktreePath] = { isDirectory: true, isSocket: false };
      // Even if tmux is available, worktree should bypass it
      tmuxHasSessionResult = true;

      const { handle: h, port } = await createServer();
      handle = h;

      const client = await connectClientWithWorktree(port, "demo", ".trees/feat");
      clients.push(client);
      await tick(200);

      const { spawn } = await import("node-pty");
      const spawnMock = vi.mocked(spawn);
      const lastCall = spawnMock.mock.calls[spawnMock.mock.calls.length - 1];
      expect((lastCall[2] as { cwd: string })?.cwd).toBe(worktreePath);
      // Should NOT be tmux
      expect(lastCall[0]).not.toBe("tmux");
    });

    it("T15: invalid worktree path falls back to project root", async () => {
      const projectPath = "/workspaces/demo-project";
      mockRegistryJson = { projects: [{ slug: "demo", path: projectPath }] };
      fsStatResults[projectPath] = { isDirectory: true, isSocket: false };
      // .trees/nonexistent is NOT in fsStatResults, so stat will throw ENOENT

      const { handle: h, port } = await createServer();
      handle = h;

      const client = await connectClientWithWorktree(port, "demo", ".trees/nonexistent");
      clients.push(client);
      await tick(200);

      const { spawn } = await import("node-pty");
      const spawnMock = vi.mocked(spawn);
      const lastCall = spawnMock.mock.calls[spawnMock.mock.calls.length - 1];
      expect((lastCall[2] as { cwd: string })?.cwd).toBe(projectPath);
    });
  });
});

// --- Copilot CLI Status Detection Tests (Task 7) ---

describe("stripAnsi", () => {
  it("T5-1: strips standard SGR color sequences", () => {
    expect(stripAnsi("\x1b[31mred text\x1b[0m")).toBe("red text");
  });

  it("T5-2: strips compound SGR sequences", () => {
    expect(stripAnsi("\x1b[1;32;40mcolored\x1b[0m plain")).toBe("colored plain");
  });

  it("T5-3: preserves non-ANSI text", () => {
    expect(stripAnsi("no ansi")).toBe("no ansi");
  });

  it("T5-4: handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });

  it("T5-5: strips cursor movement sequences", () => {
    expect(stripAnsi("\x1b[H\x1b[2J")).toBe("");
  });
});

describe("detectCopilotState", () => {
  it("T1-1: returns 'running' for spinner character ⠋", () => {
    expect(detectCopilotState("⠋ Thinking...")).toBe("running");
  });

  it("T1-2: returns 'running' for spinner character ⠙", () => {
    expect(detectCopilotState("⠙ Processing...")).toBe("running");
  });

  it("T1-3: returns 'running' for all braille spinner characters", () => {
    for (const ch of "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏") {
      expect(detectCopilotState(`${ch} Working...`)).toBe("running");
    }
  });

  it("T1-4: returns 'running' for non-braille activity spinner characters", () => {
    for (const ch of "⣾⣽⣻⢿⡿⣟⣯⣷◐◓◑◒✦✧◆◇●⊙") {
      expect(detectCopilotState(`${ch} Working...`)).toBe("running");
    }
  });

  it("T1-5: returns 'running' for Copilot CLI status-line activity text", () => {
    expect(detectCopilotState("⊙ Working esc cancel")).toBe("running");
  });

  it("T1-6: returns null for generic transcript activity text", () => {
    expect(detectCopilotState("Running command ./harness verify")).toBeNull();
    expect(detectCopilotState("Copilot agent is executing tools")).toBeNull();
  });

  it("T2-1: returns 'waiting' for '> ' prompt at end", () => {
    expect(detectCopilotState("some text\n> ")).toBe("waiting");
  });

  it("T2-2: returns 'waiting' for '? ' prompt", () => {
    expect(detectCopilotState("? Do you want to continue? ")).toBe("waiting");
  });

  it("T2-3: returns 'waiting' for textual input request prompts", () => {
    expect(detectCopilotState("Waiting for input")).toBe("waiting");
    expect(detectCopilotState("Waiting for feedback")).toBe("waiting");
    expect(detectCopilotState("Requires confirmation")).toBe("waiting");
    expect(detectCopilotState("Press Enter to continue")).toBe("waiting");
  });

  it("T3-1: returns 'idle' for shell prompt with $", () => {
    expect(detectCopilotState("user@host:~$ ")).toBe("idle");
  });

  it("T3-2: returns 'idle' for shell prompt with %", () => {
    expect(detectCopilotState("% ")).toBe("idle");
  });

  it("T3-3: returns 'idle' for shell prompt with #", () => {
    expect(detectCopilotState("# ")).toBe("idle");
  });

  it("T3-4: returns 'idle' for shell prompt with ❯", () => {
    expect(detectCopilotState("❯ ")).toBe("idle");
  });

  it("T4-1: returns null for generic text", () => {
    expect(detectCopilotState("some random text")).toBeNull();
  });

  it("T4-2: returns null for empty string", () => {
    expect(detectCopilotState("")).toBeNull();
  });

  it("T4-3: returns null for ls output", () => {
    expect(detectCopilotState("ls -la output here")).toBeNull();
  });
});
