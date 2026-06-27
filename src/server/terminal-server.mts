import { WebSocketServer, WebSocket } from "ws";
import { spawn, type IPty } from "node-pty";
import { timingSafeEqual } from "crypto";
import type { IncomingMessage } from "http";

const MAX_CONTROL_MESSAGE_BYTES = 1024;

type CopilotCliState = "idle" | "running" | "waiting";

const COPILOT_IDLE_TIMEOUT_MS = 30_000;

const ANSI_RE = /[\u001b\u009b][\[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

const STATUS_GLYPHS = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷◐◓◑◒✦✧◆◇●⊙";
const BRAILLE_SPINNER = /(?:^|\n)\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏](?:\s|$)/m;
const RUNNING_STATUS_LINE = new RegExp(
  `(?:^|\\n)\\s*[${STATUS_GLYPHS}]\\s*(?:Thinking|Working|Processing|Generating|Analyzing|Planning|Implementing|Verifying)(?:\\.\\.\\.|…|\\s+esc\\s+cancel)?\\s*$`,
  "im",
);
const WAITING_PROMPT =
  /(?:^|\n)(?:\? |.*> $|.*\[y\/N\]|\s*(?:Waiting for (?:input|feedback)|Requires confirmation|Press Enter to continue)(?:\s+esc\s+cancel)?\s*$)/im;
const SHELL_PROMPT = /(?:\$|%|#|❯)\s*$/m;

export function detectCopilotState(strippedOutput: string): CopilotCliState | null {
  if (!strippedOutput) return null;
  if (BRAILLE_SPINNER.test(strippedOutput) || RUNNING_STATUS_LINE.test(strippedOutput)) {
    return "running";
  }
  if (WAITING_PROMPT.test(strippedOutput)) return "waiting";
  if (SHELL_PROMPT.test(strippedOutput)) return "idle";
  return null;
}

type CopilotStatusByProject = Map<string, CopilotCliState>;
type CopilotStatusSubscribers = Map<string, Set<WebSocket>>;

function copilotStatusKey(slug: string | null): string | null {
  return slug && slug.trim() !== "" ? slug : null;
}

function sendCopilotStatus(ws: WebSocket, state: CopilotCliState): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type: "status", copilotState: state }));
  } catch {
    // send failed
  }
}

function addCopilotStatusSubscriber(
  subscribers: CopilotStatusSubscribers,
  key: string | null,
  ws: WebSocket,
): void {
  if (!key) return;
  const projectSubscribers = subscribers.get(key) ?? new Set<WebSocket>();
  projectSubscribers.add(ws);
  subscribers.set(key, projectSubscribers);
}

function removeCopilotStatusSubscriber(
  subscribers: CopilotStatusSubscribers,
  key: string | null,
  ws: WebSocket,
): void {
  if (!key) return;
  const projectSubscribers = subscribers.get(key);
  if (!projectSubscribers) return;
  projectSubscribers.delete(ws);
  if (projectSubscribers.size === 0) {
    subscribers.delete(key);
  }
}

function broadcastCopilotStatus(
  subscribers: CopilotStatusSubscribers,
  key: string,
  state: CopilotCliState,
): void {
  for (const subscriber of subscribers.get(key) ?? []) {
    sendCopilotStatus(subscriber, state);
  }
}

const LOGIN_SHELL_SUPPORTED = new Set(["bash", "zsh", "fish", "sh"]);

function getShellArgs(shell: string): string[] {
  const basename = shell.split("/").pop() ?? "";
  return LOGIN_SHELL_SUPPORTED.has(basename) ? ["-l"] : [];
}

function extractToken(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    const queryToken = url.searchParams.get("token");
    if (queryToken) return queryToken;
  } catch {
    // malformed URL
  }

  return parseCookieToken(req.headers.cookie);
}

function parseCookieToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)devdeck_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function extractSlug(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    return url.searchParams.get("slug");
  } catch {
    return null;
  }
}

