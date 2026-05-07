import { WebSocketServer, WebSocket } from "ws";
import { spawn, type IPty } from "node-pty";
import { timingSafeEqual } from "crypto";
import { homedir } from "os";
import type { IncomingMessage } from "http";

const MAX_CONTROL_MESSAGE_BYTES = 1024;

const LOGIN_SHELL_SUPPORTED = new Set(["bash", "zsh", "fish", "sh"]);

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

    console.log("Client connected");
    let pty: IPty | null = null;
    let cleaned = false;

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

    try {
      pty = spawn(shell, shellArgs, {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd,
        env: sanitizedEnv,
      });

      activePtys.add(pty);
      console.log(`PTY spawned (pid: ${pty.pid}, shell: ${shell}, cwd: ${cwd})`);

      pty.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(Buffer.from(data, "utf8"));
          } catch {
            // send failed
          }
        }
      });

      pty.onExit(({ exitCode }) => {
        console.log(`PTY exited (code: ${exitCode})`);
        cleanupPty("pty-exit");
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1011, "PTY exited");
        }
      });

      ws.on("message", (data: Buffer, isBinary: boolean) => {
        if (!pty) return;

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
          const cols = Number.isFinite(rawCols)
            ? Math.max(1, Math.min(500, Math.round(rawCols)))
            : 1;
          const rows = Number.isFinite(rawRows)
            ? Math.max(1, Math.min(200, Math.round(rawRows)))
            : 1;
          try {
            pty.resize(cols, rows);
          } catch {
            // resize failed
          }
        }
      });

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
