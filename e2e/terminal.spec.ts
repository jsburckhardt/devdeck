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

async function expectTerminalLine(page: Page, expectedLine: string) {
  await expect
    .poll(
      async () =>
        page
          .locator('[data-testid="terminal-container"] .xterm-rows > div')
          .evaluateAll((rows) => rows.map((row) => row.textContent?.trim() ?? "")),
      { timeout: 5000 },
    )
    .toContain(expectedLine);
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
  await expectTerminalLine(page, "hello-devdeck");
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

test("mobile keyboard helper sends an arrow key without disconnecting", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstProjectTerminal(page);

  const marker = "M68";
  const rawModeProbe =
    'node -e "console.log(\\\"RDY\\\");process.stdin.setRawMode(true);process.stdin.resume();let b=[];process.stdin.on(\\"data\\",d=>{b.push(...d);if(b.length>=3){console.log(b[0]===27&&b[1]===91&&b[2]===65?\\"M68\\":\\"BAD\\");process.exit(0)}})"';
  const terminalContainer = page.locator("[data-testid=terminal-container]");
  await terminalContainer.click();
  await page.keyboard.type(rawModeProbe);
  await page.keyboard.press("Enter");
  await expectTerminalLine(page, "RDY");

  await page.getByRole("button", { name: "Terminal keyboard helper" }).click();
  await expect(page.getByRole("toolbar", { name: "Terminal keyboard helper keys" })).toBeVisible();

  await page.getByRole("button", { name: "Up" }).click();
  await expectTerminalLine(page, marker);

  await expect(page.locator("[data-testid=terminal-panel]").getByText("Connected")).toBeVisible();
});

test("rejects access without token", async ({ page }) => {
  // Clear cookies to ensure no existing auth
  await page.context().clearCookies();

  // Visit without token — should get 401 Access Denied
  const response = await page.goto("/");
  expect(response?.status()).toBe(401);
  await expect(page.locator("text=Access Denied")).toBeVisible({ timeout: 5000 });
});
