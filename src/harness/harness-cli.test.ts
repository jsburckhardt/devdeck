// @vitest-environment node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRealpath = realpathSync(repoRoot);
const harnessPath = path.join(repoRoot, "harness");
const runRoot = path.join(repoRoot, ".harness", "run", "vitest");
const nextDir = path.join(repoRoot, ".next");
const buildIdPath = path.join(nextDir, "BUILD_ID");

type HarnessResult = ReturnType<typeof spawnSync>;
type AsyncHarnessResult = {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

let testDir = "";
let hadNextDir = false;
let hadBuildId = false;

function makeTestDir() {
  mkdirSync(runRoot, { recursive: true });
  testDir = path.join(runRoot, `case-${process.pid}-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
}

function runHarness(
  args: string[],
  env: Record<string, string | undefined> = {},
  timeout = 15_000,
): HarnessResult {
  return spawnSync(harnessPath, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      NO_COLOR: "1",
      HARNESS_SMOKE_READINESS_ATTEMPTS: "3",
      ...env,
    },
    encoding: "utf8",
    timeout,
  });
}

function runHarnessAsync(
  args: string[],
  env: Record<string, string | undefined> = {},
  timeout = 15_000,
) {
  const child = spawn(harnessPath, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      NO_COLOR: "1",
      HARNESS_SMOKE_READINESS_ATTEMPTS: "3",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const done = new Promise<AsyncHarnessResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Timed out running ./harness ${args.join(" ")}`));
    }, timeout);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
  });

  return { child, done };
}

function parseJson(result: HarnessResult) {
  expect(result.stdout).toBeTruthy();
  return JSON.parse(String(result.stdout));
}

function parseAsyncJson(result: AsyncHarnessResult) {
  expect(result.stdout).toBeTruthy();
  return JSON.parse(result.stdout);
}

function ensureBuildMarker() {
  hadNextDir = existsSync(nextDir);
  hadBuildId = existsSync(buildIdPath);
  mkdirSync(nextDir, { recursive: true });
  if (!hadBuildId) {
    writeFileSync(buildIdPath, "harness-test-build\n");
  }
}

function cleanupBuildMarker() {
  if (!hadBuildId && existsSync(buildIdPath)) {
    rmSync(buildIdPath);
  }
  if (!hadNextDir && existsSync(nextDir)) {
    rmSync(nextDir, { recursive: true, force: true });
  }
}

function createFakeNpm() {
  const fakePath = path.join(testDir, "npm");
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const args = process.argv.slice(2);
const recordPath = process.env.FAKE_NPM_RECORD;
const record = (event) => {
  if (recordPath) {
    fs.appendFileSync(recordPath, JSON.stringify({ pid: process.pid, ...event }) + "\\n");
  }
};
const exitFor = (name) => Number(process.env[name] || "0");
const writePlaywrightReport = (exitCode) => {
  const status = exitCode === 0 ? "passed" : "failed";
  const artifactDir =
    process.env.DEVDECK_E2E_ARTIFACT_DIR ||
    path.join(process.cwd(), ".harness", "run", "fake-playwright-artifacts-" + process.pid);
  const reportPath = path.join(artifactDir, "playwright-results.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    suites: [
      {
        title: "fake-e2e.spec.ts",
        specs: [
          {
            title: "fake e2e test",
            tests: [
              {
                status: exitCode === 0 ? "expected" : "unexpected",
                results: [{ status }],
              },
            ],
          },
          {
            title: "fake skipped e2e test",
            tests: [
              {
                status: "skipped",
                results: [{ status: "skipped" }],
              },
            ],
          },
        ],
      },
    ],
  }) + "\\n");
};

record({ event: "invoke", args });

if (args[0] === "ci") {
  record({ event: "ci" });
  process.exit(exitFor("FAKE_NPM_CI_EXIT"));
}

if (args[0] !== "run") {
  process.exit(1);
}

const script = args[1];
const rest = args.slice(2);

if (script === "lint") process.exit(exitFor("FAKE_NPM_LINT_EXIT"));
if (script === "format:check") process.exit(exitFor("FAKE_NPM_FORMAT_EXIT"));
if (script === "build") {
  fs.mkdirSync(path.join(process.cwd(), ".next"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "fake-build\\n");
  process.exit(exitFor("FAKE_NPM_BUILD_EXIT"));
}
if (script === "test") {
  const forwarded = rest[0] === "--" ? rest.slice(1) : rest;
  record({ event: "test", forwarded });
  process.exit(exitFor("FAKE_NPM_TEST_EXIT"));
}
if (script === "e2e") {
  const forwarded = rest[0] === "--" ? rest.slice(1) : rest;
  const e2eExitCode = exitFor("FAKE_NPM_E2E_EXIT");
  record({
    event: "e2e",
    forwarded,
    env: {
      webHost: process.env.DEVDECK_E2E_WEB_HOST,
      webPort: process.env.DEVDECK_E2E_WEB_PORT,
      terminalHost: process.env.DEVDECK_E2E_TERMINAL_HOST,
      terminalPort: process.env.DEVDECK_E2E_TERMINAL_PORT,
      projectsDir: process.env.DEVDECK_PROJECTS_DIR,
      dataDir: process.env.DEVDECK_DATA_DIR,
      artifactDir: process.env.DEVDECK_E2E_ARTIFACT_DIR,
      tokenPresent: process.env.DEVDECK_TOKEN ? true : false,
    },
  });
  if (process.env.FAKE_NPM_E2E_MUTATE_FIXTURE) {
    fs.writeFileSync(process.env.FAKE_NPM_E2E_MUTATE_FIXTURE, "mutated");
  }
  if (process.env.FAKE_NPM_E2E_MUTATE_FIXTURE_REL) {
    const target = path.join(process.env.DEVDECK_PROJECTS_DIR, process.env.FAKE_NPM_E2E_MUTATE_FIXTURE_REL);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "mutated");
  }
  if (process.env.FAKE_NPM_NOISY === "1") {
    console.error("raw e2e stdout/stderr token=super-secret DEVDECK_TOKEN=******example.test/?token=secret");
  }
  writePlaywrightReport(e2eExitCode);
  process.exit(e2eExitCode);
}
if (script !== "start") {
  process.exit(1);
}

