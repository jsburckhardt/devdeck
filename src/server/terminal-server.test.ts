// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocket } from "ws";
import type { TerminalServerHandle } from "./terminal-server.mts";

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

// --- Helpers ---
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

async function createServer(): Promise<{ handle: TerminalServerHandle; port: number }> {
  const { createTerminalServer } = await import("./terminal-server.mts");
  const handle = createTerminalServer({ port: 0 });
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

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    client.on("open", () => resolve(client));
    client.on("error", reject);
  });
}

function waitForClose(client: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    client.once("close", () => resolve());
  });
}

// --- Tests ---
describe("terminal-server", () => {
  let handle: TerminalServerHandle | null = null;
  const clients: WebSocket[] = [];

  beforeEach(() => {
    fakePty = createFakePty();
    spawnShouldThrow = false;
    clients.length = 0;
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
    const [shell, , opts] = lastCall;

    expect(shell).toBe(process.env.SHELL ?? "/bin/bash");
    expect(opts.cwd).toBe(process.env.DEVDECK_WORKSPACE_ROOT ?? process.cwd());

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
    await closePromise;

    expect(client.readyState).toBe(WebSocket.CLOSED);
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

    // null becomes NaN via Number(null) = 0, then clamped to max(1,0) = 1
    // Actually Number(null) = 0, which IS finite, so max(1, min(500, 0)) = 1
    client.send(JSON.stringify({ type: "resize", cols: null, rows: null }));
    await tick();

    expect(fakePty.resize).toHaveBeenCalledWith(1, 1);
  });
});
