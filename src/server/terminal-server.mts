import { WebSocketServer, WebSocket } from "ws";
import { spawn, type IPty } from "node-pty";
import { execFile } from "child_process";
import { timingSafeEqual } from "crypto";
import { homedir } from "os";
import fs from "fs/promises";
import path from "path";
import type { IncomingMessage } from "http";

const MAX_CONTROL_MESSAGE_BYTES = 1024;

const LOGIN_SHELL_SUPPORTED = new Set(["bash", "zsh", "fish", "sh"]);

const PROJECTS_DIR = process.env.DEVDECK_PROJECTS_DIR ?? "/workspaces";

// Inlined from src/lib/registry.ts to avoid @/ path alias incompatibility
// with standalone .mts ESM execution (tsx doesn't resolve tsconfig paths for .mts)
interface RegistryEntry {
  slug: string;
  path: string;
}

async function resolveProjectPath(slug: string): Promise<string> {
  const dataDir = process.env.DEVDECK_DATA_DIR ?? path.join(homedir(), ".config", "devdeck");
  const registryPath = path.join(dataDir, "registry.json");
  try {
    const content = await fs.readFile(registryPath, "utf-8");
    const registry = JSON.parse(content) as { projects: RegistryEntry[] };
    const entry = registry.projects.find((p) => p.slug === slug);
    if (entry) return entry.path;
  } catch {
    // Registry missing or unreadable — fall through to default
  }
  const sanitized = slug.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.resolve(PROJECTS_DIR, sanitized);
}

export interface TerminalServerOptions {
  port?: number;
  host?: string;
  shell?: string;
  cwd?: string;
  token?: string;
}

export interface TerminalServerHandle {
  wss: WebSocketServer;
  cleanup: () => void;
}

function validateToken(provided: string | null, expected: string | null): boolean {
  if (!expected) return true;
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function parseCookieToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)devdeck_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function extractToken(req: IncomingMessage): string | null {
  // Try query parameter first
  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    const queryToken = url.searchParams.get("token");
    if (queryToken) return queryToken;
  } catch {
    // malformed URL
  }

  // Fall back to cookie
  return parseCookieToken(req.headers.cookie);
}

function getShellArgs(shell: string): string[] {
  const basename = shell.split("/").pop() ?? "";
  return LOGIN_SHELL_SUPPORTED.has(basename) ? ["-l"] : [];
}

function extractSlug(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    return url.searchParams.get("slug");
  } catch {
    return null;
  }
}

function sanitizeSessionName(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function tmuxHasSession(socketPath: string, sessionName: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("tmux", ["-S", socketPath, "has-session", "-t", sessionName], (err) => {
      resolve(!err);
    });
  });
}

interface TerminalSpawnConfig {
  command: string;
  args: string[];
  cwd: string;
  mode: "shell" | "tmux";
}

async function resolveTerminalSetup(
  slug: string | null,
  defaultCwd: string,
  shell: string,
  shellArgs: string[],
): Promise<TerminalSpawnConfig> {
  if (!slug) {
    return { command: shell, args: shellArgs, cwd: defaultCwd, mode: "shell" };
  }

  const sanitizedSlug = sanitizeSessionName(slug);
  if (!sanitizedSlug) {
    console.log(`Slug "${slug}" invalid after sanitization, falling back to default CWD`);
    return { command: shell, args: shellArgs, cwd: defaultCwd, mode: "shell" };
  }

  let resolvedCwd: string;
  try {
    const resolvedPath = await resolveProjectPath(sanitizedSlug);
    const stat = await fs.stat(resolvedPath);
    if (!stat.isDirectory()) throw new Error("Not a directory");
    resolvedCwd = resolvedPath;
  } catch {
    console.log(`Slug "${slug}" resolved path invalid, falling back to default CWD`);
    return { command: shell, args: shellArgs, cwd: defaultCwd, mode: "shell" };
  }

  // Check for tmux shared session
  const tmuxSocketPath = path.join(resolvedCwd, ".devcontainer", ".tmux-shared");
  try {
    const socketStat = await fs.stat(tmuxSocketPath);
    if (socketStat.isSocket()) {
      if (await tmuxHasSession(tmuxSocketPath, sanitizedSlug)) {
        return {
          command: "tmux",
          args: ["-S", tmuxSocketPath, "attach-session", "-t", sanitizedSlug],
          cwd: resolvedCwd,
          mode: "tmux",
        };
      }
    }
  } catch {
    // No tmux socket — fall through to regular shell
  }

  return { command: shell, args: shellArgs, cwd: resolvedCwd, mode: "shell" };
}