const forwarded = rest[0] === "--" ? rest.slice(1) : rest;
const portIndex = forwarded.indexOf("--port");
const port = Number(portIndex >= 0 ? forwarded[portIndex + 1] : 0);
const hostIndex = forwarded.indexOf("--hostname");
const host = hostIndex >= 0 ? forwarded[hostIndex + 1] : "missing";
record({ event: "start", forwarded, port, host });
if (process.env.FAKE_NPM_START_PID) {
  fs.writeFileSync(process.env.FAKE_NPM_START_PID, String(process.pid));
}
if (process.env.FAKE_NPM_NOISY === "1") {
  console.error("raw stdout/stderr token=super-secret DEVDECK_TOKEN=https://user:pass@example.test/?token=secret");
}

const mode = process.env.FAKE_NPM_START_MODE || "pass";
if (mode === "exit") process.exit(1);
if (mode === "hang") {
  setInterval(() => {}, 1000);
  return;
}

const server = http.createServer((_req, res) => {
  if (mode === "redirect") {
    res.statusCode = 302;
    res.setHeader("Location", "https://user:pass@example.test/redirect?token=secret");
    res.end("redirect body with token=secret");
    return;
  }
  if (mode === "http4xx") {
    res.statusCode = 401;
    res.end("body token=secret");
    return;
  }
  if (mode === "http5xx") {
    res.statusCode = 503;
    res.end("server body token=secret");
    return;
  }
  res.statusCode = 200;
  res.end("ok");
});

