import { expect, test } from "@playwright/test";

const PROJECT_NAME = "E2E demo project";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Continue with Google (demo)" })
    .click();
});

test("creates a project, opens the editor, and lists it first (issue #13)", async ({
  page,
}) => {
  await page.getByLabel("Project name").fill(PROJECT_NAME);
  await page.getByLabel("Research agenda").fill("How do factors interact?");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: PROJECT_NAME }),
  ).toBeVisible();
  const back = page.getByRole("button", { name: "Back to projects" });
  await expect(back).toBeVisible();
  await back.click();

  const items = page.locator("ul.cloud-projects > li");
  await expect(items).toHaveCount(4);
  await expect(items.first().locator("strong")).toHaveText(PROJECT_NAME);
  await expect(items.first()).toContainText("0 factors");
});

test("Create project is disabled while the name is only whitespace", async ({
  page,
}) => {
  const create = page.getByRole("button", { name: "Create project" });
  await expect(create).toBeDisabled();
  await page.getByLabel("Project name").fill("   ");
  await expect(create).toBeDisabled();
  await page.getByLabel("Project name").fill("x");
  await expect(create).toBeEnabled();
});
