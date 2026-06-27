import { spawn } from "child_process";
import type { ChildProcess, SpawnOptions } from "child_process";
import { loadConfig, displayToken, type ResolvedConfig } from "../lib/config";
import { seedInitialProjects } from "../lib/registry";

export interface StartDevDeps {
  spawn?: (command: string, args?: readonly string[], options?: SpawnOptions) => ChildProcess;
  log?: (message?: unknown, ...optionalParams: unknown[]) => void;
  error?: (message?: unknown, ...optionalParams: unknown[]) => void;
  loadConfig?: typeof loadConfig;
  seedInitialProjects?: typeof seedInitialProjects;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  exit?: (code?: number) => never;
  registerSignalHandlers?: boolean;
}

export interface StartDevHandle {
  terminal: ChildProcess;
  next: ChildProcess;
  env: NodeJS.ProcessEnv;
  config: ResolvedConfig;
  shutdown: () => void;
}

function buildChildEnv(baseEnv: NodeJS.ProcessEnv, config: ResolvedConfig): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    DEVDECK_TOKEN: config.token,
    PORT: String(config.port),
    DEVDECK_HOST: config.host,
    DEVDECK_PROJECTS_DIR: config.projectsDir,
    DEVDECK_DATA_DIR: config.dataDir,
    DEVDECK_WORKSPACE_ROOT: config.workspaceRoot,
    TERMINAL_HOST: config.terminalHost,
    TERMINAL_PORT: String(config.terminalPort),
  };
}

function printBanner(config: ResolvedConfig, log: StartDevDeps["log"] = console.log): void {
  const tokenDisplay = displayToken(config.token, config.sources.token);
  log("");
  log("🔑 Access token (" + config.sources.token + "): " + tokenDisplay);
  log("   Local:   http://localhost:" + config.port + "?token=" + tokenDisplay);
  log(
    "   HTTP:    " +
      config.host +
      ":" +
      config.port +
      " (" +
      config.sources.host +
      "/" +
      config.sources.port +
      ")",
  );
  log(
    "   Terminal: " +
      config.terminalHost +
      ":" +
      config.terminalPort +
      " (" +
      config.sources.terminalHost +
      "/" +
      config.sources.terminalPort +
      ")",
  );
  log("   Projects: " + config.projectsDir + " (" + config.sources.projectsDir + ")");
  log("   Workspace: " + config.workspaceRoot + " (" + config.sources.workspaceRoot + ")");
  log("   Data:     " + config.dataDir + " (" + config.sources.dataDir + ")");
  log("");
}

export async function startDev(deps: StartDevDeps = {}): Promise<StartDevHandle> {
  const spawnChild = deps.spawn ?? spawn;
  const log = deps.log ?? console.log;
  const load = deps.loadConfig ?? loadConfig;
  const seed = deps.seedInitialProjects ?? seedInitialProjects;
  const baseEnv = deps.env ?? process.env;
  const cwd = deps.cwd ?? process.cwd();
  const exit = deps.exit ?? process.exit;
  const config = await load({ env: baseEnv, warn: (message) => log(message), launchCwd: cwd });

  await seed(config.initialProjects, {
    log: (message) => log(message),
    projectsDir: config.projectsDir,
  });
  printBanner(config, log);

  const env = buildChildEnv(baseEnv, config);
  const terminal: ChildProcess = spawnChild("npx", ["tsx", "src/server/terminal-server.mts"], {
    env,
    stdio: "inherit",
    cwd,
  });

  const next: ChildProcess = spawnChild(
    "npx",
    ["next", "dev", "--turbopack", "--hostname", config.host, "--port", String(config.port)],
    {
      env,
      stdio: "inherit",
      cwd,
    },
  );

  let shuttingDown = false;

  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    log("Shutting down...");
    terminal.kill("SIGTERM");
    next.kill("SIGTERM");
    setTimeout(() => exit(0), 3000);
  }

  terminal.on("exit", (code) => {
    if (shuttingDown) return;
    log("Terminal server exited (code " + code + ")");
    shutdown();
  });

  next.on("exit", (code) => {
    if (shuttingDown) return;
    log("Next.js exited (code " + code + ")");
    shutdown();
  });

  if (deps.registerSignalHandlers ?? true) {
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  return { terminal, next, env, config, shutdown };
}

if (process.argv[1]?.endsWith("src/server/start-dev.mts")) {
  startDev().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
