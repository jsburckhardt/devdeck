import { defineConfig } from "@playwright/test";
import path from "path";

const DEVDECK_TOKEN = process.env.DEVDECK_TOKEN ?? "e2e-test-token";
const E2E_PROJECTS_DIR = path.join(process.cwd(), "e2e", "fixtures", "projects");
const E2E_DATA_DIR = path.join(process.cwd(), "e2e", "fixtures", ".devdeck-data");
const webServerEnv = {
  DEVDECK_TOKEN,
  DEVDECK_PROJECTS_DIR: E2E_PROJECTS_DIR,
  DEVDECK_DATA_DIR: E2E_DATA_DIR,
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 0,
  use: {
    headless: true,
    baseURL: "http://localhost:8070",
  },
  webServer: [
    {
      command: "npm run terminal",
      port: 3100,
      reuseExistingServer: true,
      timeout: 10000,
      env: webServerEnv,
    },
    {
      command: "npm run dev",
      port: 8070,
      reuseExistingServer: true,
      timeout: 30000,
      env: webServerEnv,
    },
  ],
});