const listenDelayMs = Number(process.env.FAKE_NPM_LISTEN_DELAY_MS || "0");
setTimeout(() => {
  server.listen(port, "127.0.0.1", () => record({ event: "listening", port, host }));
}, listenDelayMs);
const shutdown = () => {
  if (server.listening) {
    server.close(() => process.exit(0));
    return;
  }
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
setInterval(() => {}, 1000);
`;
  writeFileSync(fakePath, script);
  chmodSync(fakePath, 0o755);
  return fakePath;
}

function readRecords(recordPath: string) {
  if (!existsSync(recordPath)) return [];
  return readFileSync(recordPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function listenOn(port = 0): Promise<net.Server> {
  const server = net.createServer((socket) => socket.end("ok"));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return server;
}

async function closeServer(server: net.Server | http.Server) {
  if (!server.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function canConnect(port: number) {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

async function findConsecutivePorts(count: number) {
  for (let port = 41000; port <= 41999 - count; port += 1) {
    const servers: net.Server[] = [];
    try {
      for (let offset = 0; offset < count; offset += 1) {
        servers.push(await listenOn(port + offset));
      }

      await Promise.all(servers.map(closeServer));
      return port;
    } catch {
      await Promise.all(servers.map(closeServer));
    }
  }
  throw new Error(`Unable to find ${count} consecutive free smoke ports`);
}

async function findConsecutivePortsInRange(start: number, end: number, count: number) {
  for (let port = start; port <= end - count + 1; port += 1) {
    const servers: net.Server[] = [];
    try {
      for (let offset = 0; offset < count; offset += 1) {
        servers.push(await listenOn(port + offset));
      }
      await Promise.all(servers.map(closeServer));
      return port;
    } catch {
      await Promise.all(servers.map(closeServer));
    }
  }
  throw new Error(`Unable to find ${count} consecutive free ports in ${start}-${end}`);
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function smokeRepoHash(repoIdentity = repoRealpath) {
  return createHash("sha256").update(repoIdentity).digest("hex").slice(0, 16);
}

function smokeLockDir(port: number, repoIdentity = repoRealpath) {
  return path.join(
    repoRoot,
    ".harness",
    "run",
    `smoke-${smokeRepoHash(repoIdentity)}-${port}.lock`,
  );
}

function e2eLockDir(role: "web" | "terminal", port: number, repoIdentity = repoRealpath) {
  return path.join(
    repoRoot,
    ".harness",
    "run",
    `e2e-${smokeRepoHash(repoIdentity)}-${role}-${port}.lock`,
  );
}

function smokeCommandSummary(port: number) {
  return `npm run start -- --hostname 127.0.0.1 --port ${port}`;
}

function writeSmokeOwnerMetadata(
  port: number,
  repoIdentity: string,
  overrides: Record<string, unknown> = {},
) {
  const lockDir = smokeLockDir(port, repoIdentity);
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(
    path.join(lockDir, "owner.json"),
    `${JSON.stringify({
      version: 1,
      kind: "devdeck-harness-smoke",
      repoIdentity: smokeRepoHash(repoIdentity),
      repoRealpath: repoIdentity,
      port,
      parentPid: 99_999_999,
      childPid: null,
      processGroupId: null,
      commandSummary: smokeCommandSummary(port),
      timestamp: "2026-06-20T00:00:00Z",
      status: "started",
      ...overrides,
    })}\n`,
  );
  return lockDir;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(filePath: string, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

async function expectPathGone(filePath: string) {
  for (let i = 0; i < 40; i += 1) {
    if (!existsSync(filePath)) return;
    await sleep(50);
  }
  expect(existsSync(filePath)).toBe(false);
}

async function expectProcessGone(pidPath: string) {
  const pid = Number(readFileSync(pidPath, "utf8"));
  for (let i = 0; i < 20; i += 1) {
    if (!processIsAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(processIsAlive(pid)).toBe(false);
}

beforeEach(() => {
  makeTestDir();
  hadNextDir = existsSync(nextDir);
  hadBuildId = existsSync(buildIdPath);
});

afterEach(() => {
  cleanupBuildMarker();
  if (testDir) rmSync(testDir, { recursive: true, force: true });
});

describe("harness parser and targeted test passthrough", () => {
  it("installs dependencies with npm ci", () => {
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const fakeNpm = createFakeNpm();

    const result = runHarness(["install", "--json"], {
      HARNESS_NPM_BIN: fakeNpm,
      FAKE_NPM_RECORD: recordPath,
    });

    expect(result.status).toBe(0);
    const json = parseJson(result);
    expect(json.verdict).toBe("pass");
    expect(json.steps[0].name).toBe("install");

    const records = readRecords(recordPath);
    expect(
      records.filter((record) => record.args).map((record) => record.args.join(" ")),
    ).toContain("ci");
    expect(records.some((record) => record.event === "ci")).toBe(true);
  });

  it("checks formatting through the harness format_check verb", () => {
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const fakeNpm = createFakeNpm();

    const result = runHarness(["format_check", "--json"], {
      HARNESS_NPM_BIN: fakeNpm,
      FAKE_NPM_RECORD: recordPath,
    });

    expect(result.status).toBe(0);
    const json = parseJson(result);
    expect(json.verdict).toBe("pass");
    expect(json.steps[0].name).toBe("format_check");

    const records = readRecords(recordPath);
    expect(
      records.filter((record) => record.args).map((record) => record.args.join(" ")),
    ).toContain("run format:check");
  });

  it("reports full-suite test JSON metadata as non-targeted", () => {
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const fakeNpm = createFakeNpm();

    const result = runHarness(["test", "--json"], {
      HARNESS_NPM_BIN: fakeNpm,
      FAKE_NPM_RECORD: recordPath,
    });

    expect(result.status).toBe(0);
    const json = parseJson(result);
    expect(json.command).toBe("npm run test");
    expect(json.metadata).toEqual({
      targeted: false,
      targets: [],
      targetCount: 0,
      truncated: false,
    });
    expect(json.steps[0].metadata).toEqual(json.metadata);

    const testRecord = readRecords(recordPath).find((record) => record.event === "test");
    expect(testRecord.forwarded).toEqual([]);
  });

  it("keeps harness --json before the delimiter separate from Vitest --json after it", () => {
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const fakeNpm = createFakeNpm();

    const result = runHarness(["test", "--json", "--", "--json", "src/server/start-dev.test.ts"], {
      HARNESS_NPM_BIN: fakeNpm,
      FAKE_NPM_RECORD: recordPath,
    });

    expect(result.status).toBe(0);
    const json = parseJson(result);
    expect(json.verdict).toBe("pass");
    expect(json.command).toBe("npm run test -- <2 target(s)>");
    expect(json.metadata).toEqual({
      targeted: true,
      targets: ["--json", "src/server/start-dev.test.ts"],
      targetCount: 2,
      truncated: false,
    });
    expect(json.steps[0].metadata).toEqual({
      targeted: true,
      targets: ["--json", "src/server/start-dev.test.ts"],
      targetCount: 2,
      truncated: false,
    });

    const testRecord = readRecords(recordPath).find((record) => record.event === "test");
    expect(testRecord.forwarded).toEqual(["--json", "src/server/start-dev.test.ts"]);
  });

  it("forwards spaces and shell metacharacters as literal test arguments", () => {
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const fakeNpm = createFakeNpm();
    const tricky = "src/a file; echo should-not-run.test.ts";

    const result = runHarness(["test", "--json", "--", tricky], {
      HARNESS_NPM_BIN: fakeNpm,
      FAKE_NPM_RECORD: recordPath,
    });

    expect(result.status).toBe(0);
    expect(parseJson(result).metadata.targets[0]).toBe(tricky);
    const testRecord = readRecords(recordPath).find((record) => record.event === "test");
    expect(testRecord.forwarded).toEqual([tricky]);
  });

  it("treats non-delimited test targets as passthrough while keeping harness --json", () => {
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const fakeNpm = createFakeNpm();

    const result = runHarness(["test", "--json", "src/server/start-dev.test.ts"], {
      HARNESS_NPM_BIN: fakeNpm,
      FAKE_NPM_RECORD: recordPath,
    });

    expect(result.status).toBe(0);
    const json = parseJson(result);
    expect(json.command).toBe("npm run test -- <1 target(s)>");
    expect(json.metadata.targeted).toBe(true);
    expect(json.metadata.targetCount).toBe(1);
    expect(json.metadata.targets).toEqual(["src/server/start-dev.test.ts"]);
    expect(json.metadata.truncated).toBe(false);
    const testRecord = readRecords(recordPath).find((record) => record.event === "test");
    expect(testRecord.forwarded).toEqual(["src/server/start-dev.test.ts"]);
  });

  it("sanitizes targeted test metadata without changing forwarded arguments", () => {
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const fakeNpm = createFakeNpm();
    const repoAbsolute = `${repoRoot}/src/server/start-dev.test.ts?token=secret`;
    const outsideAbsolute = "/outside/secret/project.test.ts";
    const credentialUrl = "https://user:pass@example.test/path?token=secret";
    const control = "line\nwith\u001bcontrol";
    const longTarget = `src/${"x".repeat(250)}.test.ts`;

    const result = runHarness(
      [
        "test",
        "--json",
        "--",
        repoAbsolute,
        outsideAbsolute,
        credentialUrl,
        control,
        "DEVDECK_TOKEN=secret",
        longTarget,
      ],
      {
        HARNESS_NPM_BIN: fakeNpm,
        FAKE_NPM_RECORD: recordPath,
      },
    );

    expect(result.status).toBe(0);
    const json = parseJson(result);
    expect(json.command).toBe("npm run test -- <6 target(s)>");
    expect(json.metadata.targets.every((target: unknown) => typeof target === "string")).toBe(true);
    const labels = json.metadata.targets as string[];
    expect(labels).toContain("src/server/start-dev.test.ts");
    expect(labels).toContain("[redacted-absolute-path]");
    expect(labels).toContain("[redacted-url]");
    expect(labels).toContain("linewithcontrol");
    expect(labels).toContain("[redacted-env]");
    expect(json.metadata.targeted).toBe(true);
    expect(json.metadata.targetCount).toBe(6);
    expect(json.metadata.truncated).toBe(true);
    expect(json.metadata.targets.at(-1)).toHaveLength(200);
    expect(String(result.stdout)).not.toContain(repoRoot);
    expect(String(result.stdout)).not.toContain("user:pass");
    expect(String(result.stdout)).not.toContain("?token=");

    const testRecord = readRecords(recordPath).find((record) => record.event === "test");
    expect(testRecord.forwarded[0]).toBe(repoAbsolute);
    expect(testRecord.forwarded[2]).toBe(credentialUrl);
  });
});

describe("harness smoke", () => {
  it.each([
    ["unknown flag", ["smoke", "--json", "--bogus"]],
    ["duplicate port", ["smoke", "--json", "--port", "41000", "--port=41001"]],
    ["bare --port", ["smoke", "--json", "--port"]],
    ["--port=", ["smoke", "--json", "--port="]],
    ["abc port", ["smoke", "--json", "--port", "abc"]],
    ["zero port", ["smoke", "--json", "--port", "0"]],
    ["too-large port", ["smoke", "--json", "--port", "70000"]],
    ["decimal port", ["smoke", "--json", "--port", "12.5"]],
    ["negative port", ["smoke", "--json", "--port", "-1"]],
  ])("rejects invalid smoke usage: %s", (_name, args) => {
    const result = runHarness(args);
    expect(result.status).toBe(1);
    const json = parseJson(result);
    expect(json.verdict).toBe("fail");
    expect(json.message).toContain("Usage: ./harness smoke");
  });

  it("reports fixed-port conflicts as degraded without killing the existing listener", async () => {
    ensureBuildMarker();
    const server = await listenOn(0);
    const port = (server.address() as net.AddressInfo).port;

    try {
      const result = runHarness(["smoke", "--json", "--port", String(port)]);
      expect(result.status).toBe(2);
      const json = parseJson(result);
      expect(json.verdict).toBe("degraded");
      expect(json.metadata.reason).toBe("fixed_port_in_use");
      await expect(canConnect(port)).resolves.toBe(true);
      expect(server.listening).toBe(true);
    } finally {
      await closeServer(server);
    }
  });

  it("retries occupied auto candidates and cleans up the harness-owned server", async () => {
    ensureBuildMarker();
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const pidPath = path.join(testDir, "start.pid");
    const fakeNpm = createFakeNpm();
    const startPort = await findConsecutivePorts(2);
    const occupied = await listenOn(startPort);

    try {
      const result = runHarness(["smoke", "--json", "--port", "auto"], {
        HARNESS_NPM_BIN: fakeNpm,
        HARNESS_SMOKE_AUTO_START: String(startPort),
        HARNESS_SMOKE_AUTO_MAX_ATTEMPTS: "2",
        FAKE_NPM_RECORD: recordPath,
        FAKE_NPM_START_PID: pidPath,
      });

      expect(result.status).toBe(0);
      const json = parseJson(result);
      expect(json.verdict).toBe("pass");
      expect(json.command).toBe("npm run start -- --hostname 127.0.0.1 --port <selectedPort>");
      expect(json.metadata.portMode).toBe("auto");
      expect(json.metadata.selectedPort).toBe(startPort + 1);
      expect(json.metadata.candidateAttempts).toBe(2);
      expect(json.metadata.bindHost).toBe("127.0.0.1");
      expect(json.metadata.probeHost).toBe("127.0.0.1");
      await expectProcessGone(pidPath);
    } finally {
      await closeServer(occupied);
    }
  }, 20_000);

  it("degrades after bounded auto-port exhaustion", async () => {
    ensureBuildMarker();
    const startPort = await findConsecutivePorts(2);
    const first = await listenOn(startPort);
    const second = await listenOn(startPort + 1);

    try {
      const result = runHarness(["smoke", "--json"], {
        HARNESS_SMOKE_AUTO_START: String(startPort),
        HARNESS_SMOKE_AUTO_MAX_ATTEMPTS: "2",
      });

      expect(result.status).toBe(2);
      const json = parseJson(result);
      expect(json.verdict).toBe("degraded");
      expect(json.metadata.reason).toBe("auto_port_exhausted");
      expect(json.metadata.candidateAttempts).toBe(2);
      expect(first.listening).toBe(true);
      expect(second.listening).toBe(true);
    } finally {
      await closeServer(first);
      await closeServer(second);
    }
  }, 20_000);

  it("uses race-safe locks so concurrent auto smoke runs choose distinct ports", async () => {
    ensureBuildMarker();
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const fakeNpm = createFakeNpm();
    const startPort = await findConsecutivePorts(2);

    const env = {
      HARNESS_NPM_BIN: fakeNpm,
      HARNESS_SMOKE_AUTO_START: String(startPort),
      HARNESS_SMOKE_AUTO_MAX_ATTEMPTS: "2",
      HARNESS_SMOKE_READINESS_ATTEMPTS: "5",
      FAKE_NPM_RECORD: recordPath,
      FAKE_NPM_LISTEN_DELAY_MS: "500",
    };
    const first = runHarnessAsync(["smoke", "--json", "--port", "auto"], env, 20_000);
    const second = runHarnessAsync(["smoke", "--json", "--port", "auto"], env, 20_000);

    const results = await Promise.all([first.done, second.done]);
    expect(results.map((result) => result.status).sort()).toEqual([0, 0]);
    const json = results.map(parseAsyncJson);
    const selectedPorts = json.map((result) => result.metadata.selectedPort).sort();
    expect(selectedPorts).toEqual([startPort, startPort + 1]);
    await expectPathGone(smokeLockDir(startPort));
    await expectPathGone(smokeLockDir(startPort + 1));
  });

  it("scopes smoke lock paths by repo realpath identity", async () => {
    ensureBuildMarker();
    const fakeNpm = createFakeNpm();
    const port = await findConsecutivePorts(1);
    const siblingIdentity = path.join(testDir, "sibling-worktree");
    const currentIdentity = path.join(testDir, "current-worktree");
    mkdirSync(siblingIdentity, { recursive: true });
    mkdirSync(currentIdentity, { recursive: true });
    const siblingLock = writeSmokeOwnerMetadata(port, siblingIdentity, {
      parentPid: process.pid,
      status: "reserved",
    });

    try {
      const result = runHarness(["smoke", "--json", "--port", String(port)], {
        HARNESS_NPM_BIN: fakeNpm,
        HARNESS_SMOKE_REPO_REALPATH: currentIdentity,
      });

      expect(result.status).toBe(0);
      expect(parseJson(result).metadata.selectedPort).toBe(port);
      expect(existsSync(siblingLock)).toBe(true);
      await expectPathGone(smokeLockDir(port, currentIdentity));
    } finally {
      rmSync(siblingLock, { recursive: true, force: true });
    }
  });

  it("cleans stale lock metadata when the recorded process is gone", async () => {
    ensureBuildMarker();
    const fakeNpm = createFakeNpm();
    const port = await findConsecutivePorts(1);
    const staleLock = writeSmokeOwnerMetadata(port, repoRealpath, {
      parentPid: 99_999_999,
      childPid: 99_999_998,
      processGroupId: 99_999_998,
      status: "started",
    });

    const result = runHarness(["smoke", "--json", "--port", String(port)], {
      HARNESS_NPM_BIN: fakeNpm,
    });

    expect(result.status).toBe(0);
    expect(parseJson(result).metadata.selectedPort).toBe(port);
    await expectPathGone(staleLock);
  });

  it("does not kill a live process when lock ownership is not proven", async () => {
    ensureBuildMarker();
    const fakeNpm = createFakeNpm();
    const startPort = await findConsecutivePorts(2);
    const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    expect(unrelated.pid).toBeTruthy();
    const unrelatedPid = unrelated.pid as number;
    const unprovenLock = writeSmokeOwnerMetadata(startPort, repoRealpath, {
      parentPid: 99_999_999,
      childPid: unrelatedPid,
      processGroupId: null,
      commandSummary: "not the expected smoke command",
      status: "started",
    });

    try {
      expect(processIsAlive(unrelatedPid)).toBe(true);
      const result = runHarness(["smoke", "--json", "--port", "auto"], {
        HARNESS_NPM_BIN: fakeNpm,
        HARNESS_SMOKE_AUTO_START: String(startPort),
        HARNESS_SMOKE_AUTO_MAX_ATTEMPTS: "2",
      });

      expect(result.status).toBe(0);
      const json = parseJson(result);
      expect(json.metadata.selectedPort).toBe(startPort + 1);
      expect(processIsAlive(unrelatedPid)).toBe(true);
      expect(existsSync(unprovenLock)).toBe(true);
    } finally {
      if (processIsAlive(unrelatedPid)) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 1_000);
          unrelated.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
          try {
            process.kill(unrelatedPid, "SIGTERM");
          } catch {
            clearTimeout(timer);
            resolve();
          }
        });
      }
      rmSync(unprovenLock, { recursive: true, force: true });
    }
  });

  it("cleans owned child and lock metadata after readiness timeout", async () => {
    ensureBuildMarker();
    const fakeNpm = createFakeNpm();
    const pidPath = path.join(testDir, "timeout-start.pid");
    const port = await findConsecutivePorts(1);
    const lockDir = smokeLockDir(port);

    const result = runHarness(["smoke", "--json", "--port", String(port)], {
      HARNESS_NPM_BIN: fakeNpm,
      HARNESS_SMOKE_READINESS_ATTEMPTS: "1",
      FAKE_NPM_START_PID: pidPath,
      FAKE_NPM_START_MODE: "hang",
    });

    expect(result.status).toBe(1);
    expect(parseJson(result).metadata.reason).toBe("readiness_timeout");
    await expectProcessGone(pidPath);
    await expectPathGone(lockDir);
  });

  it("cleans owned child and lock metadata when smoke is interrupted", async () => {
    ensureBuildMarker();
    const fakeNpm = createFakeNpm();
    const pidPath = path.join(testDir, "interrupted-start.pid");
    const port = await findConsecutivePorts(1);
    const lockDir = smokeLockDir(port);

    const running = runHarnessAsync(
      ["smoke", "--json", "--port", String(port)],
      {
        HARNESS_NPM_BIN: fakeNpm,
        HARNESS_SMOKE_READINESS_ATTEMPTS: "60",
        FAKE_NPM_START_PID: pidPath,
        FAKE_NPM_START_MODE: "hang",
      },
      20_000,
    );
    await waitForFile(pidPath);
    await waitForFile(path.join(lockDir, "owner.json"));
    const owner = JSON.parse(readFileSync(path.join(lockDir, "owner.json"), "utf8"));
    expect(owner).toMatchObject({
      kind: "devdeck-harness-smoke",
      repoIdentity: smokeRepoHash(repoRealpath),
      repoRealpath,
      port,
      commandSummary: smokeCommandSummary(port),
      status: "started",
    });
    expect(typeof owner.parentPid).toBe("number");
    expect(typeof owner.childPid).toBe("number");
    expect(typeof owner.processGroupId).toBe("number");
    running.child.kill("SIGTERM");
    const result = await running.done;

    expect(result.status).toBe(1);
    await expectProcessGone(pidPath);
    await expectPathGone(lockDir);
  });

  it("fails HTTP 4xx readiness without leaking noisy server output and cleans up", async () => {
    ensureBuildMarker();
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const pidPath = path.join(testDir, "start.pid");
    const fakeNpm = createFakeNpm();
    const startPort = await findConsecutivePorts(1);

    const result = runHarness(["smoke", "--json", "--port", String(startPort)], {
      DEVDECK_TOKEN: "super-secret",
      HARNESS_NPM_BIN: fakeNpm,
      FAKE_NPM_RECORD: recordPath,
      FAKE_NPM_START_PID: pidPath,
      FAKE_NPM_START_MODE: "http4xx",
      FAKE_NPM_NOISY: "1",
    });

    expect(result.status).toBe(1);
    const json = parseJson(result);
    expect(json.verdict).toBe("fail");
    expect(json.metadata.reason).toBe("http_4xx");
    expect(String(result.stdout)).not.toContain("super-secret");
    expect(String(result.stdout)).not.toContain("user:pass");
    expect(String(result.stdout)).not.toContain("body token");
    await expectProcessGone(pidPath);
  });

  it("maps missing backing command capability to unknown", () => {
    ensureBuildMarker();
    const missingNpm = path.join(testDir, "missing-npm");
    const result = runHarness(["smoke", "--json"], {
      HARNESS_NPM_BIN: missingNpm,
    });

    expect(result.status).toBe(3);
    const json = parseJson(result);
    expect(json.verdict).toBe("unknown");
    expect(json.metadata.reason).toBe("missing_capability");
  });
});

describe("harness e2e", () => {
  it("reports full-suite E2E JSON metadata as non-targeted and uses isolated loopback runtime", async () => {
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const fakeNpm = createFakeNpm();
    const webStart = await findConsecutivePortsInRange(42000, 42999, 1);
    const terminalStart = await findConsecutivePortsInRange(43000, 43999, 1);

    const result = runHarness(["e2e", "--json"], {
      HARNESS_NPM_BIN: fakeNpm,
      HARNESS_E2E_WEB_AUTO_START: String(webStart),
      HARNESS_E2E_TERMINAL_AUTO_START: String(terminalStart),
      FAKE_NPM_RECORD: recordPath,
    });

    expect(result.status).toBe(0);
    const json = parseJson(result);
    expect(json.command).toBe("npm run e2e");
    expect(json.metadata).toMatchObject({
      targeted: false,
      targets: [],
      targetCount: 0,
      truncated: false,
      testCounts: { passed: 1, failed: 0, skipped: 1, timedOut: 0, interrupted: 0 },
      webHost: "127.0.0.1",
      webPort: webStart,
      terminalHost: "127.0.0.1",
      terminalPort: terminalStart,
      artifactPaths: [],
    });
    expect(json.metadata.e2e).toMatchObject({
      targeted: false,
      targets: [],
      targetCount: 0,
      truncated: false,
      testCounts: { passed: 1, failed: 0, skipped: 1, timedOut: 0, interrupted: 0 },
      webHost: "127.0.0.1",
      webPort: webStart,
      terminalHost: "127.0.0.1",
      terminalPort: terminalStart,
      artifactPaths: [],
    });
    expect(json.metadata.fixtureRunId).toMatch(/^e2e-/);
    expect(json.metadata.e2e.fixtureRunId).toMatch(/^e2e-/);
    expect(json.steps[0].metadata).toEqual(json.metadata);

    const e2eRecord = readRecords(recordPath).find((record) => record.event === "e2e");
    expect(e2eRecord.forwarded).toEqual([]);
    expect(e2eRecord.env).toMatchObject({
      webHost: "127.0.0.1",
      webPort: String(webStart),
      terminalHost: "127.0.0.1",
      terminalPort: String(terminalStart),
      tokenPresent: true,
    });
    expect(e2eRecord.env.projectsDir).toContain(".harness/run/e2e-");
    expect(e2eRecord.env.dataDir).toContain(".harness/run/e2e-");
    expect(e2eRecord.env.artifactDir).toContain(".harness/run/e2e-");
    expect(existsSync(path.dirname(e2eRecord.env.projectsDir))).toBe(false);
  });

  it("forwards targeted Playwright args after -- through arrays and sanitizes labels", async () => {
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const fakeNpm = createFakeNpm();
    const tricky = "e2e/a spec; echo should-not-run.spec.ts";
    const credentialUrl = ["https://user:pass", "example.test/spec?token=secret"].join("@");

    const result = runHarness(
      [
        "e2e",
        "--json",
        "--",
        "e2e/terminal.spec.ts",
        "--project=chromium",
        "--reporter=json",
        tricky,
        credentialUrl,
      ],
      {
        HARNESS_NPM_BIN: fakeNpm,
        FAKE_NPM_RECORD: recordPath,
      },
    );

    expect(result.status).toBe(0);
    const json = parseJson(result);
    expect(json.command).toBe("npm run e2e -- <5 target(s)>");
    expect(json.metadata.targeted).toBe(true);
    expect(json.metadata.targetCount).toBe(5);
    expect(json.metadata.targets).toContain("e2e/terminal.spec.ts");
    expect(json.metadata.targets).toContain("--reporter=json");
    expect(json.metadata.targets).toContain(tricky);
    expect(json.metadata.targets).toContain("[redacted-url]");
    expect(json.metadata.playwrightProjects).toEqual(["chromium"]);
    expect(json.metadata.e2e.targets).toEqual(json.metadata.targets);
    expect(json.metadata.e2e.playwrightProjects).toEqual(["chromium"]);
    expect(json.metadata.e2e.testCounts).toEqual({
      passed: 1,
      failed: 0,
      skipped: 1,
      timedOut: 0,
      interrupted: 0,
    });
    expect(String(result.stdout)).not.toContain("?token=");

    const e2eRecord = readRecords(recordPath).find((record) => record.event === "e2e");
    expect(e2eRecord.forwarded).toEqual([
      "e2e/terminal.spec.ts",
      "--project=chromium",
      "--reporter=json",
      tricky,
      credentialUrl,
    ]);
  });

  it("rejects non-delimited Playwright arguments before they can be forwarded", () => {
    const result = runHarness(["e2e", "--json", "e2e/terminal.spec.ts"]);

    expect(result.status).toBe(1);
    const json = parseJson(result);
    expect(json.verdict).toBe("fail");
    expect(json.message).toContain("must follow --");
  });

  it.each([
    ["missing npm", { HARNESS_NPM_BIN: path.join(testDir, "missing-npm") }, 3, "unknown"],
    ["missing playwright", { HARNESS_E2E_FORCE_NO_PLAYWRIGHT: "1" }, 3, "unknown"],
    ["playwright failure", { FAKE_NPM_E2E_EXIT: "1" }, 1, "fail"],
    ["playwright timeout", { FAKE_NPM_E2E_EXIT: "124" }, 1, "fail"],
  ])("maps E2E capability and failure verdicts: %s", (_name, env, status, verdict) => {
    const fakeNpm = createFakeNpm();
    const result = runHarness(["e2e", "--json"], {
      HARNESS_NPM_BIN: fakeNpm,
      ...env,
    });

    expect(result.status).toBe(status);
    const json = parseJson(result);
    expect(json.verdict).toBe(verdict);
    expect(json.metadata.e2e.testCounts).toMatchObject({
      passed: expect.any(Number),
      failed: expect.any(Number),
      skipped: expect.any(Number),
      timedOut: expect.any(Number),
      interrupted: expect.any(Number),
    });
  });

  it("reports fixed E2E port conflicts as degraded without killing listeners", async () => {
    const fakeNpm = createFakeNpm();
    const occupied = await listenOn(0);
    const webPort = (occupied.address() as net.AddressInfo).port;
    const terminalPort = await findConsecutivePortsInRange(43000, 43999, 1);

    try {
      const result = runHarness(["e2e", "--json"], {
        HARNESS_NPM_BIN: fakeNpm,
        DEVDECK_E2E_WEB_PORT: String(webPort),
        DEVDECK_E2E_TERMINAL_PORT: String(terminalPort),
      });

      expect(result.status).toBe(2);
      const json = parseJson(result);
      expect(json.verdict).toBe("degraded");
      expect(json.metadata.reason).toBe("fixed_web_port_in_use");
      expect(json.metadata.e2e.reason).toBe("fixed_web_port_in_use");
      expect(json.metadata.e2e.testCounts).toEqual({
        passed: 0,
        failed: 0,
        skipped: 0,
        timedOut: 0,
        interrupted: 0,
      });
      await expect(canConnect(webPort)).resolves.toBe(true);
      expect(occupied.listening).toBe(true);
    } finally {
      await closeServer(occupied);
    }
  });

  it("uses E2E locks so concurrent runs choose distinct port pairs and clean scratch state", async () => {
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const fakeNpm = createFakeNpm();
    const webStart = await findConsecutivePortsInRange(42000, 42999, 2);
    const terminalStart = await findConsecutivePortsInRange(43000, 43999, 2);
    const env = {
      HARNESS_NPM_BIN: fakeNpm,
      HARNESS_E2E_WEB_AUTO_START: String(webStart),
      HARNESS_E2E_TERMINAL_AUTO_START: String(terminalStart),
      HARNESS_E2E_AUTO_MAX_ATTEMPTS: "2",
      FAKE_NPM_RECORD: recordPath,
    };

    const first = runHarnessAsync(["e2e", "--json"], env, 20_000);
    const second = runHarnessAsync(["e2e", "--json"], env, 20_000);
    const results = await Promise.all([first.done, second.done]);

    expect(results.map((result) => result.status).sort()).toEqual([0, 0]);
    const json = results.map(parseAsyncJson);
    expect(json.map((result) => result.metadata.webPort).sort()).toEqual([webStart, webStart + 1]);
    expect(json.map((result) => result.metadata.terminalPort).sort()).toEqual([
      terminalStart,
      terminalStart + 1,
    ]);
    await expectPathGone(e2eLockDir("web", webStart));
    await expectPathGone(e2eLockDir("web", webStart + 1));
    await expectPathGone(e2eLockDir("terminal", terminalStart));
    await expectPathGone(e2eLockDir("terminal", terminalStart + 1));
  });

  it("keeps checked-in E2E fixtures immutable by mutating only scratch copies", () => {
    const seedPath = path.join(
      repoRoot,
      "e2e",
      "fixtures",
      "projects",
      "immutable-seed",
      "README.md",
    );
    const before = readFileSync(seedPath, "utf8");
    const fakeNpm = createFakeNpm();

    const result = runHarness(["e2e", "--json"], {
      HARNESS_NPM_BIN: fakeNpm,
      FAKE_NPM_E2E_MUTATE_FIXTURE_REL: path.join("immutable-seed", "README.md"),
    });

    expect(result.status).toBe(0);
    expect(readFileSync(seedPath, "utf8")).toBe(before);
  });

  it("asserts Playwright config uses loopback harness env and does not reuse servers", () => {
    const config = readFileSync(path.join(repoRoot, "playwright.config.ts"), "utf8");

    expect(config).toContain('process.env.DEVDECK_E2E_WEB_HOST ?? "127.0.0.1"');
    expect(config).toContain('process.env.DEVDECK_E2E_TERMINAL_HOST ?? "127.0.0.1"');
    expect(config).toContain("DEVDECK_PROJECTS_DIR");
    expect(config).toContain("DEVDECK_DATA_DIR");
    expect(config).toContain("DEVDECK_E2E_ARTIFACT_DIR");
    expect(config).toContain(
      'path.join(process.cwd(), ".harness", "run", "playwright-fixtures", ".devdeck-data")',
    );
    expect(config).toContain("playwright-artifacts-${process.pid}");
    expect(config).not.toContain("--hostname 0.0.0.0");
    expect(config).not.toContain('"test-results/playwright-results.json"');
    expect(config.match(/reuseExistingServer:\s*false/g)).toHaveLength(2);
  });

  it("asserts CI runs non-browser gates and leaves Playwright E2E local-only", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
    const npmCiIndex = workflow.indexOf("npm ci");
    const lintIndex = workflow.indexOf("./harness lint");
    const formatIndex = workflow.indexOf("./harness format_check");
    const buildIndex = workflow.indexOf("./harness build");
    const testIndex = workflow.indexOf("./harness test");
    const smokeIndex = workflow.indexOf("./harness smoke");

    expect(npmCiIndex).toBeGreaterThanOrEqual(0);
    expect(lintIndex).toBeGreaterThan(npmCiIndex);
    expect(formatIndex).toBeGreaterThan(lintIndex);
    expect(buildIndex).toBeGreaterThan(formatIndex);
    expect(testIndex).toBeGreaterThan(buildIndex);
    expect(smokeIndex).toBeGreaterThan(testIndex);
    expect(workflow).toContain("timeout-minutes: 60");
    expect(workflow).toContain("timeout-minutes: 45");
    expect(workflow).not.toContain("playwright install");
    expect(workflow).not.toContain("npm run format:check");
    expect(workflow).not.toContain("./harness e2e");
    expect(workflow).not.toContain("./harness verify");
  });
});

describe("harness verify shared smoke evidence", () => {
  it("continues after earlier failures and records sanitized smoke evidence", async () => {
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const fakeNpm = createFakeNpm();
    const startPort = await findConsecutivePorts(1);

    const result = runHarness(["verify", "--json"], {
      HARNESS_NPM_BIN: fakeNpm,
      HARNESS_SMOKE_AUTO_START: String(startPort),
      FAKE_NPM_RECORD: recordPath,
      FAKE_NPM_LINT_EXIT: "1",
    });

    expect(result.status).toBe(1);
    const json = parseJson(result);
    expect(json.verdict).toBe("fail");
    expect(json.steps.map((step: { name: string }) => step.name)).toEqual([
      "lint",
      "format_check",
      "build",
      "test",
      "smoke",
      "e2e",
    ]);
    const records = readRecords(recordPath).filter((record) => record.event === "invoke");
    expect(records.map((record) => record.args.slice(0, 2).join(" "))).toEqual([
      "run lint",
      "run format:check",
      "run build",
      "run test",
      "run start",
      "run e2e",
    ]);

    const evidencePath = path.join(repoRoot, json.evidence);
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    const smokeStep = evidence.steps.find((step: { name: string }) => step.name === "smoke");
    expect(smokeStep.metadata).toEqual({
      portMode: "auto",
      selectedPort: startPort,
      httpStatus: 200,
      timeoutSeconds: 60,
      pollIntervalMs: 1000,
    });
    const jsonSmokeStep = json.steps.find((step: { name: string }) => step.name === "smoke");
    expect(jsonSmokeStep.metadata).toEqual(smokeStep.metadata);
    const e2eStep = evidence.steps.find((step: { name: string }) => step.name === "e2e");
    expect(e2eStep.metadata).toMatchObject({
      targeted: false,
      targets: [],
      targetCount: 0,
      truncated: false,
      testCounts: { passed: 1, failed: 0, skipped: 1, timedOut: 0, interrupted: 0 },
      webPort: expect.any(Number),
      terminalPort: expect.any(Number),
      artifactPaths: [],
    });
    expect(e2eStep.metadata.e2e).toMatchObject({
      targeted: false,
      targets: [],
      targetCount: 0,
      truncated: false,
      testCounts: { passed: 1, failed: 0, skipped: 1, timedOut: 0, interrupted: 0 },
      webPort: expect.any(Number),
      terminalPort: expect.any(Number),
      artifactPaths: [],
    });
    expect(smokeStep.metadata.bindHost).toBeUndefined();
    expect(smokeStep.metadata.reason).toBeUndefined();
    expect(smokeStep.metadata.readinessAttempts).toBeUndefined();
    expect(JSON.stringify(evidence)).not.toContain("stdout");
    expect(JSON.stringify(evidence)).not.toContain("stderr");
    expect(JSON.stringify(evidence)).not.toContain("token=secret");
  });

  it.each([
    ["fail", "http4xx", 1, "fail", 401],
    ["unknown", "pass", 3, "unknown", null],
  ])(
    "aggregates smoke %s verdicts from the shared smoke implementation",
    async (_name, startMode, expectedStatus, expectedVerdict, expectedHttpStatus) => {
      const recordPath = path.join(testDir, "npm-record.jsonl");
      const fakeNpm = createFakeNpm();
      const startPort = await findConsecutivePorts(1);
      const env: Record<string, string> = {
        HARNESS_NPM_BIN: fakeNpm,
        HARNESS_SMOKE_AUTO_START: String(startPort),
        FAKE_NPM_RECORD: recordPath,
        FAKE_NPM_START_MODE: startMode,
      };
      if (expectedVerdict === "unknown") {
        env.HARNESS_CURL_BIN = path.join(testDir, "missing-curl");
      }

      const result = runHarness(["verify", "--json"], env);
      expect(result.status).toBe(expectedStatus);
      const json = parseJson(result);
      expect(json.verdict).toBe(expectedVerdict);
      const smokeStep = json.steps.find((step: { name: string }) => step.name === "smoke");
      expect(smokeStep.metadata).toMatchObject({
        portMode: "auto",
        httpStatus: expectedHttpStatus,
        timeoutSeconds: 60,
        pollIntervalMs: 1000,
      });
      expect(smokeStep.metadata.reason).toBeUndefined();
      expect(json.steps.map((step: { name: string }) => step.name)).toEqual([
        "lint",
        "format_check",
        "build",
        "test",
        "smoke",
        "e2e",
      ]);
    },
  );

  it("aggregates degraded smoke verdicts without treating them as failures", async () => {
    const recordPath = path.join(testDir, "npm-record.jsonl");
    const fakeNpm = createFakeNpm();
    const startPort = await findConsecutivePorts(1);
    const occupied = await listenOn(startPort);

    try {
      const result = runHarness(["verify", "--json"], {
        HARNESS_NPM_BIN: fakeNpm,
        HARNESS_SMOKE_AUTO_START: String(startPort),
        HARNESS_SMOKE_AUTO_MAX_ATTEMPTS: "1",
        FAKE_NPM_RECORD: recordPath,
      });

      expect(result.status).toBe(2);
      const json = parseJson(result);
      expect(json.verdict).toBe("degraded");
      const smokeStep = json.steps.find((step: { name: string }) => step.name === "smoke");
      expect(smokeStep.metadata).toMatchObject({
        portMode: "auto",
        selectedPort: startPort,
        httpStatus: null,
        timeoutSeconds: 60,
        pollIntervalMs: 1000,
      });
      expect(smokeStep.metadata.reason).toBeUndefined();
    } finally {
      await closeServer(occupied);
    }
  });
});

describe("harness discovery output", () => {
  it("documents smoke and targeted test commands in help and human orient output", () => {
    const help = runHarness(["help"]);
    expect(help.status).toBe(0);
    expect(String(help.stdout)).toContain("install");
    expect(String(help.stdout)).toContain("format_check");
    expect(String(help.stdout)).toContain("smoke --port auto");
    expect(String(help.stdout)).toContain("test -- src/server/start-dev.test.ts");
    expect(String(help.stdout)).toContain("e2e -- e2e/terminal.spec.ts");

    const orient = runHarness(["orient"]);
    expect(orient.status).toBe(0);
    expect(String(orient.stdout)).toContain("test -- <args>");
    expect(String(orient.stdout)).toContain("install");
    expect(String(orient.stdout)).toContain("format_check");
    expect(String(orient.stdout)).toContain("smoke");
    expect(String(orient.stdout)).toContain("e2e -- <args>");
  });

  it("exposes smoke and targeted test fields in orient JSON", () => {
    const result = runHarness(["orient", "--json"]);
    expect(result.status).toBe(0);
    const json = parseJson(result);
    expect(json.verbs).toBeUndefined();
    expect(json.surfaces.harness_contract.verbs).toEqual([
      "help",
      "orient",
      "doctor",
      "install",
      "lint",
      "format_check",
      "test",
      "e2e",
      "build",
      "boot",
      "smoke",
      "verify",
      "status",
      "clean",
      "friction add",
      "friction list",
    ]);
    expect(json.surfaces.harness_contract.verify_steps).toEqual([
      "lint",
      "format_check",
      "build",
      "test",
      "smoke",
      "e2e",
    ]);
    expect(json.commands.smoke.command).toBe(
      "npm run start -- --hostname 127.0.0.1 --port <selectedPort>",
    );
    expect(json.commands.install.command).toBe("npm ci");
    expect(json.commands.format_check.command).toBe("npm run format:check");
    expect(json.commands.smoke.portModeDefault).toBe("auto");
    expect(json.commands.smoke.defaultPortMode).toBeUndefined();
    expect(json.commands.test.command).toBe("npm run test [-- <targets>]");
    expect(json.commands.e2e.command).toBe("npm run e2e [-- <playwright args>]");
    expect(json.commands.e2e.runner).toBe("Playwright");
    expect(json.commands.test.supportsTargets).toBe(true);
    expect(json.commands.e2e.supportsTargets).toBe(true);
    expect(json.commands.smoke.usage).toBe("./harness smoke [--port auto|PORT] [--json]");
    expect(json.commands.test.passthrough).toBe("./harness test -- <vitest args...>");
    expect(json.commands.e2e.passthrough).toBe("./harness e2e -- <playwright args...>");
  });
});
