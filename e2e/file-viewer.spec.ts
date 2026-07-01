import { test, expect } from "@playwright/test";
import fs from "fs/promises";
import path from "path";
import { ensureProject, openProject, projectRoot, writeFixtureFile } from "./helpers";

const PROJECT_SLUG = "viewer-target";

async function ensureViewerFixture() {
  await ensureProject(PROJECT_SLUG, {
    description: "File viewer and editor fixture",
  });
  await writeFixtureFile(PROJECT_SLUG, "src/example.ts", "export const viewerValue = 1;\n");
  await writeFixtureFile(PROJECT_SLUG, "docs/guide.md", "# Viewer Guide\n\nHello **Markdown**.\n");
  await writeFixtureFile(PROJECT_SLUG, "assets/archive.pdf", Buffer.from([0x25, 0x50, 0x44, 0x46]));
  await writeFixtureFile(PROJECT_SLUG, "large.txt", `${"large\n".repeat(180_000)}`);
}

test.beforeAll(async () => {
  await ensureViewerFixture();
});

test("file viewer covers text, Markdown, binary, large, save success, and conflict failure", async ({
  page,
}) => {
  await openProject(page, PROJECT_SLUG);

  await page.getByRole("button", { name: "src", exact: true }).click();
  await page.getByRole("button", { name: "example.ts", exact: true }).click();
  await expect(page.getByText("viewerValue")).toBeVisible();

  await page.getByRole("button", { name: "docs", exact: true }).click();
  await page.getByRole("button", { name: "guide.md", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Viewer Guide" })).toBeVisible();

  await page.getByRole("button", { name: "Show raw source" }).click();
  await page.getByRole("button", { name: "Edit file" }).click();
  await page.getByLabel("File editor").fill("# Viewer Guide\n\nSaved from Playwright.\n");
  await page.getByRole("button", { name: "Save file" }).click();
  await expect(page.getByText("File saved")).toBeVisible();
  await expect
    .poll(async () => fs.readFile(path.join(projectRoot(PROJECT_SLUG), "docs", "guide.md"), "utf8"))
    .toContain("Saved from Playwright");

  await page.getByRole("button", { name: "assets", exact: true }).click();
  await page.getByRole("button", { name: "archive.pdf", exact: true }).click();
  await expect(page.getByText("Binary file", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "large.txt", exact: true }).click();
  await expect(page.getByText(/File is too large to display/)).toBeVisible();

  await page.getByRole("button", { name: "README.md", exact: true }).click();
  await page.getByRole("button", { name: "Show raw source" }).click();
  await page.getByRole("button", { name: "Edit file" }).click();
  await page.getByLabel("File editor").fill("# Conflict Attempt\n");
  const readmePath = path.join(projectRoot(PROJECT_SLUG), "README.md");
  await fs.writeFile(readmePath, "# External update\n");
  const future = new Date(Date.now() + 5000);
  await fs.utimes(readmePath, future, future);
  await page.getByRole("button", { name: "Save file" }).click();
  await expect(page.getByText(/modified externally/i)).toBeVisible();
});
