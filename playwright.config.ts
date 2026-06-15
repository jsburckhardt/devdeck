import { defineConfig } from "@playwright/test";
import path from "path";

const DEVDECK_TOKEN = process.env.DEVDECK_TOKEN ?? "e2e-test-token";
const E2E_PROJECTS_DIR = path.join(process.cwd(), "e2e", "fixtures", "projects");
const E2E_DATA_DIR = path.join(process.cwd(), "e2e", "fixtures", ".devdeck-data");
const E2E_WEB_PORT = Number(process.env.DEVDECK_E2E_WEB_PORT ?? 8070);
const E2E_TERMINAL_PORT = Number(process.env.DEVDECK_E2E_TERMINAL_PORT ?? 3100);
const webServerEnv = {
  DEVDECK_TOKEN,
  DEVDECK_PROJECTS_DIR: E2E_PROJECTS_DIR,
  DEVDECK_DATA_DIR: E2E_DATA_DIR,
  TERMINAL_PORT: String(E2E_TERMINAL_PORT),
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 0,
  use: {
    headless: true,
    baseURL: `http://localhost:${E2E_WEB_PORT}`,
  },
  webServer: [
    {
      command: "npm run terminal",
      port: E2E_TERMINAL_PORT,
      reuseExistingServer: true,
      timeout: 10000,
      env: webServerEnv,
    },
    {
      command: `npx next dev --turbopack --hostname 0.0.0.0 --port ${E2E_WEB_PORT}`,
      port: E2E_WEB_PORT,
      reuseExistingServer: true,
      timeout: 30000,
      env: webServerEnv,
    },
  ],
});
