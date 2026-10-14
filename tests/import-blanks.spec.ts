import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";

test("blank consent is explicit, reversible, and resets for the next workbook", async ({
  page,
}) => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("FCMValues").addRows([
    ["Synthetic blank consent", "Source", "Target"],
    ["Source", 0, 0.7],
    ["Target", null, 0],
  ]);
  const file = {
    name: "synthetic.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
  };
  await page.goto("/");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(file);
  const accept = page.getByRole("button", { name: "Import as a new baseline" });
  const consent = page.getByRole("checkbox", {
    name: "Interpret blank weights as zero",
  });
  await expect(page.getByRole("dialog")).toContainText("B3");
  await expect(accept).toBeDisabled();
  await consent.check();
  await expect(accept).toBeEnabled();
  await consent.uncheck();
  await expect(accept).toBeDisabled();
  await consent.check();
  await page.locator("input[type=file]").setInputFiles(file);
  await expect(consent).not.toBeChecked();
  await expect(accept).toBeDisabled();
  await consent.check();
  await accept.click();
  await expect(
    page.getByRole("textbox", { name: "Source → Target", exact: true }),
  ).toHaveValue("0.7");
  await expect(
    page.getByRole("textbox", { name: "Target → Source", exact: true }),
  ).toHaveValue("0");
});

test("a stale workbook cannot inherit a newer workbook's consent", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === "slow.xlsx")
        await new Promise((resolve) => setTimeout(resolve, 2500));
      return original.call(this);
    };
  });
  const book = new ExcelJS.Workbook();
  book.addWorksheet("FCMValues").addRows([
    ["Slow workbook", "A", "B"],
    ["A", 0, 0.7],
    ["B", null, 0],
  ]);
  const slow = Buffer.from(await book.xlsx.writeBuffer());
  book.worksheets[0].getCell("A1").value = "Latest workbook";
  const fast = Buffer.from(await book.xlsx.writeBuffer());
  await page.goto("/");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const input = page.locator("input[type=file]");
  const mimeType =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  await input.setInputFiles({ name: "slow.xlsx", mimeType, buffer: slow });
  await input.setInputFiles({ name: "fast.xlsx", mimeType, buffer: fast });
  await expect(page.getByRole("dialog")).toContainText("Latest workbook");
  await page
    .getByRole("checkbox", { name: "Interpret blank weights as zero" })
    .check();
  // Let the deliberately delayed older read complete before asserting ownership.
  await page.waitForTimeout(3000);
  await expect(page.getByRole("dialog")).toContainText("Latest workbook");
  await expect(page.getByRole("dialog")).not.toContainText("Slow workbook");
  await page.getByRole("button", { name: "Import as a new baseline" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Latest workbook" }),
  ).toBeVisible();
});
