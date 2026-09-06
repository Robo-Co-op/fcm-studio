import { test, expect } from "@playwright/test";

test("local work stays available while cloud configuration is absent", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page
    .getByRole("button", { name: "Cloud workspace", exact: true })
    .click();
  await expect(
    page.getByText("Cloud setup needed", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to local workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A thriving community cooperative" }),
  ).toBeVisible();
});