function handleMessage(pty: IPty, data: Buffer, isBinary: boolean): void {
  if (isBinary) {
    try {
      pty.write(data.toString("utf8"));
    } catch {
      // write failed
    }
    return;
  }

  // Text frame — control message
  const text = data.toString("utf8");
  if (Buffer.byteLength(text, "utf8") > MAX_CONTROL_MESSAGE_BYTES) {
    return;
  }

  let msg: { type?: string; cols?: number; rows?: number };
  try {
    msg = JSON.parse(text) as { type?: string; cols?: number; rows?: number };
  } catch {
    return;
  }

  if (msg.type === "resize") {
    const rawCols = Number(msg.cols);
    const rawRows = Number(msg.rows);
    const cols = Number.isFinite(rawCols) ? Math.max(1, Math.min(500, Math.round(rawCols))) : 1;
    const rows = Number.isFinite(rawRows) ? Math.max(1, Math.min(200, Math.round(rawRows))) : 1;
    try {
      pty.resize(cols, rows);
    } catch {
      // resize failed
    }
  }
}

async function handleConnection(
  ws: WebSocket,
  slug: string | null,
  defaultCwd: string,
  shell: string,
  shellArgs: string[],
  env: Record<string, string>,
  activePtys: Set<IPty>,
): Promise<void> {
  console.log("Client connected");

  // Queue messages that arrive during async setup
  const pendingMessages: { data: Buffer; isBinary: boolean }[] = [];
  let pty: IPty | null = null;
  let cleaned = false;
  let initialCols = 80;
  let initialRows = 24;

  // Register message handler immediately to capture early resize/input
  ws.on("message", (data: Buffer, isBinary: boolean) => {
    if (!pty) {
      // PTY not yet spawned — queue or capture resize
      if (!isBinary) {
        const text = data.toString("utf8");
        if (Buffer.byteLength(text, "utf8") <= MAX_CONTROL_MESSAGE_BYTES) {
          try {
            const msg = JSON.parse(text) as { type?: string; cols?: number; rows?: number };
            if (msg.type === "resize") {
              const rawCols = Number(msg.cols);
              const rawRows = Number(msg.rows);
              initialCols = Number.isFinite(rawCols)
                ? Math.max(1, Math.min(500, Math.round(rawCols)))
                : 80;
              initialRows = Number.isFinite(rawRows)
                ? Math.max(1, Math.min(200, Math.round(rawRows)))
                : 24;
              return;
            }
          } catch {
            // not JSON
          }
        }
      }
      pendingMessages.push({ data, isBinary });
      return;
    }

    handleMessage(pty, data, isBinary);
  });

  const setup = await resolveTerminalSetup(slug, defaultCwd, shell, shellArgs);

  // Client may have disconnected during async setup
  if (ws.readyState !== WebSocket.OPEN) return;

  // Remove TMUX env var when attaching to tmux to avoid nested session issues
  const ptyEnv = setup.mode === "tmux" ? { ...env, TMUX: undefined } : env;
  const cleanPtyEnv = Object.fromEntries(
    Object.entries(ptyEnv).filter((e): e is [string, string] => typeof e[1] === "string"),
  );

  function cleanupPty(reason: string) {
    if (cleaned) return;
    cleaned = true;
    if (pty) {
      console.log(`Cleaning up PTY (pid: ${pty.pid}, reason: ${reason})`);
      activePtys.delete(pty);
      try {
        pty.kill();
      } catch {
        // already dead
      }
      pty = null;
    }
  }

  function wirePty(currentPty: IPty, isTmux: boolean) {
    currentPty.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(Buffer.from(data, "utf8"));
        } catch {
          // send failed
        }
      }
    });

    currentPty.onExit(({ exitCode }) => {
      console.log(`PTY exited (code: ${exitCode})`);

      // If tmux attach failed, fall back to a regular shell in the project directory
      if (isTmux && exitCode !== 0 && ws.readyState === WebSocket.OPEN) {
        console.log("tmux attach failed, falling back to regular shell");
        activePtys.delete(currentPty);
        try {
          const fallbackPty = spawn(shell, shellArgs, {
            name: "xterm-256color",
            cols: 80,
            rows: 24,
            cwd: setup.cwd,
            env,
          });
          pty = fallbackPty;
          activePtys.add(fallbackPty);
          console.log(
            `Fallback PTY spawned (pid: ${fallbackPty.pid}, shell: ${shell}, cwd: ${setup.cwd})`,
          );
          wirePty(fallbackPty, false);
        } catch (fallbackErr) {
          console.error("Fallback shell spawn failed:", fallbackErr);
          cleanupPty("fallback-failed");
          if (ws.readyState === WebSocket.OPEN) ws.close(1011, "PTY exited");
        }
        return;
      }

      cleanupPty("pty-exit");
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, "PTY exited");
      }
    });
  }

  try {
    pty = spawn(setup.command, setup.args, {
      name: "xterm-256color",
      cols: initialCols,
      rows: initialRows,
      cwd: setup.cwd,
      env: cleanPtyEnv,
    });

    activePtys.add(pty);
    console.log(
      `PTY spawned (pid: ${pty.pid}, command: ${setup.command}, cwd: ${setup.cwd}, mode: ${setup.mode}, cols: ${initialCols}, rows: ${initialRows})`,
    );

    wirePty(pty, setup.mode === "tmux");

    // Flush any messages that arrived during async setup
    for (const pending of pendingMessages) {
      handleMessage(pty, pending.data, pending.isBinary);
    }
    pendingMessages.length = 0;

    ws.on("close", () => {
      console.log("Client disconnected");
      cleanupPty("ws-close");
    });

    ws.on("error", (err: Error) => {
      console.error("WebSocket error:", err.message);
      cleanupPty("ws-error");
    });
  } catch (err) {
    console.error("Failed to spawn shell:", err);
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "error", message: String(err) }));
      } catch {
        // send failed
      }
      ws.close();
    }
  }
}

