import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { IPty } from "node-pty";
import { createTerminalServer } from "./terminal-server.mts";

const spawnMock = vi.fn();

vi.mock("node-pty", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

class MockPty implements Partial<IPty> {
  pid = 1234;
  onData = vi.fn();
  onExit = vi.fn();
  write = vi.fn();
  resize = vi.fn();
  kill = vi.fn();
}

async function waitForListening(server: {
  wss: { once: (event: string, listener: () => void) => unknown };
}): Promise<void> {
  await new Promise<void>((resolve) => {
    server.wss.once("listening", () => resolve());
  });
}

describe("terminal server default endpoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => new MockPty());
    delete process.env.DEVDECK_WORKSPACE_ROOT;
  });

  afterEach(() => {
    delete process.env.DEVDECK_WORKSPACE_ROOT;
  });

  it("rejects slug and worktree context with a 1008 error frame before spawning a PTY", async () => {
    const server = createTerminalServer({ port: 0, token: "secret" });
    await waitForListening(server);
    const client = new WebSocket(
      `ws://127.0.0.1:${(server.wss.address() as { port: number }).port}?token=secret&slug=demo`,
    );

    const messages: string[] = [];
    client.on("message", (message) => {
      messages.push(message.toString());
    });

    const closeEvent = await new Promise<{ code: number; reason: string }>((resolve) => {
      client.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
    });

    expect(closeEvent.code).toBe(1008);
    expect(closeEvent.reason).toBe("Unsupported terminal context");
    expect(spawnMock).not.toHaveBeenCalled();
    expect(messages).toContain(
      JSON.stringify({
        type: "error",
        message: "Project-scoped terminals are not supported by the default terminal.",
      }),
    );

    client.close();
    server.cleanup();
  });

  it("uses the configured cwd over the env workspace root and process.cwd for the default shell", async () => {
    const server = createTerminalServer({ port: 0, cwd: "/override/cwd", token: "secret" });
    await waitForListening(server);
    const client = new WebSocket(
      `ws://127.0.0.1:${(server.wss.address() as { port: number }).port}?token=secret`,
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: "/override/cwd" }),
    );
    client.close();
    server.cleanup();
  });

  it("uses the env workspace root before process.cwd when no explicit cwd is supplied", async () => {
    process.env.DEVDECK_WORKSPACE_ROOT = "/env/workspace";
    const server = createTerminalServer({ port: 0, token: "secret" });
    await waitForListening(server);
    const client = new WebSocket(
      `ws://127.0.0.1:${(server.wss.address() as { port: number }).port}?token=secret`,
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: "/env/workspace" }),
    );
    client.close();
    server.cleanup();
  });

  it("uses process.cwd as the last-resort default cwd", async () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/current/workdir");
    const server = createTerminalServer({ port: 0, token: "secret" });
    await waitForListening(server);
    const client = new WebSocket(
      `ws://127.0.0.1:${(server.wss.address() as { port: number }).port}?token=secret`,
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: "/current/workdir" }),
    );
    cwdSpy.mockRestore();
    client.close();
    server.cleanup();
  });
});
