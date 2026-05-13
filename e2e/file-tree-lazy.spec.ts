import { test, expect } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

const TOKEN = process.env.DEVDECK_TOKEN ?? "e2e-test-token";
const PROJECT_SLUG = "lazy-large";
const ROOT_RENDER_THRESHOLD_MS = 5000;
const fixtureRoot = path.join(process.cwd(), "e2e", "fixtures", "projects", PROJECT_SLUG);

async function writeFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

async function ensureFixtureProject() {
  const packageJson = JSON.stringify(
    {
      name: PROJECT_SLUG,
      description: "Deterministic Playwright fixture for lazy file-tree loading",
      version: "1.0.0",
      private: true,
    },
    null,
    2,
  );
  await writeFile(path.join(fixtureRoot, "package.json"), packageJson + "\n");
  await writeFile(path.join(fixtureRoot, "src", "index.ts"), "export const fixture = true;\n");

  await writeFile(path.join(fixtureRoot, ".git", "HEAD"), "ref: refs/heads/main\n");
  await writeFile(
    path.join(fixtureRoot, ".git", "objects", "pack", "deep-object"),
    "deep git object\n",
  );
  await writeFile(
    path.join(fixtureRoot, "node_modules", "fixture-dependency", "nested", "index.js"),
    "module.exports = true;\n",
  );
  await writeFile(path.join(fixtureRoot, ".next", "cache", "webpack", "bundle.js"), "cached();\n");
}

test.beforeAll(async () => {
  await ensureFixtureProject();
});

test("file explorer renders large root entries before lazy child traversal", async ({ page }) => {
  const pathScopedRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname !== "/api/files" || url.searchParams.get("slug") !== PROJECT_SLUG) return;
    const requestedPath = url.searchParams.get("path");
    if (requestedPath !== null) pathScopedRequests.push(requestedPath);
  });

  const rootResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/files" &&
      url.searchParams.get("slug") === PROJECT_SLUG &&
      !url.searchParams.has("path") &&
      response.status() === 200
    );
  });

  await page.goto("/project/" + PROJECT_SLUG + "?token=" + TOKEN);
  const rootResponse = await rootResponsePromise;
  const rootRequestedAt = Date.now();
  const rootNodes = (await rootResponse.json()) as Array<{
    name: string;
    hasChildren?: boolean;
    childrenLoaded?: boolean;
    children?: unknown[];
  }>;

  expect(rootNodes.map((node) => node.name)).toEqual(
    expect.arrayContaining([".git", ".next", "node_modules", "package.json", "src"]),
  );
  expect(JSON.stringify(rootNodes)).not.toContain("fixture-dependency");
  expect(JSON.stringify(rootNodes)).not.toContain("deep-object");

  for (const directoryName of [".git", ".next", "node_modules"]) {
    const node = rootNodes.find((entry) => entry.name === directoryName);
    expect(node).toMatchObject({ hasChildren: true, childrenLoaded: false });
    expect(node?.children).toBeUndefined();
  }

  await expect(page.getByRole("button", { name: ".git", exact: true })).toBeVisible({
    timeout: ROOT_RENDER_THRESHOLD_MS,
  });
  await expect(page.getByRole("button", { name: "node_modules", exact: true })).toBeVisible({
    timeout: ROOT_RENDER_THRESHOLD_MS,
  });
  await expect(page.getByRole("button", { name: ".next", exact: true })).toBeVisible({
    timeout: ROOT_RENDER_THRESHOLD_MS,
  });
  expect(Date.now() - rootRequestedAt).toBeLessThan(ROOT_RENDER_THRESHOLD_MS);
  expect(pathScopedRequests).toEqual([]);

  const childResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/files" &&
      url.searchParams.get("slug") === PROJECT_SLUG &&
      url.searchParams.get("path") === "node_modules" &&
      response.status() === 200
    );
  });

  await page.getByRole("button", { name: "node_modules", exact: true }).click();
  const childResponse = await childResponsePromise;
  const childNodes = (await childResponse.json()) as Array<{ name: string }>;

  expect(pathScopedRequests).toContain("node_modules");
  expect(childNodes.map((node) => node.name)).toContain("fixture-dependency");
  await expect(page.getByRole("button", { name: "fixture-dependency", exact: true })).toBeVisible();
});
