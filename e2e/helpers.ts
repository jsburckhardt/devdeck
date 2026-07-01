import { expect, type Page } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

export const TOKEN = process.env.DEVDECK_TOKEN ?? "e2e-test-token";
export const PROJECTS_DIR =
  process.env.DEVDECK_PROJECTS_DIR ??
  path.join(process.cwd(), ".harness", "run", "playwright-fixtures", "projects");
export const DATA_DIR =
  process.env.DEVDECK_DATA_DIR ??
  path.join(process.cwd(), ".harness", "run", "playwright-fixtures", ".devdeck-data");

export function projectRoot(slug: string) {
  return path.join(PROJECTS_DIR, slug);
}

export async function writeFixtureFile(
  slug: string,
  relativePath: string,
  content: string | Buffer,
) {
  const filePath = path.join(projectRoot(slug), relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

export async function ensureProject(
  slug: string,
  options: { name?: string; description?: string } = {},
) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await writeFixtureFile(
    slug,
    "package.json",
    `${JSON.stringify(
      {
        name: options.name ?? slug,
        description: options.description ?? `Playwright fixture for ${slug}`,
        version: "1.0.0",
        private: true,
      },
      null,
      2,
    )}\n`,
  );
  await writeFixtureFile(slug, "README.md", `# ${options.name ?? slug}\n`);
}

export async function openAuthed(page: Page, target = "/") {
  await page.goto(`${target}${target.includes("?") ? "&" : "?"}token=${TOKEN}`);
  await page.waitForLoadState("domcontentloaded");
}

export async function openProject(page: Page, slug: string) {
  await openAuthed(page, `/project/${slug}`);
  await page.waitForSelector('[data-testid="terminal-panel"]', { timeout: 15000 });
}

export async function expectTerminalConnected(page: Page) {
  await expect(page.locator('[data-testid="terminal-panel"]').getByText("Connected")).toBeVisible({
    timeout: 15000,
  });
}
