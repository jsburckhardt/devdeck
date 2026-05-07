import { defineConfig } from "@playwright/test";

const DEVDECK_TOKEN = process.env.DEVDECK_TOKEN ?? "e2e-test-token";

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
      env: { DEVDECK_TOKEN },
    },
    {
      command: "npm run dev",
      port: 8070,
      reuseExistingServer: true,
      timeout: 30000,
      env: { DEVDECK_TOKEN },
    },
  ],
});
