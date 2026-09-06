import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  exportWorkbook,
  inspectWorkbook,
  matrixCsv,
  previewToModel,
} from "./excel";

async function fixture(
  labels = ["Alpha", "Beta"],
  weights: unknown[][] = [
    [0, 0.7],
    [-0.3, 0],
  ],
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("FCM Values");
  sheet.getCell("B2").value = "Synthetic research question";
  labels.forEach((label, i) => {
    sheet.getCell(2, i + 3).value = label;
    sheet.getCell(i + 3, 2).value = label;
    weights[i].forEach((weight, j) => {
      sheet.getCell(i + 3, j + 3).value = weight as ExcelJS.CellValue;
    });
  });
  return workbook;
}
async function inspect(workbook: ExcelJS.Workbook) {
  return inspectWorkbook((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
}
describe("Excel matrix adapter", () => {
  it("preserves labels and asymmetric direction through an Excel round trip", async () => {
    const preview = await inspect(await fixture([" Alpha ", "Beta"]));
    expect(preview.issues).toEqual([]);
    expect(preview.range).toBe("C3:D4");
    expect(preview.labels).toEqual([" Alpha ", "Beta"]);
    const model = previewToModel(preview);
    expect(model.relationships.map((e) => e.weight)).toEqual([0.7, -0.3]);
    expect(model.relationships[0].source).toBe(model.factors[0].id);
    expect(
      await inspectWorkbook(await exportWorkbook(model, preview.agenda)),
    ).toMatchObject({
      labels: preview.labels,
      weights: preview.weights,
      agenda: preview.agenda,
      issues: [],
    });
  });
  it("supports explicitly transposing the source convention", async () => {
    const model = previewToModel(await inspect(await fixture()), true);
    expect(
      model.relationships.find((e) => e.source === model.factors[0].id)?.weight,
    ).toBe(-0.3);
  });
  it.each([null, "0.7", 1.1, { formula: "1/2", result: 0.5 }])(
    "rejects invalid or ambiguous matrix values %s",
    async (value) => {
      const preview = await inspect(
        await fixture(
          ["Alpha", "Beta"],
          [
            [0, value],
            [-0.3, 0],
          ],
        ),
      );
      expect(preview.issues.length).toBeGreaterThan(0);
      expect(() => previewToModel(preview)).toThrow();
    },
  );
  it("rejects duplicate labels and row/column mismatches", async () => {
    expect(
      (await inspect(await fixture(["Alpha", " alpha "]))).issues.join(" "),
    ).toMatch(/duplicate/i);
    const book = await fixture();
    book.worksheets[0].getCell("B4").value = "Gamma";
    expect((await inspect(book)).issues.join(" ")).toMatch(/match/i);
  });
  it("flags blank axes instead of dropping factors", async () => {
    const book = await fixture(
      ["Alpha", "Beta", "Gamma"],
      [
        [0, 0.7, 0],
        [0, 0, 0.3],
        [0, 0, 0],
      ],
    );
    book.worksheets[0].getCell("D2").value = null;
    expect((await inspect(book)).issues.join(" ")).toMatch(/blank/i);
  });
  it("detects an unshifted matrix on another sheet", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Matrix");
    sheet.addRows([
      ["From → To", "A", "B"],
      ["A", 0, 0.9],
      ["B", -0.1, 0],
    ]);
    expect(await inspect(book)).toMatchObject({
      labels: ["A", "B"],
      weights: [
        [0, 0.9],
        [-0.1, 0],
      ],
      issues: [],
    });
  });
  it("protects labels against CSV formula execution", async () => {
    const model = previewToModel(
      await inspect(await fixture(["=danger", "Beta"])),
    );
    expect(matrixCsv(model)).toContain('"\'=danger"');
    expect(matrixCsv(model)).toContain("0,0.7");
  });
});
