import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";

export type ConfigSource = "env" | "config" | "default" | "generated" | "launch";

export interface ConfigFieldSources {
  token: ConfigSource;
  projectsDir: ConfigSource;
  workspaceRoot: ConfigSource;
  host: ConfigSource;
  port: ConfigSource;
  terminalHost: ConfigSource;
  terminalPort: ConfigSource;
  dataDir: "env" | "default";
  initialProjects: "config" | "default";
}

export interface ResolvedConfig {
  token: string;
  projectsDir: string;
  dataDir: string;
  workspaceRoot: string;
  host: string;
  port: number;
  terminalHost: string;
  terminalPort: number;
  initialProjects: readonly InitialProjectConfig[];
  configPath: string;
  sources: Readonly<ConfigFieldSources>;
}

export interface InitialProjectConfig {
  path: string;
  name?: string;
  description?: string;
}

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  warn?: (message: string) => void;
  platform?: NodeJS.Platform;
  homedir?: string;
  launchCwd?: string;
}

type RawConfig = Record<string, unknown>;

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8070;
const DEFAULT_PROJECTS_DIR = "/workspaces";
const DEFAULT_TERMINAL_HOST = "127.0.0.1";
const DEFAULT_TERMINAL_PORT = 3100;

const SUPPORTED_KEYS = new Set([
  "token",
  "projectsDir",
  "workspaceRoot",
  "host",
  "port",
  "terminalHost",
  "terminalPort",
  "initialProjects",
]);

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

