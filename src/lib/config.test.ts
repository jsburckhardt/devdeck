// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import { displayToken, loadConfig } from "./config";

const roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(process.cwd(), ".vitest-config-"));
  roots.push(root);
  return root;
}

async function writeConfig(dataDir: string, value: unknown, mode?: number): Promise<string> {
  await fs.mkdir(dataDir, { recursive: true });
  const configPath = path.join(dataDir, "config.json");
  await fs.writeFile(
    configPath,
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
    "utf-8",
  );
  if (mode !== undefined) await fs.chmod(configPath, mode);
  return configPath;
}

function env(dataDir: string, overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { DEVDECK_DATA_DIR: dataDir, ...overrides } as NodeJS.ProcessEnv;
}

describe("loadConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it("resolves defaults and persists generated token when config is missing", async () => {
    const root = await makeRoot();
    const warn = vi.fn();

    const config = await loadConfig({ env: env(root), warn, homedir: root });

    expect(config.projectsDir).toBe(path.resolve("/workspaces"));
    expect(config.workspaceRoot).toBe(root);
    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(8070);
    expect(config.terminalHost).toBe("127.0.0.1");
    expect(config.terminalPort).toBe(3100);
    expect(config.initialProjects).toEqual([]);
    expect(config.sources.token).toBe("generated");
    expect(config.sources.initialProjects).toBe("default");
    expect(Object.isFrozen(config)).toBe(true);
    await expect(fs.readFile(path.join(root, "config.json"), "utf-8")).resolves.toContain(
      config.token,
    );
  });

  it("throws clear path-aware errors for malformed JSON", async () => {
    const root = await makeRoot();
    const configPath = await writeConfig(root, "{");

    await expect(loadConfig({ env: env(root), warn: vi.fn() })).rejects.toThrow(configPath);
    await expect(loadConfig({ env: env(root), warn: vi.fn() })).rejects.toThrow("Failed to parse");
  });

  it("throws clear path-aware errors for unreadable config", async () => {
    const root = await makeRoot();
    const configPath = path.join(root, "config.json");
    await fs.mkdir(configPath, { recursive: true });

    await expect(loadConfig({ env: env(root), warn: vi.fn() })).rejects.toThrow(configPath);
    await expect(loadConfig({ env: env(root), warn: vi.fn() })).rejects.toThrow("Failed to read");
  });

  it("warns for unknown keys and dataDir without failing", async () => {
    const root = await makeRoot();
    const warn = vi.fn();
    await writeConfig(root, { token: "configured", dataDir: "/ignored", extra: true });

    const config = await loadConfig({ env: env(root), warn });

    expect(config.dataDir).toBe(root);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("dataDir"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unknown config key extra"));
  });

  it("uses env values before config values for all mapped keys", async () => {
    const root = await makeRoot();
    await writeConfig(root, {
      token: "config-token",
      projectsDir: "/config/projects",
      workspaceRoot: "/config/workspace",
      host: "127.0.0.2",
      port: 1111,
      terminalHost: "127.0.0.3",
      terminalPort: 2222,
    });

    const config = await loadConfig({
      env: env(root, {
        DEVDECK_TOKEN: "env-token",
        DEVDECK_PROJECTS_DIR: "/env/projects",
        DEVDECK_WORKSPACE_ROOT: "/env/workspace",
        DEVDECK_HOST: "127.0.0.4",
        PORT: "3333",
        TERMINAL_HOST: "127.0.0.5",
        TERMINAL_PORT: "4444",
      }),
      warn: vi.fn(),
    });

    expect(config.token).toBe("env-token");
    expect(config.projectsDir).toBe("/env/projects");
    expect(config.workspaceRoot).toBe("/env/workspace");
    expect(config.host).toBe("127.0.0.4");
    expect(config.port).toBe(3333);
    expect(config.terminalHost).toBe("127.0.0.5");
    expect(config.terminalPort).toBe(4444);
    expect(config.sources.token).toBe("env");
    expect(config.sources.port).toBe("env");
  });

  it("uses partial config values over defaults", async () => {
    const root = await makeRoot();
    await writeConfig(root, { token: "config-token", host: "localhost", port: 1234 });

    const config = await loadConfig({ env: env(root), warn: vi.fn(), homedir: root });

    expect(config.token).toBe("config-token");
    expect(config.host).toBe("localhost");
    expect(config.port).toBe(1234);
    expect(config.terminalPort).toBe(3100);
    expect(config.sources.token).toBe("config");
    expect(config.sources.terminalPort).toBe("default");
  });

  it("accepts integer port values from config and env", async () => {
    const root = await makeRoot();
    await writeConfig(root, { token: "x", port: 123, terminalPort: "456" });
    const fromConfig = await loadConfig({ env: env(root), warn: vi.fn() });
    expect(fromConfig.port).toBe(123);
    expect(fromConfig.terminalPort).toBe(456);

    const fromEnv = await loadConfig({
      env: env(root, { PORT: "234", TERMINAL_PORT: "567" }),
      warn: vi.fn(),
    });
    expect(fromEnv.port).toBe(234);
    expect(fromEnv.terminalPort).toBe(567);
  });

  it.each([0, 65536, 1.5, "abc", ""])("rejects invalid port value %s", async (badPort) => {
    const root = await makeRoot();
    await writeConfig(root, { token: "x", port: badPort });

    await expect(loadConfig({ env: env(root), warn: vi.fn() })).rejects.toThrow("port");
  });

  it("rejects empty host and terminalHost values", async () => {
    const root = await makeRoot();
    await writeConfig(root, { token: "x", host: "  " });
    await expect(loadConfig({ env: env(root), warn: vi.fn() })).rejects.toThrow("host");

    const other = await makeRoot();
    await writeConfig(other, { token: "x", terminalHost: "" });
    await expect(loadConfig({ env: env(other), warn: vi.fn() })).rejects.toThrow("terminalHost");
  });

  it("treats whitespace-only token as missing and generates one", async () => {
    const root = await makeRoot();
    await writeConfig(root, { token: "   " });

    const config = await loadConfig({ env: env(root), warn: vi.fn() });

    expect(config.sources.token).toBe("generated");
    expect(config.token.trim()).not.toBe("");
  });

  it("persists generated token using private POSIX permissions", async () => {
    const root = await makeRoot();

    const config = await loadConfig({ env: env(root), warn: vi.fn() });
    const saved = JSON.parse(await fs.readFile(config.configPath, "utf-8")) as { token: string };

    expect(saved.token).toBe(config.token);
    if (process.platform !== "win32") {
      const stat = await fs.stat(config.configPath);
      expect(stat.mode & 0o777).toBe(0o600);
    }
  });

  it("warns for world-readable config on POSIX but not Windows", async () => {
    const root = await makeRoot();
    await writeConfig(root, { token: "x" }, 0o644);
    const posixWarn = vi.fn();
    await loadConfig({ env: env(root), warn: posixWarn, platform: "linux" });
    expect(posixWarn).toHaveBeenCalledWith(expect.stringContaining("world-readable"));

    const windowsWarn = vi.fn();
    await loadConfig({ env: env(root), warn: windowsWarn, platform: "win32" });
    expect(windowsWarn).not.toHaveBeenCalledWith(expect.stringContaining("world-readable"));
  });

  it("validates initialProjects and expands leading tilde", async () => {
    const root = await makeRoot();
    await writeConfig(root, {
      token: "x",
      initialProjects: [
        {
          path: "~/project",
          name: " My Project ",
          description: "  A project  ",
        },
        {
          path: "/workspace/blank-metadata",
          name: "   ",
          description: "",
        },
      ],
    });

    const config = await loadConfig({ env: env(root), warn: vi.fn(), homedir: "/home/tester" });

    expect(config.initialProjects).toEqual([
      {
        path: path.resolve("/home/tester/project"),
        name: "My Project",
        description: "A project",
      },
      {
        path: path.resolve("/workspace/blank-metadata"),
      },
    ]);
    expect(config.sources.initialProjects).toBe("config");
  });

  it("rejects invalid initialProjects shapes", async () => {
    const cases: Array<{ value: unknown; message: string }> = [
      { value: "not-array", message: "initialProjects" },
      { value: ["/string-entry"], message: "initialProjects[0]" },
      { value: [null], message: "initialProjects[0]" },
      { value: [{}], message: "initialProjects[0].path" },
      { value: [{ path: "" }], message: "initialProjects[0].path" },
      { value: [{ path: "   " }], message: "initialProjects[0].path" },
      { value: [{ path: "/project", name: 123 }], message: "initialProjects[0].name" },
      {
        value: [{ path: "/project", description: false }],
        message: "initialProjects[0].description",
      },
    ];

    for (const testCase of cases) {
      const root = await makeRoot();
      await writeConfig(root, { token: "x", initialProjects: testCase.value });
      await expect(loadConfig({ env: env(root), warn: vi.fn() })).rejects.toThrow(testCase.message);
    }
  });
});

describe("displayToken", () => {
  it("redacts env/config tokens and displays generated tokens", () => {
    expect(displayToken("secret", "env")).toBe("[redacted:env]");
    expect(displayToken("secret", "config")).toBe("[redacted:config]");
    expect(displayToken("generated", "generated")).toBe("generated");
  });
});
