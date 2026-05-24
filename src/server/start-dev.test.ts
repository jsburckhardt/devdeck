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
  it("generates and prints a full first-run URL for generated tokens", async () => {
    const logs: string[] = [];
    const spawn = vi.fn().mockReturnValue(child());
    const cfg = config();

    await startDev({
      spawn,
      loadConfig: vi.fn().mockResolvedValue(cfg),
      seedInitialProjects: vi.fn().mockResolvedValue({ seeded: [], skipped: [] }),
      log: (message: unknown) => logs.push(String(message ?? "")),
      registerSignalHandlers: false,
      exit: vi.fn() as never,
    });

    expect(logs.join("\n")).toContain("http://localhost:8070?token=generated-token");
    expect(logs.join("\n")).toContain("Access token (generated): generated-token");
  });

  it("forwards env tokens and displays them as redacted", async () => {
    const logs: string[] = [];
    const spawn = vi.fn().mockReturnValue(child());
    const cfg = config({ token: "env-secret", sources: { ...config().sources, token: "env" } });

    await startDev({
      spawn,
      loadConfig: vi.fn().mockResolvedValue(cfg),
      seedInitialProjects: vi.fn().mockResolvedValue({ seeded: [], skipped: [] }),
      log: (message: unknown) => logs.push(String(message ?? "")),
      registerSignalHandlers: false,
      env: { DEVDECK_TOKEN: "env-secret" } as unknown as NodeJS.ProcessEnv,
      exit: vi.fn() as never,
    });

    const output = logs.join("\n");
    expect(output).toContain("[redacted:env]");
    expect(output).not.toContain("?token=env-secret");
    expect(spawn.mock.calls[0][2].env.DEVDECK_TOKEN).toBe("env-secret");
  });

  it("forwards config tokens and displays them as redacted", async () => {
    const logs: string[] = [];
    const spawn = vi.fn().mockReturnValue(child());
    const cfg = config({
      token: "config-secret",
      sources: { ...config().sources, token: "config" },
    });

    await startDev({
      spawn,
      loadConfig: vi.fn().mockResolvedValue(cfg),
      seedInitialProjects: vi.fn().mockResolvedValue({ seeded: [], skipped: [] }),
      log: (message: unknown) => logs.push(String(message ?? "")),
      registerSignalHandlers: false,
      exit: vi.fn() as never,
    });

    const output = logs.join("\n");
    expect(output).toContain("[redacted:config]");
    expect(output).not.toContain("?token=config-secret");
    expect(spawn.mock.calls[1][2].env.DEVDECK_TOKEN).toBe("config-secret");
  });

  it("forwards resolved host, port, project, workspace, data, and terminal env values to both children", async () => {
    const terminal = child();
    const next = child();
    const spawn = vi.fn().mockReturnValueOnce(terminal).mockReturnValueOnce(next);
    const cfg = config({
      token: "t",
      projectsDir: "/cfg/projects",
      dataDir: "/cfg/data",
      workspaceRoot: "/cfg/workspace",
      host: "127.0.0.9",
      port: 9999,
      terminalHost: "127.0.0.8",
      terminalPort: 3999,
    });

    await startDev({
      spawn,
      loadConfig: vi.fn().mockResolvedValue(cfg),
      seedInitialProjects: vi.fn().mockResolvedValue({ seeded: [], skipped: [] }),
      log: vi.fn(),
      registerSignalHandlers: false,
      env: { EXTRA: "kept" } as unknown as NodeJS.ProcessEnv,
      cwd: "/repo",
      exit: vi.fn() as never,
    });

    for (const call of spawn.mock.calls) {
      expect(call[2].env).toMatchObject({
        EXTRA: "kept",
        DEVDECK_TOKEN: "t",
        PORT: "9999",
        DEVDECK_HOST: "127.0.0.9",
        DEVDECK_PROJECTS_DIR: "/cfg/projects",
        DEVDECK_DATA_DIR: "/cfg/data",
        DEVDECK_WORKSPACE_ROOT: "/cfg/workspace",
        TERMINAL_HOST: "127.0.0.8",
        TERMINAL_PORT: "3999",
      });
    }
    expect(spawn.mock.calls[1][1]).toEqual([
      "next",
      "dev",
      "--turbopack",
      "--hostname",
      "127.0.0.9",
      "--port",
      "9999",
    ]);
  });

  it("aborts invalid config before spawning children", async () => {
    const spawn = vi.fn();

    await expect(
      startDev({
        spawn,
        loadConfig: vi.fn().mockRejectedValue(new Error("invalid config")),
        seedInitialProjects: vi.fn().mockResolvedValue({ seeded: [], skipped: [] }),
        log: vi.fn(),
        registerSignalHandlers: false,
        exit: vi.fn() as never,
      }),
    ).rejects.toThrow("invalid config");

    expect(spawn).not.toHaveBeenCalled();
  });

  it("seeds initial projects before child process spawn and prints source details", async () => {
    const order: string[] = [];
    const logs: string[] = [];
    const spawn = vi.fn(() => {
      order.push("spawn");
      return child();
    });
    const cfg = config({
      initialProjects: [{ path: "/project" }],
      sources: {
        ...config().sources,
        projectsDir: "config",
        host: "config",
        port: "env",
        terminalHost: "env",
      },
    });
    const seedInitialProjects = vi.fn(async () => {
      order.push("seed");
      return { seeded: ["project"], skipped: [] };
    });

    await startDev({
      spawn,
      loadConfig: vi.fn().mockResolvedValue(cfg),
      seedInitialProjects,
      log: (message: unknown) => logs.push(String(message ?? "")),
      registerSignalHandlers: false,
      exit: vi.fn() as never,
    });

    expect(order[0]).toBe("seed");
    expect(order[1]).toBe("spawn");
    const output = logs.join("\n");
    expect(output).toContain("Projects: /projects (config)");
    expect(output).toContain("HTTP:    0.0.0.0:8070 (config/env)");
    expect(output).toContain("Terminal: 127.0.0.1:3100 (env/default)");
    expect(seedInitialProjects).toHaveBeenCalledWith(cfg.initialProjects, {
      log: expect.any(Function),
      projectsDir: "/projects",
    });
  });
});