function extractWorktree(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    return url.searchParams.get("worktree");
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

function validateToken(provided: string | null, expected: string | null): boolean {
  if (!expected) return true;
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
  copilotStatusByProject: CopilotStatusByProject,
  copilotStatusSubscribers: CopilotStatusSubscribers,
  urlDimensions?: { cols: number; rows: number },
): Promise<void> {
  console.log("Client connected");

  const pendingMessages: { data: Buffer; isBinary: boolean }[] = [];
  let pty: IPty | null = null;
  let cleaned = false;
  let initialCols = urlDimensions?.cols ?? 80;
  let initialRows = urlDimensions?.rows ?? 24;
  const statusKey = copilotStatusKey(slug);
  let copilotState: CopilotCliState = statusKey
    ? (copilotStatusByProject.get(statusKey) ?? "idle")
    : "idle";
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  if (statusKey) {
    addCopilotStatusSubscriber(copilotStatusSubscribers, statusKey, ws);
  }

  const cleanupPty = (reason: string) => {
    if (cleaned) return;
    cleaned = true;
    if (statusKey) {
      removeCopilotStatusSubscriber(copilotStatusSubscribers, statusKey, ws);
    }
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
  };

  const registerWebSocketHandlers = () => {
    ws.on("close", () => {
      console.log("Client disconnected");
      cleanupPty("ws-close");
    });

    ws.on("error", (err: Error) => {
      console.error("WebSocket error:", err.message);
      cleanupPty("ws-error");
    });
  };

  const flushPendingMessages = (currentPty: IPty) => {
    for (const pending of pendingMessages) {
      handleMessage(currentPty, pending.data, pending.isBinary);
    }
    pendingMessages.length = 0;
  };

  const updateCopilotState = (nextState: CopilotCliState) => {
    if (!statusKey) return;
    const cachedState = copilotStatusByProject.get(statusKey) ?? "idle";
    const stateChanged = nextState !== copilotState || nextState !== cachedState;
    copilotState = nextState;
    if (!stateChanged) return;

    copilotStatusByProject.set(statusKey, nextState);
    broadcastCopilotStatus(copilotStatusSubscribers, statusKey, nextState);
  };

  ws.on("message", (data: Buffer, isBinary: boolean) => {
    if (!pty) {
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

  try {
    const currentPty = spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols: initialCols,
      rows: initialRows,
      cwd: defaultCwd,
      env: Object.fromEntries(
        Object.entries(env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
    });
    pty = currentPty;
    activePtys.add(currentPty);
    console.log(
      `PTY spawned (pid: ${currentPty.pid}, shell: ${shell}, cwd: ${defaultCwd}, cols: ${initialCols}, rows: ${initialRows})`,
    );

    currentPty.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(Buffer.from(data, "utf8"));
        } catch {
          // send failed
        }

        const detected = detectCopilotState(stripAnsi(data));
        if (detected !== null) {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            if (copilotState !== "idle" && ws.readyState === WebSocket.OPEN) {
              updateCopilotState("idle");
            }
          }, COPILOT_IDLE_TIMEOUT_MS);

          updateCopilotState(detected);
        }
      }
    });

    currentPty.onExit(({ exitCode }) => {
      console.log(`PTY exited (code: ${exitCode})`);
      cleanupPty("pty-exit");
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, "PTY exited");
      }
    });

    registerWebSocketHandlers();
    flushPendingMessages(currentPty);

    try {
      ws.send(JSON.stringify({ type: "setup", mode: "shell" }));
    } catch {
      // send failed
    }

    if (statusKey) {
      sendCopilotStatus(ws, copilotStatusByProject.get(statusKey) ?? "idle");
    }
  } catch (err) {
    console.error("Failed to spawn shell:", err);
    cleanupPty("spawn-error");
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "error", message: String(err) }));
      } catch {
        // send failed
      }
      ws.close(1011, "PTY spawn failed");
    }
  }
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

export function createTerminalServer(options?: TerminalServerOptions): TerminalServerHandle {
  const port = options?.port ?? Number(process.env.TERMINAL_PORT ?? 3100);
  const host = options?.host ?? process.env.TERMINAL_HOST ?? "127.0.0.1";
  const shell = options?.shell ?? process.env.SHELL ?? "/bin/bash";
  const cwd = options?.cwd ?? process.env.DEVDECK_WORKSPACE_ROOT ?? process.cwd();
  const token = options?.token ?? process.env.DEVDECK_TOKEN ?? null;
  const effectiveToken = token && token.trim() !== "" ? token : null;

  const sanitizedEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const shellArgs = getShellArgs(shell);
  const wss = new WebSocketServer({ port, host });
  const activePtys = new Set<IPty>();
  const copilotStatusByProject: CopilotStatusByProject = new Map();
  const copilotStatusSubscribers: CopilotStatusSubscribers = new Map();

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const providedToken = extractToken(req);
    if (!validateToken(providedToken, effectiveToken)) {
      console.log("Rejected unauthenticated WebSocket connection");
      ws.close(4401, "Unauthorized");
      return;
    }

    const slug = extractSlug(req);
    const worktree = extractWorktree(req);
    const hasUnsupportedContext = slug !== null || worktree !== null;
    if (hasUnsupportedContext) {
      console.log("Rejected unsupported terminal context");
      try {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Project-scoped terminals are not supported by the default terminal.",
          }),
        );
      } catch {
        // send failed
      }
      ws.close(1008, "Unsupported terminal context");
      return;
    }

    const dimensions = extractDimensions(req);
    void handleConnection(
      ws,
      slug,
      cwd,
      shell,
      shellArgs,
      sanitizedEnv,
      activePtys,
      copilotStatusByProject,
      copilotStatusSubscribers,
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
    console.log("Shutting down terminal server...");
    handle.cleanup();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return handle;
}

if (process.argv[1] && /terminal-server\.mts$/.test(process.argv[1])) {
  startTerminalServer();
}
