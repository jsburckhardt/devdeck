import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 0,
  use: {
    headless: true,
    baseURL: "http://localhost:8001",
  },
  webServer: [
    {
      command: "npm run terminal",
      port: 3100,
      reuseExistingServer: true,
      timeout: 10000,
    },
    {
      command: "npm run dev",
      port: 8001,
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
});
