import { test, expect, type Page } from "@playwright/test";

const TOKEN = process.env.DEVDECK_TOKEN ?? "e2e-test-token";

async function openFirstProjectTerminal(page: Page) {
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
  await expect(page.locator('[data-testid="terminal-panel"]').getByText("Connected")).toBeVisible({
    timeout: 15000,
  });
}

async function expectNoTerminalHorizontalOverflow(page: Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const tolerance = 1;
          const host = document.querySelector('[data-testid="terminal-container"]');
          const measurements = [
            ["terminal-container", host],
            ["xterm", host?.querySelector(".xterm") ?? null],
            ["xterm-viewport", host?.querySelector(".xterm-viewport") ?? null],
            ["xterm-screen", host?.querySelector(".xterm-screen") ?? null],
          ] as const;

          return measurements.flatMap(([name, element]) => {
            if (!(element instanceof HTMLElement)) {
              return [`${name}:missing`];
            }

            const overflow = element.scrollWidth - element.clientWidth;
            return overflow > tolerance
              ? [`${name}:${element.scrollWidth}>${element.clientWidth}`]
              : [];
          });
        }),
      { timeout: 5000 },
    )
    .toEqual([]);
}

test("terminal connects, fits without horizontal overflow, and executes commands", async ({
  page,
}) => {
  await openFirstProjectTerminal(page);
  await expectNoTerminalHorizontalOverflow(page);

  // Type a command in the terminal
  const terminalContainer = page.locator('[data-testid="terminal-container"]');
  await terminalContainer.click();
  await page.keyboard.type("echo hello-devdeck\n");

  // Wait for output
  await expect(page.locator("text=hello-devdeck")).toBeVisible({ timeout: 5000 });
  await expectNoTerminalHorizontalOverflow(page);
});

test("terminal keeps fitting without horizontal overflow after layout changes", async ({
  page,
}) => {
  await openFirstProjectTerminal(page);
  await expectNoTerminalHorizontalOverflow(page);

  await page.getByRole("button", { name: "Hide File Preview" }).click();
  await expectNoTerminalHorizontalOverflow(page);

  await page.getByRole("button", { name: "Hide Explorer" }).click();
  await expectNoTerminalHorizontalOverflow(page);

  await expect(page.locator('[data-testid="terminal-panel"]').getByText("Connected")).toBeVisible();
});

test("rejects access without token", async ({ page }) => {
  // Clear cookies to ensure no existing auth
  await page.context().clearCookies();

  // Visit without token — should get 401 Access Denied
  const response = await page.goto("/");
  expect(response?.status()).toBe(401);
  await expect(page.locator("text=Access Denied")).toBeVisible({ timeout: 5000 });
});
