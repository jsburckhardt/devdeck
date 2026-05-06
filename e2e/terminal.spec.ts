import { test, expect } from "@playwright/test";

test("terminal connects and executes commands", async ({ page }) => {
  // Navigate to home page
  await page.goto("/");

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
