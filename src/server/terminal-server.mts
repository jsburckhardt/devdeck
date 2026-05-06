import { WebSocketServer, WebSocket } from "ws";
import { spawn, type IPty } from "node-pty";
import os from "os";

const PORT = Number(process.env.TERMINAL_PORT ?? 3100);
const HOST = process.env.TERMINAL_HOST ?? "127.0.0.1";
const SHELL = process.env.SHELL ?? (os.platform() === "win32" ? "powershell.exe" : "bash");

const wss = new WebSocketServer({ port: PORT, host: HOST });
const activePtys = new Set<IPty>();

console.log(`Terminal WebSocket server listening on ${HOST}:${PORT}`);

wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected");

  let pty: IPty | null = null;

  try {
    pty = spawn(SHELL, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: process.env.HOME ?? "/",
      env: process.env as Record<string, string>,
    });

    activePtys.add(pty);

    pty.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    pty.onExit(({ exitCode }) => {
      console.log(`Shell exited with code ${exitCode}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    ws.on("message", (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "input" && pty) {
          pty.write(msg.data);
        } else if (msg.type === "resize" && pty) {
          const cols = Math.max(1, Math.min(500, msg.cols));
          const rows = Math.max(1, Math.min(200, msg.rows));
          pty.resize(cols, rows);
        }
      } catch {
        // If not JSON, treat as raw input
        if (pty) {
          pty.write(raw.toString());
        }
      }
    });

    ws.on("close", () => {
      console.log("Client disconnected");
      if (pty) {
        activePtys.delete(pty);
        pty.kill();
        pty = null;
      }
    });

    ws.on("error", (err: Error) => {
      console.error("WebSocket error:", err.message);
      if (pty) {
        activePtys.delete(pty);
        pty.kill();
        pty = null;
      }
    });
  } catch (err) {
    console.error("Failed to spawn shell:", err);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(`\r\nFailed to start terminal: ${err}\r\n`);
      ws.close();
    }
  }
});

process.on("SIGINT", () => {
  console.log("\nShutting down terminal server...");
  for (const pty of activePtys) {
    pty.kill();
  }
  activePtys.clear();
  wss.close();
  process.exit(0);
});
