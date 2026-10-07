import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
});

test("negative relationships are dashed and the line thickness survives a reload (issue #20)", async ({
  page,
}) => {
  const edgePaths = page.locator("path.react-flow__edge-path");
  await expect(edgePaths.first()).toBeVisible();
  const styles = await edgePaths.evaluateAll((paths) =>
    paths.map((path) => ({
      dashed: Boolean((path as SVGPathElement).style.strokeDasharray),
      stroke: (path as SVGPathElement).style.stroke,
    })),
  );
  const negative = styles.filter(
    (style) => style.stroke === "rgb(207, 118, 108)",
  );
  const positive = styles.filter(
    (style) => style.stroke === "rgb(76, 146, 124)",
  );
  expect(negative.length).toBeGreaterThan(0);
  expect(negative.every((style) => style.dashed)).toBe(true);
  expect(positive.some((style) => style.dashed)).toBe(false);

  await page.getByLabel("Line thickness").selectOption("thick");
  await page.reload();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await expect(page.getByLabel("Line thickness")).toHaveValue("thick");
});
