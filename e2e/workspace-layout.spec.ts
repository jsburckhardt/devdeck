import { test, expect, type Page } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

const TOKEN = process.env.DEVDECK_TOKEN ?? "e2e-test-token";
const PROJECT_SLUG = "layout-target";
const fixtureRoot = path.join(process.cwd(), "e2e", "fixtures", "projects", PROJECT_SLUG);

async function writeFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

async function ensureFixtureProject() {
  const packageJson = JSON.stringify(
    {
      name: PROJECT_SLUG,
      description: "Deterministic Playwright fixture for workspace layout geometry",
      version: "1.0.0",
      private: true,
    },
    null,
    2,
  );

  await writeFile(path.join(fixtureRoot, "package.json"), packageJson + "\n");
  await writeFile(path.join(fixtureRoot, "README.md"), "# Layout Target\n");
  await writeFile(path.join(fixtureRoot, "src", "index.ts"), "export const layoutTarget = true;\n");
}

async function openLayoutTarget(page: Page) {
  await page.goto(`/project/${PROJECT_SLUG}?token=${TOKEN}`);
  await page.waitForSelector('[data-testid="terminal-panel"]', { timeout: 15000 });
  await expect(page.locator('[data-testid="terminal-panel"]').getByText("Connected")).toBeVisible({
    timeout: 15000,
  });
}

async function togglePanel(page: Page, label: "Explorer" | "File Preview") {
  await page.getByRole("button", { name: `Hide ${label}` }).click();
}

async function expectTerminalFillsWorkspace(page: Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const terminal = document.querySelector('[data-testid="terminal-panel"]');
          if (!terminal) return 0;

          let workspace: Element | null = terminal.parentElement;
          while (workspace) {
            if (workspace.hasAttribute("data-group") || workspace.hasAttribute("data-panel-group"))
              break;
            workspace = workspace.parentElement;
          }

          const terminalBox = terminal.getBoundingClientRect();
          const workspaceBox = workspace?.getBoundingClientRect();
          if (!workspaceBox || workspaceBox.width === 0) return 0;

          const widthDelta = Math.abs(workspaceBox.width - terminalBox.width);
          return widthDelta <= 2 ? 1 : terminalBox.width / workspaceBox.width;
        }),
      { timeout: 5000 },
    )
    .toBeGreaterThan(0.98);
}

test.beforeAll(async () => {
  await ensureFixtureProject();
});

test.afterAll(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true });
});

test("Issue #69: File Preview then Explorer leaves Terminal filling workspace", async ({
  page,
}) => {
  await openLayoutTarget(page);

  await togglePanel(page, "File Preview");
  await togglePanel(page, "Explorer");

  await expectTerminalFillsWorkspace(page);
  await expect(page.locator('[data-testid="terminal-panel"]').getByText("Connected")).toBeVisible();
});

test("Issue #69: Explorer then File Preview leaves Terminal filling workspace", async ({
  page,
}) => {
  await openLayoutTarget(page);

  await togglePanel(page, "Explorer");
  await togglePanel(page, "File Preview");

  await expectTerminalFillsWorkspace(page);
  await expect(page.locator('[data-testid="terminal-panel"]').getByText("Connected")).toBeVisible();
});
