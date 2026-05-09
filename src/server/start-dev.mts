import { randomUUID } from "crypto";
import { spawn } from "child_process";
import type { ChildProcess } from "child_process";

const token = process.env.DEVDECK_TOKEN?.trim() || randomUUID();
const env = { ...process.env, DEVDECK_TOKEN: token };

const port = process.env.PORT ?? "8070";
const host = process.env.DEVDECK_HOST ?? "0.0.0.0";

console.log("");
console.log(`🔑 Access token: ${token}`);
console.log(`   Local:   http://localhost:${port}?token=${token}`);
console.log(`   Network: http://192.168.1.185:${port}?token=${token}`);
console.log("");

const terminal: ChildProcess = spawn("npx", ["tsx", "src/server/terminal-server.mts"], {
  env,
  stdio: "inherit",
  cwd: process.cwd(),
});

const next: ChildProcess = spawn(
  "npx",
  ["next", "dev", "--turbopack", "--hostname", host, "--port", port],
  {
    env,
    stdio: "inherit",
    cwd: process.cwd(),
  },
);

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nShutting down...");
  terminal.kill("SIGTERM");
  next.kill("SIGTERM");
  setTimeout(() => process.exit(0), 3000);
}

terminal.on("exit", (code) => {
  if (shuttingDown) return;
  console.log(`Terminal server exited (code ${code})`);
  shutdown();
});

next.on("exit", (code) => {
  if (shuttingDown) return;
  console.log(`Next.js exited (code ${code})`);
  shutdown();
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
