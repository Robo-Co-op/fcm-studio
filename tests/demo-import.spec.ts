import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";

async function workbook(weights: ExcelJS.CellValue[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("FCM Values");
  sheet.getCell("B2").value = "How does trust shape participation?";
  const labels = ["Trust", "Participation", "Funding"];
  labels.forEach((label, i) => {
    sheet.getCell(2, i + 3).value = label;
    sheet.getCell(i + 3, 2).value = label;
    weights[i].forEach((w, j) => (sheet.getCell(i + 3, j + 3).value = w));
  });
  return Buffer.from(await book.xlsx.writeBuffer());
}

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Continue with Google (demo)" })
    .click();
});

test("imports an Excel matrix as a new project (issue #14)", async ({
  page,
}) => {
  const buffer = await workbook([
    [0, 0.7, 0],
    [0.3, 0, -0.5],
    [0, 0, 0],
  ]);
  await page
    .getByLabel("Workbook file")
    .setInputFiles({ name: "Lander survey.xlsx", mimeType: XLSX, buffer });

  const preview = page.getByLabel("Import preview");
  await expect(preview).toContainText("3 factors");
  await expect(preview).toContainText("Participation");
  await page
    .getByRole("button", { name: "Create project from workbook" })
    .click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Lander survey" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to projects" }).click();
  const first = page.locator("ul.cloud-projects > li").first();
  await expect(first).toContainText("Lander survey");
  await expect(first).toContainText("3 factors · 3 connections");
});

test("shows workbook issues and blocks creation", async ({ page }) => {
  const buffer = await workbook([
    [0, "high", 0],
    [0.3, 0, -0.5],
    [0, 0, 0],
  ]);
  await page
    .getByLabel("Workbook file")
    .setInputFiles({ name: "broken.xlsx", mimeType: XLSX, buffer });
  await expect(page.getByLabel("Import preview")).toContainText(
    "Fix these cells",
  );
  await expect(
    page.getByRole("button", { name: "Create project from workbook" }),
  ).toBeDisabled();
});

test("rejects an unsupported file with a readable error", async ({ page }) => {
  await page.getByLabel("Workbook file").setInputFiles({
    name: "matrix.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("a,b\n1,2"),
  });
  await expect(page.getByRole("alert")).toContainText(".xlsx or .json");
});
