import { test, expect, type Page } from "@playwright/test";
import fs from "fs/promises";
import { ensureProject, openAuthed, projectRoot, writeFixtureFile } from "./helpers";

const PROJECT_SLUG = "layout-target";
const fixtureRoot = projectRoot(PROJECT_SLUG);

async function ensureFixtureProject() {
  await ensureProject(PROJECT_SLUG, {
    description: "Deterministic Playwright fixture for workspace layout geometry",
  });
  await writeFixtureFile(PROJECT_SLUG, "src/index.ts", "export const layoutTarget = true;\n");
}

async function openLayoutTarget(page: Page) {
  await openAuthed(page, `/project/${PROJECT_SLUG}`);
  await page.waitForSelector('[data-testid="terminal-panel"]', { timeout: 15000 });
  await expect(page.locator('[data-testid="terminal-panel"]').getByText("Connected")).toBeVisible({
    timeout: 15000,
  });
}

async function togglePanel(page: Page, label: "Explorer" | "File Preview") {
  await page.getByRole("button", { name: `Hide ${label}` }).click();
}

async function expectProjectShellFitsViewport(page: Page) {
  const geometry = await page.evaluate(() => {
    const toggle = document.querySelector(
      'button[aria-label="Collapse sidebar"], button[aria-label="Expand sidebar"]',
    );
    const workspace = document.querySelector("[data-panel-group], [data-group]");

    if (!(toggle instanceof HTMLElement)) {
      throw new Error("Sidebar collapse toggle not found");
    }

    if (!(workspace instanceof HTMLElement)) {
      throw new Error("Workspace panel group not found");
    }

    const toggleBox = toggle.getBoundingClientRect();
    const workspaceBox = workspace.getBoundingClientRect();
    const html = document.documentElement;
    const body = document.body;

    return {
      innerHeight: window.innerHeight,
      htmlOverflow: html.scrollHeight - html.clientHeight,
      bodyOverflow: body.scrollHeight - body.clientHeight,
      toggleTop: toggleBox.top,
      toggleBottom: toggleBox.bottom,
      workspaceTop: workspaceBox.top,
      workspaceBottom: workspaceBox.bottom,
    };
  });
  const tolerance = 1;

  expect(geometry.htmlOverflow).toBeLessThanOrEqual(tolerance);
  expect(geometry.bodyOverflow).toBeLessThanOrEqual(tolerance);
  expect(geometry.toggleTop).toBeGreaterThanOrEqual(-tolerance);
  expect(geometry.toggleBottom).toBeLessThanOrEqual(geometry.innerHeight + tolerance);
  expect(geometry.workspaceTop).toBeGreaterThanOrEqual(-tolerance);
  expect(geometry.workspaceBottom).toBeLessThanOrEqual(geometry.innerHeight + tolerance);
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

test("Issue #70: project viewport does not clip sidebar footer controls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openLayoutTarget(page);

  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  await expectProjectShellFitsViewport(page);
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
