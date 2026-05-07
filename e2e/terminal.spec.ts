import { test, expect } from "@playwright/test";

const TOKEN = process.env.DEVDECK_TOKEN ?? "e2e-test-token";

test("terminal connects and executes commands", async ({ page }) => {
  // Navigate with token to authenticate
  await page.goto(`/?token=${TOKEN}`);

  // Middleware should set cookie and redirect — wait for the final page
  await page.waitForURL("/", { timeout: 10000 });

  // Wait for projects to load and click the first one
  await page.waitForSelector('[data-testid="project-card"]', { timeout: 10000 });
  await page.click('[data-testid="project-card"]:first-child');

  // Wait for workspace to load and terminal panel to appear
  await page.waitForSelector('[data-testid="terminal-panel"]', { timeout: 10000 });

  // Check terminal connected
  await expect(page.locator("text=Connected")).toBeVisible({ timeout: 15000 });

  // Type a command in the terminal
  const terminalContainer = page.locator('[data-testid="terminal-container"]');
  await terminalContainer.click();
  await page.keyboard.type("echo hello-devdeck\n");

  // Wait for output
  await expect(page.locator("text=hello-devdeck")).toBeVisible({ timeout: 5000 });
});

test("rejects access without token", async ({ page }) => {
  // Clear cookies to ensure no existing auth
  await page.context().clearCookies();

  // Visit without token — should get 401 Access Denied
  const response = await page.goto("/");
  expect(response?.status()).toBe(401);
  await expect(page.locator("text=Access Denied")).toBeVisible({ timeout: 5000 });
});