function trimString(value: unknown, key: string, configPath: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Invalid config value at ${configPath}: ${key} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function requireString(value: unknown, key: string, configPath: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid config value at ${configPath}: ${key} must be a non-empty string`);
  }
  return value.trim();
}

function parsePort(value: unknown, key: string, configPath: string): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      `Invalid config value at ${configPath}: ${key} must be an integer from 1 to 65535`,
    );
  }
  return parsed;
}

function resolveDataDir(
  env: NodeJS.ProcessEnv,
  homedir: string,
): { value: string; source: "env" | "default" } {
  const raw = env.DEVDECK_DATA_DIR?.trim();
  if (raw) return { value: path.resolve(expandHome(raw, homedir)), source: "env" };
  return { value: path.join(homedir, ".config", "devdeck"), source: "default" };
}

export function expandHome(value: string, homedir = os.homedir()): string {
  if (value === "~") return homedir;
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
    return path.join(homedir, value.slice(2));
  }
  return value;
}

async function readRawConfig(
  configPath: string,
  warn: (message: string) => void,
  platform: NodeJS.Platform,
): Promise<RawConfig> {
  try {
    const stat = await fs.stat(configPath);
    if (platform !== "win32" && (stat.mode & 0o004) !== 0) {
      warn(
        `Config file ${configPath} is world-readable; consider chmod 600 because it may contain a token.`,
      );
    }
    const content = await fs.readFile(configPath, "utf-8");
    try {
      const parsed = JSON.parse(content) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("top-level value must be an object");
      }
      return parsed as RawConfig;
    } catch (err) {
      throw new Error(
        `Failed to parse config file ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") return {};
    if (err instanceof Error && err.message.startsWith("Failed to parse config file")) throw err;
    throw new Error(
      `Failed to read config file ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function warnUnknownKeys(
  raw: RawConfig,
  configPath: string,
  warn: (message: string) => void,
): void {
  for (const key of Object.keys(raw)) {
    if (key === "dataDir") {
      warn(`Ignoring unsupported dataDir in ${configPath}; DEVDECK_DATA_DIR is env-only.`);
      continue;
    }
    if (!SUPPORTED_KEYS.has(key)) {
      warn(`Ignoring unknown config key ${key} in ${configPath}.`);
    }
  }
}

function resolveInitialProjects(
  raw: RawConfig,
  configPath: string,
  homedir: string,
): { value: InitialProjectConfig[]; source: "config" | "default" } {
  if (raw.initialProjects === undefined) return { value: [], source: "default" };
  if (!Array.isArray(raw.initialProjects)) {
    throw new Error(
      `Invalid config value at ${configPath}: initialProjects must be an array of objects`,
    );
  }
  return {
    value: raw.initialProjects.map((entry, index) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(
          `Invalid config value at ${configPath}: initialProjects[${index}] must be an object`,
        );
      }
      const record = entry as RawConfig;
      const projectPath = requireString(record.path, `initialProjects[${index}].path`, configPath);
      const name = trimString(record.name, `initialProjects[${index}].name`, configPath);
      const description = trimString(
        record.description,
        `initialProjects[${index}].description`,
        configPath,
      );
      return {
        path: path.resolve(expandHome(projectPath, homedir)),
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
      };
    }),
    source: "config",
  };
}

function resolveEnvOrConfigString(
  envValue: string | undefined,
  configValue: unknown,
  defaultValue: string,
  key: string,
  configPath: string,
): { value: string; source: ConfigSource } {
  if (envValue !== undefined)
    return { value: requireString(envValue, key, configPath), source: "env" };
  if (configValue !== undefined)
    return { value: requireString(configValue, key, configPath), source: "config" };
  return { value: defaultValue, source: "default" };
}

function resolveWorkspaceRoot(
  envValue: string | undefined,
  configValue: unknown,
  launchCwd: string | undefined,
  configPath: string,
): { value: string; source: ConfigSource } {
  if (envValue !== undefined) {
    return { value: requireString(envValue, "workspaceRoot", configPath), source: "env" };
  }
  if (configValue !== undefined) {
    return { value: requireString(configValue, "workspaceRoot", configPath), source: "config" };
  }
  if (launchCwd !== undefined) {
    return { value: launchCwd, source: "launch" };
  }
  return { value: process.cwd(), source: "default" };
}

function resolveEnvOrConfigPort(
  envValue: string | undefined,
  configValue: unknown,
  defaultValue: number,
  key: string,
  configPath: string,
): { value: number; source: ConfigSource } {
  if (envValue !== undefined) return { value: parsePort(envValue, key, configPath), source: "env" };
  if (configValue !== undefined)
    return { value: parsePort(configValue, key, configPath), source: "config" };
  return { value: defaultValue, source: "default" };
}

async function persistGeneratedToken(
  configPath: string,
  raw: RawConfig,
  token: string,
): Promise<void> {
  const dir = path.dirname(configPath);
  const tmpPath = `${configPath}.tmp-${process.pid}-${randomUUID()}`;
  const nextConfig: RawConfig = { ...raw, token };
  delete nextConfig.dataDir;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    tmpPath,
    `${JSON.stringify(nextConfig, null, 2)}
`,
    {
      encoding: "utf-8",
      mode: 0o600,
    },
  );
  if (process.platform !== "win32") await fs.chmod(tmpPath, 0o600);
  await fs.rename(tmpPath, configPath);
  if (process.platform !== "win32") await fs.chmod(configPath, 0o600);
}

export function displayToken(token: string, source: ConfigSource): string {
  if (source === "env" || source === "config") return `[redacted:${source}]`;
  return token;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<ResolvedConfig> {
  const env = options.env ?? process.env;
  const warn = options.warn ?? console.warn;
  const platform = options.platform ?? process.platform;
  const homedir = options.homedir ?? os.homedir();
  const dataDir = resolveDataDir(env, homedir);
  const configPath = path.join(dataDir.value, "config.json");
  const raw = await readRawConfig(configPath, warn, platform);
  warnUnknownKeys(raw, configPath, warn);

  const envToken = trimString(env.DEVDECK_TOKEN, "token", configPath);
  const configToken = trimString(raw.token, "token", configPath);
  let token = envToken ?? configToken;
  const tokenSource: ConfigSource = envToken ? "env" : configToken ? "config" : "generated";
  if (!token) {
    token = randomUUID();
    await persistGeneratedToken(configPath, raw, token);
  }

  const projectsDir = resolveEnvOrConfigString(
    env.DEVDECK_PROJECTS_DIR,
    raw.projectsDir,
    DEFAULT_PROJECTS_DIR,
    "projectsDir",
    configPath,
  );
  const workspaceRoot = resolveWorkspaceRoot(
    env.DEVDECK_WORKSPACE_ROOT,
    raw.workspaceRoot,
    options.launchCwd,
    configPath,
  );
  const host = resolveEnvOrConfigString(
    env.DEVDECK_HOST,
    raw.host,
    DEFAULT_HOST,
    "host",
    configPath,
  );
  const port = resolveEnvOrConfigPort(env.PORT, raw.port, DEFAULT_PORT, "port", configPath);
  const terminalHost = resolveEnvOrConfigString(
    env.TERMINAL_HOST,
    raw.terminalHost,
    DEFAULT_TERMINAL_HOST,
    "terminalHost",
    configPath,
  );
  const terminalPort = resolveEnvOrConfigPort(
    env.TERMINAL_PORT,
    raw.terminalPort,
    DEFAULT_TERMINAL_PORT,
    "terminalPort",
    configPath,
  );
  const initialProjects = resolveInitialProjects(raw, configPath, homedir);

  return Object.freeze({
    token,
    projectsDir: path.resolve(expandHome(projectsDir.value, homedir)),
    dataDir: dataDir.value,
    workspaceRoot: path.resolve(expandHome(workspaceRoot.value, homedir)),
    host: host.value,
    port: port.value,
    terminalHost: terminalHost.value,
    terminalPort: terminalPort.value,
    initialProjects: Object.freeze(initialProjects.value),
    configPath,
    sources: Object.freeze({
      token: tokenSource,
      projectsDir: projectsDir.source,
      workspaceRoot: workspaceRoot.source,
      host: host.source,
      port: port.source,
      terminalHost: terminalHost.source,
      terminalPort: terminalPort.source,
      dataDir: dataDir.source,
      initialProjects: initialProjects.source,
    }),
  });
}
