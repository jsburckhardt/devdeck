import { WebSocketServer, WebSocket } from "ws";
import { spawn, type IPty } from "node-pty";
import { execFile } from "child_process";
import { timingSafeEqual } from "crypto";
import { homedir } from "os";
import fs from "fs/promises";
import path from "path";
import type { IncomingMessage } from "http";

const MAX_CONTROL_MESSAGE_BYTES = 1024;

// Inlined from src/lib/types.ts — cannot use @/ path aliases in standalone .mts
type CopilotCliState = "idle" | "running" | "waiting";

const COPILOT_IDLE_TIMEOUT_MS = 30_000;

const ANSI_RE = /[\u001b\u009b][\[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

const ACTIVITY_SPINNERS = /(?:^|\n)\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷◐◓◑◒✦✧◆◇●](?:\s|$)/m;
const COPILOT_ACTIVITY_TEXT =
  /(?:^|\n)\s*(?:(?:Copilot|assistant|agent).*(?:thinking|working|running|processing|executing|searching|reading|writing|analyzing|planning|implementing|verifying)|(?:Thinking|Working|Processing|Generating|Analyzing|Planning|Implementing|Verifying)(?:[ .…:]|$)|Running (?:command|task|tool)|Executing (?:command|tool)|Using (?:tool|bash|apply_patch|rg|view))/im;
const WAITING_PROMPT =
  /(?:^|\n)(?:\? |.*> $|.*\[y\/N\]|\s*(?:Waiting for input|.*requires confirmation|Press Enter to continue|.*continue\?|.*(?:approve|allow).*\?))/im;
const SHELL_PROMPT = /(?:\$|%|#|❯)\s*$/m;

export function detectCopilotState(strippedOutput: string): CopilotCliState | null {
  if (!strippedOutput) return null;
  if (ACTIVITY_SPINNERS.test(strippedOutput) || COPILOT_ACTIVITY_TEXT.test(strippedOutput)) {
    return "running";
  }
  if (WAITING_PROMPT.test(strippedOutput)) return "waiting";
  if (SHELL_PROMPT.test(strippedOutput)) return "idle";
  return null;
}

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

function extractDimensions(req: IncomingMessage): { cols: number; rows: number } {
  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    const rawCols = Number(url.searchParams.get("cols"));
    const rawRows = Number(url.searchParams.get("rows"));
    const cols = Number.isFinite(rawCols) ? Math.max(1, Math.min(500, Math.round(rawCols))) : 80;
    const rows = Number.isFinite(rawRows) ? Math.max(1, Math.min(200, Math.round(rawRows))) : 24;
    return { cols, rows };
  } catch {
    return { cols: 80, rows: 24 };
  }
}

function extractWorktree(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    const raw = url.searchParams.get("worktree");
    if (!raw) return null;
    if (path.isAbsolute(raw)) return null;
    const normalized = path.normalize(raw);
    if (normalized.startsWith("..")) return null;
    return normalized;
  } catch {
    return null;
  }
}

function sanitizeSlug(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9_-]/g, "");
}

