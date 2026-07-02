// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { IPty } from "node-pty";
import { createTerminalServer, detectCopilotState } from "./terminal-server.mts";

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

function serverPort(server: { wss: { address: () => string | { port: number } | null } }): number {
  return (server.wss.address() as { port: number }).port;
}

function waitForClose(client: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    client.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

function waitForMessage(client: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    client.on("message", (message) => resolve(message.toString()));
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

  it.each([
    ["slug", "slug=demo"],
    ["worktree", "worktree=.trees/demo"],
    ["slug and worktree", "slug=demo&worktree=.trees/demo"],
  ])("rejects %s context with a 1008 error frame before spawning a PTY", async (_label, query) => {
    const server = createTerminalServer({ port: 0, token: "secret" });
    await waitForListening(server);
    const client = new WebSocket(`ws://127.0.0.1:${serverPort(server)}?token=secret&${query}`);

    const messages: string[] = [];
    client.on("message", (message) => {
      messages.push(message.toString());
    });

    const closeEvent = await waitForClose(client);

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

  it("rejects project-scoped terminal requests without a slug", async () => {
    const server = createTerminalServer({ port: 0, token: "secret" });
    await waitForListening(server);
    const client = new WebSocket(`ws://127.0.0.1:${serverPort(server)}/project?token=secret`);

    const messages: string[] = [];
    client.on("message", (message) => {
      messages.push(message.toString());
    });

    const closeEvent = await waitForClose(client);

    expect(closeEvent.code).toBe(1008);
    expect(closeEvent.reason).toBe("Unsupported terminal context");
    expect(messages).toContain(
      JSON.stringify({ type: "error", message: "Project terminal requires a slug." }),
    );
    expect(spawnMock).not.toHaveBeenCalled();

    client.close();
    server.cleanup();
  });

  it.each([
    ["slug", "slug=demo"],
    ["worktree", "worktree=.trees/demo"],
  ])(
    "rejects unauthenticated %s context with 4401 before unsupported-context handling",
    async (_label, query) => {
      const server = createTerminalServer({ port: 0, token: "secret" });
      await waitForListening(server);
      const client = new WebSocket(`ws://127.0.0.1:${serverPort(server)}?${query}`);

      const messages: string[] = [];
      client.on("message", (message) => {
        messages.push(message.toString());
      });

      const closeEvent = await waitForClose(client);

      expect(closeEvent.code).toBe(4401);
      expect(closeEvent.reason).toBe("Unauthorized");
      expect(messages).toEqual([]);
      expect(spawnMock).not.toHaveBeenCalled();

      client.close();
      server.cleanup();
    },
  );

  it("uses the configured cwd over the env workspace root and process.cwd for the default shell", async () => {
    const server = createTerminalServer({ port: 0, cwd: "/override/cwd", token: "secret" });
    await waitForListening(server);
    const client = new WebSocket(`ws://127.0.0.1:${serverPort(server)}?token=secret`);
    const setupMessage = waitForMessage(client);

    await expect(setupMessage).resolves.toBe(JSON.stringify({ type: "setup", mode: "shell" }));
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
    const client = new WebSocket(`ws://127.0.0.1:${serverPort(server)}?token=secret`);
    const setupMessage = waitForMessage(client);

    await expect(setupMessage).resolves.toBe(JSON.stringify({ type: "setup", mode: "shell" }));
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
    const client = new WebSocket(`ws://127.0.0.1:${serverPort(server)}?token=secret`);
    const setupMessage = waitForMessage(client);

    await expect(setupMessage).resolves.toBe(JSON.stringify({ type: "setup", mode: "shell" }));
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: "/current/workdir" }),
    );
    cwdSpy.mockRestore();
    client.close();
    server.cleanup();
  });

  it("detects Copilot running status lines with whitespace and ellipsis", () => {
    expect(detectCopilotState("✦ Thinking...")).toBe("running");
    expect(detectCopilotState("\n  ⊙ Working esc cancel")).toBe("running");
  });
});