export function createTerminalServer(options?: TerminalServerOptions): TerminalServerHandle {
  const port = options?.port ?? Number(process.env.TERMINAL_PORT ?? 3100);
  const host = options?.host ?? process.env.TERMINAL_HOST ?? "127.0.0.1";
  const shell = options?.shell ?? process.env.SHELL ?? "/bin/bash";
  const cwd = options?.cwd ?? process.env.DEVDECK_WORKSPACE_ROOT ?? homedir();
  const token = options?.token ?? process.env.DEVDECK_TOKEN ?? null;
  const effectiveToken = token && token.trim() !== "" ? token : null;

  const sanitizedEnv = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === "string"),
  );

  const shellArgs = getShellArgs(shell);
  const wss = new WebSocketServer({ port, host });
  const activePtys = new Set<IPty>();

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // Validate token BEFORE spawning PTY
    const providedToken = extractToken(req);
    if (!validateToken(providedToken, effectiveToken)) {
      console.log("Rejected unauthenticated WebSocket connection");
      ws.close(4401, "Unauthorized");
      return;
    }

    const slug = extractSlug(req);

    void handleConnection(ws, slug, cwd, shell, shellArgs, sanitizedEnv, activePtys).catch(
      (err) => {
        console.error("Terminal connection setup failed:", err);
        if (ws.readyState === WebSocket.OPEN) ws.close(1011, "Terminal setup failed");
      },
    );
  });

  function cleanup() {
    for (const p of activePtys) {
      try {
        p.kill();
      } catch {
        // already dead
      }
    }
    activePtys.clear();
    wss.close();
  }

  return { wss, cleanup };
}

export function startTerminalServer(): TerminalServerHandle {
  const handle = createTerminalServer();

  const address = handle.wss.address();
  const addrStr =
    address && typeof address === "object" ? `${address.address}:${address.port}` : String(address);
  console.log(`Terminal WebSocket server listening on ${addrStr}`);

  const shutdown = () => {
    console.log("\nShutting down terminal server...");
    handle.cleanup();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return handle;
}

// Auto-start when run directly via tsx
// When invoked as `npx tsx src/server/terminal-server.mts`, process.argv[1] contains the file path
if (process.argv[1] && /terminal-server\.mts$/.test(process.argv[1])) {
  startTerminalServer();
}
