import { test, expect } from "@playwright/test";
import { ensureProject, openAuthed, writeFixtureFile } from "./helpers";

const PROJECT_SLUG = "lazy-large";
const ROOT_RENDER_THRESHOLD_MS = 5000;

async function ensureFixtureProject() {
  await ensureProject(PROJECT_SLUG, {
    description: "Deterministic Playwright fixture for lazy file-tree loading",
  });
  await writeFixtureFile(PROJECT_SLUG, "src/index.ts", "export const fixture = true;\n");

  await writeFixtureFile(PROJECT_SLUG, ".git/HEAD", "ref: refs/heads/main\n");
  await writeFixtureFile(PROJECT_SLUG, ".git/objects/pack/deep-object", "deep git object\n");
  await writeFixtureFile(
    PROJECT_SLUG,
    "node_modules/fixture-dependency/nested/index.js",
    "module.exports = true;\n",
  );
  await writeFixtureFile(PROJECT_SLUG, ".next/cache/webpack/bundle.js", "cached();\n");
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

  await openAuthed(page, "/project/" + PROJECT_SLUG);
  const rootResponse = await rootResponsePromise;
  const rootRequestedAt = Date.now();
  const rootNodes = (await rootResponse.json()) as Array<{
    name: string;
    hasChildren?: boolean;
    childrenLoaded?: boolean;
    children?: unknown[];
  }>;

  expect(rootNodes.map((node) => node.name)).toEqual(
    expect.arrayContaining([".next", "node_modules", "package.json", "src"]),
  );
  expect(rootNodes.map((node) => node.name)).not.toContain(".git");
  expect(JSON.stringify(rootNodes)).not.toContain("fixture-dependency");
  expect(JSON.stringify(rootNodes)).not.toContain("deep-object");

  for (const directoryName of [".next", "node_modules"]) {
    const node = rootNodes.find((entry) => entry.name === directoryName);
    expect(node).toMatchObject({ hasChildren: true, childrenLoaded: false });
    expect(node?.children).toBeUndefined();
  }

  await expect(page.getByRole("button", { name: ".git", exact: true })).toHaveCount(0);
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
