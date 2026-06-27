// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { ChildProcess } from "child_process";
// @ts-expect-error Vitest resolves .mts imports in this repository.
import { startDev } from "./start-dev.mts";
import type { ResolvedConfig } from "../lib/config";

function child(): ChildProcess {
  return {
    on: vi.fn(),
    kill: vi.fn(),
  } as unknown as ChildProcess;
}

function config(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    token: "generated-token",
    projectsDir: "/projects",
    dataDir: "/data",
    workspaceRoot: "/workspace",
    host: "0.0.0.0",
    port: 8070,
    terminalHost: "127.0.0.1",
    terminalPort: 3100,
    initialProjects: [],
    configPath: "/data/config.json",
    sources: {
      token: "generated",
      projectsDir: "default",
      workspaceRoot: "default",
      host: "default",
      port: "default",
      terminalHost: "default",
      terminalPort: "default",
      dataDir: "default",
      initialProjects: "default",
    },
    ...overrides,
  } as ResolvedConfig;
}

describe("startDev", () => {
  it("forwards launch cwd into config loading and prints the resolved workspace root/source", async () => {
    const logs: string[] = [];
    const spawn = vi.fn().mockReturnValue(child());
    const loadConfig = vi.fn().mockResolvedValue(
      config({
        token: "secret",
        workspaceRoot: "/resolved/workspace",
        sources: { ...config().sources, token: "config", workspaceRoot: "launch" },
      }),
    );

    await startDev({
      spawn,
      loadConfig,
      seedInitialProjects: vi.fn().mockResolvedValue({ seeded: [], skipped: [] }),
      log: (message: unknown) => logs.push(String(message ?? "")),
      registerSignalHandlers: false,
      cwd: "/repo",
      exit: vi.fn() as never,
    });

    expect(loadConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        env: expect.anything(),
        warn: expect.any(Function),
        launchCwd: "/repo",
      }),
    );
    const output = logs.join("\n");
    expect(output).toContain("Workspace: /resolved/workspace (launch)");
    expect(output).toContain("[redacted:config]");
    expect(spawn).toHaveBeenCalled();
  });
});