function tmuxSessionName(slug: string): string {
  return sanitizeSlug(slug).slice(0, 64);
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
  worktree: string | null = null,
): Promise<TerminalSpawnConfig> {
  if (!slug) {
    return { command: shell, args: shellArgs, cwd: defaultCwd, mode: "shell" };
  }

  const sanitizedSlug = sanitizeSlug(slug);
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

  // Worktree override — shell-only mode in worktree directory (Decision #85)
  if (worktree) {
    const worktreeAbsPath = path.resolve(resolvedCwd, worktree);
    const relative = path.relative(resolvedCwd, worktreeAbsPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      console.log(`Worktree "${worktree}" path traversal detected, falling back to project root`);
      return { command: shell, args: shellArgs, cwd: resolvedCwd, mode: "shell" };
    }
    try {
      const worktreeStat = await fs.stat(worktreeAbsPath);
      if (!worktreeStat.isDirectory()) throw new Error("Not a directory");
      return { command: shell, args: shellArgs, cwd: worktreeAbsPath, mode: "shell" };
    } catch {
      console.log(`Worktree "${worktree}" path invalid, falling back to project root`);
      return { command: shell, args: shellArgs, cwd: resolvedCwd, mode: "shell" };
    }
  }

  // Check for tmux shared session
  const tmuxSocketPath = path.join(resolvedCwd, ".devcontainer", ".tmux-shared");
  try {
    const socketStat = await fs.stat(tmuxSocketPath);
    if (socketStat.isSocket()) {
      const sessionName = tmuxSessionName(slug);
      if (sessionName && (await tmuxHasSession(tmuxSocketPath, sessionName))) {
        return {
          command: "tmux",
          args: ["-S", tmuxSocketPath, "attach-session", "-t", sessionName],
          cwd: resolvedCwd,
          mode: "tmux",
        };
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT") {
      const sessionName = tmuxSessionName(slug);
      if (sessionName) {
        return {
          command: "tmux",
          args: ["new-session", "-A", "-s", sessionName],
          cwd: resolvedCwd,
          mode: "tmux",
        };
      }
    }
    // Non-ENOENT errors (EACCES, ENOTDIR, etc.) fall through to a regular shell
    // rather than silently creating a system-default tmux session.
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
  worktree: string | null,
  defaultCwd: string,
  shell: string,
  shellArgs: string[],
  env: Record<string, string>,
  activePtys: Set<IPty>,
  urlDimensions?: { cols: number; rows: number },
): Promise<void> {
  console.log("Client connected");

  // Queue messages that arrive during async setup
  const pendingMessages: { data: Buffer; isBinary: boolean }[] = [];
  let pty: IPty | null = null;
  let cleaned = false;
  let wsHandlersRegistered = false;
  let initialCols = urlDimensions?.cols ?? 80;
  let initialRows = urlDimensions?.rows ?? 24;
  let copilotState: CopilotCliState = "idle";
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

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
      if (pendingMessages.length < 100) {
        pendingMessages.push({ data, isBinary });
      }
      return;
    }

    handleMessage(pty, data, isBinary);
  });

  const setup = await resolveTerminalSetup(slug, defaultCwd, shell, shellArgs, worktree);

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
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
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

  function registerWebSocketHandlers() {
    if (wsHandlersRegistered) return;
    wsHandlersRegistered = true;

    ws.on("close", () => {
      console.log("Client disconnected");
      cleanupPty("ws-close");
    });

    ws.on("error", (err: Error) => {
      console.error("WebSocket error:", err.message);
      cleanupPty("ws-error");
    });
  }

  function flushPendingMessages(currentPty: IPty) {
    for (const pending of pendingMessages) {
      handleMessage(currentPty, pending.data, pending.isBinary);
    }
    pendingMessages.length = 0;
  }

  function wirePty(currentPty: IPty, isTmux: boolean) {
    currentPty.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(Buffer.from(data, "utf8"));
        } catch {
          // send failed
        }

        // Copilot CLI status detection (ADR-0005)
        const detected = detectCopilotState(stripAnsi(data));
        if (detected !== null) {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            if (copilotState !== "idle" && ws.readyState === WebSocket.OPEN) {
              copilotState = "idle";
              try {
                ws.send(JSON.stringify({ type: "status", copilotState: "idle" }));
              } catch {
                // send failed
              }
            }
          }, COPILOT_IDLE_TIMEOUT_MS);

          if (detected !== copilotState) {
            copilotState = detected;
            try {
              ws.send(JSON.stringify({ type: "status", copilotState }));
            } catch {
              // send failed
            }
          }
        }
      }
    });

    currentPty.onExit(({ exitCode }) => {
      console.log(`PTY exited (code: ${exitCode})`);

      // If tmux attach failed, fall back to a regular shell in the project directory
      if (isTmux && exitCode !== 0 && ws.readyState === WebSocket.OPEN) {
        console.log("tmux attach failed, falling back to regular shell");
        // Notify client of fallback before spawning replacement shell
        try {
          ws.send(
            JSON.stringify({
              type: "setup",
              mode: "shell",
              fallback: true,
              reason: "tmux-attach-failed",
            }),
          );
        } catch {
          /* send failed */
        }
        activePtys.delete(currentPty);
        try {
          const fallbackPty = spawn(shell, shellArgs, {
            name: "xterm-256color",
            cols: initialCols,
            rows: initialRows,
            cwd: setup.cwd,
            env: cleanPtyEnv,
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

  function spawnAndWirePty(
    command: string,
    args: string[],
    cwd: string,
    ptyEnv: Record<string, string>,
    isTmux: boolean,
  ) {
    const currentPty = spawn(command, args, {
      name: "xterm-256color",
      cols: initialCols,
      rows: initialRows,
      cwd,
      env: ptyEnv,
    });

    pty = currentPty;
    activePtys.add(currentPty);
    console.log(
      `PTY spawned (pid: ${currentPty.pid}, command: ${command}, cwd: ${cwd}, mode: ${isTmux ? "tmux" : "shell"}, cols: ${initialCols}, rows: ${initialRows})`,
    );

    wirePty(currentPty, isTmux);
    registerWebSocketHandlers();
    flushPendingMessages(currentPty);

    // Notify client of terminal session mode
    try {
      ws.send(JSON.stringify({ type: "setup", mode: isTmux ? "tmux" : "shell" }));
    } catch {
      /* send failed */
    }
  }

  function sendSpawnError(err: unknown) {
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

  try {
    spawnAndWirePty(setup.command, setup.args, setup.cwd, cleanPtyEnv, setup.mode === "tmux");
  } catch (err) {
    if (setup.mode === "tmux" && ws.readyState === WebSocket.OPEN) {
      console.error("Failed to spawn tmux, falling back to regular shell:", err);
      try {
        spawnAndWirePty(shell, shellArgs, setup.cwd, cleanPtyEnv, false);
      } catch (fallbackErr) {
        console.error("Fallback shell spawn failed:", fallbackErr);
        sendSpawnError(fallbackErr);
      }
      return;
    }

    sendSpawnError(err);
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
    const worktree = extractWorktree(req);
    const dimensions = extractDimensions(req);

    void handleConnection(
      ws,
      slug,
      worktree,
      cwd,
      shell,
      shellArgs,
      sanitizedEnv,
      activePtys,
      dimensions,
    ).catch((err) => {
      console.error("Terminal connection setup failed:", err);
      if (ws.readyState === WebSocket.OPEN) ws.close(1011, "Terminal setup failed");
    });
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
