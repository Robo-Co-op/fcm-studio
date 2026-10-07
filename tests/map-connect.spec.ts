import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
});

test("connecting two cards on the map and choosing 'decreases' makes a negative relationship (issue #22)", async ({
  page,
}) => {
  await expect(page.getByText(/Drag from a card’s right dot/)).toBeVisible();

  for (const name of ["Communication", "Conflict"]) {
    await page.getByRole("button", { name: "Add factor", exact: true }).click();
    await page.getByRole("textbox", { name: "New factor name" }).fill(name);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Add factor", exact: true })
      .click();
  }
  const card = (name: string) =>
    page.locator(".react-flow__node").filter({ hasText: name });
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.locator(".react-flow__controls-fitview").click();

  await card("Communication")
    .locator(".react-flow__handle.source")
    .dragTo(card("Conflict").locator(".react-flow__handle.target"));

  await expect(
    page.getByText("More Communication leads to more Conflict", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Relationship direction" })
    .getByRole("button", { name: /Decreases/ })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "Relationship weight" }),
  ).toHaveValue("-0.3");
  await expect(
    page.getByText(
      "More Communication leads to less Conflict (negative, −0.3).",
    ),
  ).toBeVisible();
});
