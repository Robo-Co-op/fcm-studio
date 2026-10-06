import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function workbook(): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("FCM Values");
  sheet.getCell("B2").value = "Imported agenda";
  const labels = ["Trust", "Participation", "Funding"];
  const weights = [
    [0, 0.7, 0],
    [0.3, 0, -0.5],
    [0, 0, 0],
  ];
  labels.forEach((label, i) => {
    sheet.getCell(2, i + 3).value = label;
    sheet.getCell(i + 3, 2).value = label;
    weights[i].forEach((w, j) => (sheet.getCell(i + 3, j + 3).value = w));
  });
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function openProject(page: Page, name: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Continue with Google (demo)" })
    .click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

const listedCount = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "Back to projects" }).first().click();
  return page.getByRole("listitem").filter({ hasText: name });
};

test("owner replaces the shared model from a workbook and can undo it (issue #15)", async ({
  page,
}) => {
  await openProject(page, "Neighborhood resilience map");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "survey.xlsx",
    mimeType: XLSX,
    buffer: await workbook(),
  });
  await page.getByRole("button", { name: "Replace model" }).click();
  await expect(page.getByText("Participation").first()).toBeVisible();

  let item = await listedCount(page, "Neighborhood resilience map");
  await expect(item).toContainText("3 factors · 3 connections");

  await page
    .getByRole("button", { name: /Neighborhood resilience map/ })
    .click();
  await page.getByTitle("Undo").click();
  item = await listedCount(page, "Neighborhood resilience map");
  await expect(item).toContainText("2 factors · 1 connections");
});

test("owner drafts and accepts an AI proposal in a shared project", async ({
  page,
}) => {
  await openProject(page, "Neighborhood resilience map");
  await page.getByRole("button", { name: "Explore with AI" }).click();
  await expect(
    page.getByText("Optional AI service is not configured"),
  ).toHaveCount(0);
  await page.getByLabel("AI instruction").fill("Local leadership");
  await page.getByRole("button", { name: "Generate proposal" }).click();
  await expect(
    page.getByRole("heading", { name: "Review proposal" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept proposal" }).click();

  const item = await listedCount(page, "Neighborhood resilience map");
  await expect(item).toContainText("3 factors");
});

test("viewer cannot import or ask AI", async ({ page }) => {
  await openProject(page, "Shared baseline review");
  await expect(
    page.getByRole("button", { name: "Import", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Explore with AI" }),
  ).toBeDisabled();
});

test("editor imports a JSON backup into the shared project and the second editor sees it", async ({
  page,
}) => {
  await openProject(page, "Workshop follow-up model");
  await page
    .getByRole("button", { name: "Demo: show two editors side by side" })
    .click();
  const [left, right] = [
    page.locator(".demo-editor-column").first(),
    page.locator(".demo-editor-column").nth(1),
  ];
  const factor = (id: string, label: string) => ({
    id,
    label,
    color: "#dbe7f4",
    x: 0,
    y: 0,
    provenance: "human",
  });
  const backup = {
    version: 1,
    id: "elsewhere",
    name: "Another project",
    agenda: "",
    revision: 0,
    model: {
      factors: [
        factor("a", "Cooperative education"),
        factor("b", "Member ownership"),
        factor("c", "Local employment"),
      ],
      relationships: [
        { source: "a", target: "b", weight: 0.6, provenance: "human" },
      ],
    },
    baseline: { factors: [], relationships: [] },
    scenarios: [],
    runs: [],
  };
  await left.getByRole("button", { name: "Import", exact: true }).click();
  await left.locator('input[type="file"]').setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(right.getByText("Member ownership").first()).toBeVisible();
  await expect(
    right.getByRole("heading", { level: 1, name: "Workshop follow-up model" }),
  ).toBeVisible();

  const item = await listedCount(page, "Workshop follow-up model");
  await expect(item).toContainText("3 factors · 1 connections");
});
