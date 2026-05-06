import { WebSocketServer, WebSocket } from "ws";
import { spawn, type IPty } from "node-pty";

const MAX_CONTROL_MESSAGE_BYTES = 1024;

export interface TerminalServerOptions {
  port?: number;
  host?: string;
  shell?: string;
  cwd?: string;
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

  const sanitizedEnv = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === "string"),
  );

  const wss = new WebSocketServer({ port, host });
  const activePtys = new Set<IPty>();

  wss.on("connection", (ws: WebSocket) => {
    let pty: IPty | null = null;
    let cleaned = false;

    function cleanupPty() {
      if (cleaned) return;
      cleaned = true;
      if (pty) {
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
      pty = spawn(shell, [], {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd,
        env: sanitizedEnv,
      });

      activePtys.add(pty);

      pty.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(Buffer.from(data, "utf8"));
          } catch {
            // send failed
          }
        }
      });

      pty.onExit(() => {
        cleanupPty();
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
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
          const cols = Number.isFinite(rawCols) ? Math.max(1, Math.min(500, rawCols)) : 1;
          const rows = Number.isFinite(rawRows) ? Math.max(1, Math.min(200, rawRows)) : 1;
          try {
            pty.resize(cols, rows);
          } catch {
            // resize failed
          }
        }
      });

      ws.on("close", () => {
        cleanupPty();
      });

      ws.on("error", () => {
        cleanupPty();
      });
    } catch (err) {
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
