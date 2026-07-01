import { defineConfig, devices } from "@playwright/test";
import path from "path";

const DEVDECK_TOKEN = process.env.DEVDECK_TOKEN ?? "e2e-test-token";
const E2E_PROJECTS_DIR =
  process.env.DEVDECK_PROJECTS_DIR ??
  path.join(process.cwd(), ".harness", "run", "playwright-fixtures", "projects");
const E2E_DATA_DIR =
  process.env.DEVDECK_DATA_DIR ??
  path.join(process.cwd(), ".harness", "run", "playwright-fixtures", ".devdeck-data");
const E2E_ARTIFACT_DIR =
  process.env.DEVDECK_E2E_ARTIFACT_DIR ??
  path.join(process.cwd(), ".harness", "run", `playwright-artifacts-${process.pid}`);
const E2E_WEB_HOST = process.env.DEVDECK_E2E_WEB_HOST ?? "127.0.0.1";
const E2E_TERMINAL_HOST = process.env.DEVDECK_E2E_TERMINAL_HOST ?? "127.0.0.1";
const E2E_WEB_PORT = Number(process.env.DEVDECK_E2E_WEB_PORT ?? 42000);
const E2E_TERMINAL_PORT = Number(process.env.DEVDECK_E2E_TERMINAL_PORT ?? 43000);
const webServerEnv = {
  DEVDECK_TOKEN,
  DEVDECK_PROJECTS_DIR: E2E_PROJECTS_DIR,
  DEVDECK_DATA_DIR: E2E_DATA_DIR,
  DEVDECK_HOST: E2E_WEB_HOST,
  PORT: String(E2E_WEB_PORT),
  TERMINAL_HOST: E2E_TERMINAL_HOST,
  TERMINAL_PORT: String(E2E_TERMINAL_PORT),
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 0,
  use: {
    headless: true,
    baseURL: `http://${E2E_WEB_HOST}:${E2E_WEB_PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  outputDir: path.join(E2E_ARTIFACT_DIR, "artifacts"),
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(E2E_ARTIFACT_DIR, "playwright-results.json") }],
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run terminal",
      port: E2E_TERMINAL_PORT,
      reuseExistingServer: false,
      timeout: 10000,
      env: webServerEnv,
    },
    {
      command: `npx next dev --turbopack --hostname ${E2E_WEB_HOST} --port ${E2E_WEB_PORT}`,
      port: E2E_WEB_PORT,
      reuseExistingServer: false,
      timeout: 30000,
      env: webServerEnv,
    },
  ],
});
