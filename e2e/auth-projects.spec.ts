import { test, expect } from "@playwright/test";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR, TOKEN, ensureProject, openAuthed } from "./helpers";

const AUTO_PROJECT = "registry-auto";
const MANUAL_PROJECT = "registry-manual";

async function ensureManualProjectDir() {
  const manualRoot = path.join(DATA_DIR, "manual-projects", MANUAL_PROJECT);
  await fs.mkdir(manualRoot, { recursive: true });
  await fs.writeFile(path.join(manualRoot, "package.json"), '{"name":"registry-manual"}\n');
  return manualRoot;
}

test.beforeAll(async () => {
  await ensureProject(AUTO_PROJECT, {
    description: "Project registry auto-discovery fixture",
  });
});

test("valid token redirects away from query string and stores auth cookie", async ({ page }) => {
  await page.goto(`/?token=${TOKEN}`);
  await expect(page).toHaveURL((url) => url.pathname === "/" && !url.search.includes("token="));
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === "devdeck_token")).toBe(true);
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
});

test("missing or invalid token is denied without exposing the token", async ({ page }) => {
  await page.context().clearCookies();
  const missing = await page.goto("/");
  expect(missing?.status()).toBe(401);
  await expect(page.getByText("Access Denied")).toBeVisible();

  const invalid = await page.goto("/?token=invalid-browser-e2e-token");
  expect(invalid?.status()).toBe(401);
  await expect(page.getByText("Access Denied")).toBeVisible();
  await expect(page.getByText("invalid-browser-e2e-token")).toHaveCount(0);
});

test("project list supports empty, add, duplicate validation, edit, open, and remove", async ({
  page,
}) => {
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.fallback();
  });
  await openAuthed(page);
  await expect(page.getByText("No projects found")).toBeVisible();
  await page.unroute("**/api/projects");

  const manualRoot = await ensureManualProjectDir();
  await page.getByTestId("add-project-button").click();
  await page.getByLabel("Path").fill(manualRoot);
  await page.getByLabel("Name").fill("Registry Manual Project");
  await page.getByLabel("Description").fill("Added from Playwright");
  await page.getByRole("button", { name: "Add Project", exact: true }).click();
  await expect(page.getByRole("button", { name: /Registry Manual Project/ })).toBeVisible();

  await page.getByTestId("add-project-button").click();
  await page.getByLabel("Path").fill(manualRoot);
  await page.getByRole("button", { name: "Add Project", exact: true }).click();
  await expect(page.getByText(/already exists/i)).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByTestId("add-project-button").click();
  await page.getByLabel("Path").fill(path.join(DATA_DIR, "missing-project"));
  await page.getByRole("button", { name: "Add Project", exact: true }).click();
  await expect(page.getByText(/does not exist|Failed to add project/i)).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  const manualCard = page.getByRole("button", { name: /Registry Manual Project/ });
  await manualCard.getByTestId("card-menu-button").click();
  await page.getByTestId("edit-button").click();
  await page.getByLabel("Name").fill("Registry Manual Updated");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("button", { name: /Registry Manual Updated/ })).toBeVisible();

  await page.getByRole("button", { name: /Registry Manual Updated/ }).click();
  await expect(page).toHaveURL(new RegExp(`/project/${MANUAL_PROJECT}`));
  await page.goto(`/?token=${TOKEN}`);

  const updatedCard = page.getByRole("button", { name: /Registry Manual Updated/ });
  await updatedCard.getByTestId("card-menu-button").click();
  await page.getByTestId("remove-button").click();
  await expect(page.getByRole("dialog", { name: "Remove Project" })).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: /Registry Manual Updated/ })).toHaveCount(0);
});
