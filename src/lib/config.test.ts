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

async function writeConfig(dataDir: string, value: unknown): Promise<string> {
  await fs.mkdir(dataDir, { recursive: true });
  const configPath = path.join(dataDir, "config.json");
  await fs.writeFile(
    configPath,
    `${JSON.stringify(value, null, 2)}
`,
    "utf-8",
  );
  return configPath;
}

function env(dataDir: string, overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { DEVDECK_DATA_DIR: dataDir, ...overrides } as NodeJS.ProcessEnv;
}

describe("loadConfig workspace-root precedence", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it("prefers env workspaceRoot over config and launch cwd", async () => {
    const root = await makeRoot();
    await writeConfig(root, { workspaceRoot: "/config/workspace" });

    const config = await loadConfig({
      env: env(root, { DEVDECK_WORKSPACE_ROOT: "/env/workspace" }),
      warn: vi.fn(),
      launchCwd: "/launch/cwd",
    });

    expect(config.workspaceRoot).toBe("/env/workspace");
    expect(config.sources.workspaceRoot).toBe("env");
  });

  it("prefers config workspaceRoot over launch cwd", async () => {
    const root = await makeRoot();
    await writeConfig(root, { workspaceRoot: "/config/workspace" });

    const config = await loadConfig({ env: env(root), warn: vi.fn(), launchCwd: "/launch/cwd" });

    expect(config.workspaceRoot).toBe("/config/workspace");
    expect(config.sources.workspaceRoot).toBe("config");
  });

  it("uses the supplied launch cwd when no explicit workspaceRoot exists", async () => {
    const root = await makeRoot();
    await writeConfig(root, { token: "x" });

    const config = await loadConfig({ env: env(root), warn: vi.fn(), launchCwd: "/launch/cwd" });

    expect(config.workspaceRoot).toBe("/launch/cwd");
    expect(config.sources.workspaceRoot).toBe("launch");
  });

  it("falls back to process.cwd when no launch cwd is supplied", async () => {
    const root = await makeRoot();
    await writeConfig(root, { token: "x" });
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/current/workdir");

    const config = await loadConfig({ env: env(root), warn: vi.fn() });

    expect(cwdSpy).toHaveBeenCalled();
    expect(config.workspaceRoot).toBe("/current/workdir");
    expect(config.sources.workspaceRoot).toBe("default");
  });
});

describe("displayToken", () => {
  it("redacts env/config tokens and displays generated tokens", () => {
    expect(displayToken("secret", "env")).toBe("[redacted:env]");
    expect(displayToken("secret", "config")).toBe("[redacted:config]");
    expect(displayToken("generated", "generated")).toBe("generated");
  });
});
