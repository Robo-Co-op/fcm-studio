import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
});

test("a relationship can be switched to 'decreases' and keeps its strength (issue #21)", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add factor", exact: true }).click();
  await page
    .getByRole("textbox", { name: "New factor name" })
    .fill("Communication");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add factor", exact: true })
    .click();
  const cell = page.getByRole("textbox", {
    name: "Communication → Community trust",
    exact: true,
  });
  await cell.fill("0.7");
  await cell.press("Enter");

  const weightInput = page.getByRole("spinbutton", {
    name: "Relationship weight",
  });
  const direction = page.getByRole("group", {
    name: "Relationship direction",
  });
  await expect(weightInput).toHaveValue("0.7");
  await expect(
    direction.getByRole("button", { name: /Increases/ }),
  ).toHaveAttribute("aria-pressed", "true");

  const negativeEdges = page
    .locator(".react-flow__edge")
    .filter({ hasText: "−0.7" });
  const before = await negativeEdges.count();
  await direction.getByRole("button", { name: /Decreases/ }).click();
  await expect(weightInput).toHaveValue("-0.7");
  await expect(
    page.getByText(
      "More Communication leads to less Community trust (negative, −0.7).",
    ),
  ).toBeVisible();
  await expect(negativeEdges).toHaveCount(before + 1);

  await page
    .getByLabel("Relationship strength")
    .getByRole("button", { name: "0.3", exact: true })
    .click();
  await expect(weightInput).toHaveValue("-0.3");
});
