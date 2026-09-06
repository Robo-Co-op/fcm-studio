import ExcelJS from "exceljs";
import { COLORS, id, validateModel, type Model } from "./model";

export interface ImportPreview {
  sheet: string;
  agenda: string;
  labels: string[];
  weights: number[][];
  issues: string[];
  range: string;
}

const labelText = (value: ExcelJS.CellValue): string =>
  typeof value === "string" ? value : "";
const normalize = (label: string): string => label.trim().toLowerCase();

export async function inspectWorkbook(
  data: ArrayBuffer,
): Promise<ImportPreview> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheets = [...workbook.worksheets].sort(
    (a, b) => Number(b.name === "FCM Values") - Number(a.name === "FCM Values"),
  );
  let best:
    | {
        sheet: ExcelJS.Worksheet;
        row: number;
        col: number;
        width: number;
        height: number;
        score: number;
      }
    | undefined;
  for (const sheet of sheets) {
    // 書式だけのセルは行列の境界として扱わない。
    const actualRows = Math.min(sheet.actualRowCount + 40, sheet.rowCount, 250);
    for (let row = 1; row <= Math.min(actualRows, 40); row++) {
      for (let col = 1; col <= Math.min(sheet.columnCount, 40); col++) {
        let width = 0;
        let height = 0;
        for (
          let offset = 1;
          offset <= Math.min(201, sheet.columnCount - col);
          offset++
        ) {
          if (labelText(sheet.getCell(row, col + offset).value)) width = offset;
        }
        for (
          let offset = 1;
          offset <= Math.min(201, sheet.rowCount - row);
          offset++
        ) {
          if (labelText(sheet.getCell(row + offset, col).value))
            height = offset;
        }
        if (!width || !height) continue;
        let matches = 0;
        for (let offset = 1; offset <= Math.min(width, height); offset++) {
          const column = normalize(
            labelText(sheet.getCell(row, col + offset).value),
          );
          const rowLabel = normalize(
            labelText(sheet.getCell(row + offset, col).value),
          );
          if (column && column === rowLabel) matches++;
        }
        const score = matches * 1000 + Math.min(width, height);
        if (!best || score > best.score)
          best = { sheet, row, col, width, height, score };
      }
    }
    if (best?.sheet.name === "FCM Values") break;
  }
  if (!best)
    throw new Error(
      "No labeled weight matrix found. Use matching factor labels above and to the left of a square numeric matrix.",
    );
  const { sheet, row, col, width, height } = best;
  if (width > 200 || height > 200)
    throw new Error("Maximum 200 factors per project.");
  const issues: string[] = [];
  if (width !== height)
    issues.push(`Matrix is not square: ${height} rows and ${width} columns.`);
  const labels = Array.from({ length: width }, (_, i) =>
    labelText(sheet.getCell(row, col + i + 1).value),
  );
  const seen = new Set<string>();
  labels.forEach((label, i) => {
    if (!label.trim()) issues.push(`Column ${i + 1} has a blank factor label.`);
    else if (seen.has(normalize(label)))
      issues.push(`Duplicate factor label: ${label}.`);
    seen.add(normalize(label));
    const rowLabel = labelText(sheet.getCell(row + i + 1, col).value);
    if (!rowLabel.trim()) issues.push(`Row ${i + 1} has a blank factor label.`);
    if (normalize(rowLabel) !== normalize(label))
      issues.push(`Row ${i + 1} label does not match its column label.`);
  });
  const weights = Array.from({ length: height }, (_, i) =>
    Array.from({ length: width }, (_, j) => {
      const cell = sheet.getCell(row + i + 1, col + j + 1);
      const value = cell.value;
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < -1 ||
        value > 1
      ) {
        issues.push(
          `${cell.address}: enter a numeric weight between −1 and 1 (use 0 for no relationship; formulas are not accepted).`,
        );
        return Number.NaN;
      }
      return value;
    }),
  );
  return {
    sheet: sheet.name,
    agenda: labelText(sheet.getCell(row, col).value),
    labels,
    weights,
    issues,
    range: `${sheet.getCell(row + 1, col + 1).address}:${sheet.getCell(row + height, col + width).address}`,
  };
}

export function previewToModel(
  preview: ImportPreview,
  transpose = false,
): Model {
  if (preview.issues.length)
    throw new Error("Resolve import issues before importing.");
  if (
    !preview.labels.length ||
    preview.weights.length !== preview.labels.length ||
    preview.weights.some((row) => row.length !== preview.labels.length)
  )
    throw new Error("Invalid matrix dimensions.");
  const factors = preview.labels.map((label, i) => ({
    id: id(),
    label,
    color: COLORS[i % COLORS.length],
    x: (i % 5) * 230,
    y: Math.floor(i / 5) * 140,
    provenance: "imported" as const,
  }));
  const relationships = preview.weights.flatMap((row, i) =>
    row.flatMap((weight, j) =>
      weight === 0
        ? []
        : [
            {
              source: factors[transpose ? j : i].id,
              target: factors[transpose ? i : j].id,
              weight,
              provenance: "imported" as const,
            },
          ],
    ),
  );
  const model: Model = { factors, relationships };
  validateModel(model);
  return model;
}

function matrix(model: Model): number[][] {
  const values = model.factors.map(() => model.factors.map(() => 0));
  const indexes = new Map(model.factors.map((factor, i) => [factor.id, i]));
  model.relationships.forEach((edge) => {
    values[indexes.get(edge.source)!][indexes.get(edge.target)!] = edge.weight;
  });
  return values;
}

export async function exportWorkbook(
  model: Model,
  agenda: string,
): Promise<ArrayBuffer> {
  validateModel(model);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("FCM Values");
  sheet.getCell("B2").value = agenda;
  const weights = matrix(model);
  model.factors.forEach((factor, i) => {
    sheet.getCell(2, i + 3).value = factor.label;
    sheet.getCell(i + 3, 2).value = factor.label;
    weights[i].forEach((weight, j) => {
      sheet.getCell(i + 3, j + 3).value = weight;
    });
  });
  sheet.getColumn(2).width = 35;
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: 2 }];
  const range = workbook.addWorksheet("Range");
  range.addRows([
    ["Convention", "Rows are sources; columns are targets"],
    ["Minimum", -1],
    ["Maximum", 1],
    ["No relationship", 0],
    ["Weak", 0.1],
    ["Moderate", 0.3],
    ["Strong", 0.7],
    ["Very strong", 0.9],
  ]);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer).slice().buffer;
}

export function matrixCsv(model: Model): string {
  validateModel(model);
  const escape = (label: string) =>
    `"${(/^[\s]*[=+\-@\t\r\n]/.test(label) ? "'" + label : label).replace(/"/g, '""')}"`;
  const weights = matrix(model);
  return [
    [escape("From → To"), ...model.factors.map((f) => escape(f.label))].join(
      ",",
    ),
    ...model.factors.map((factor, i) =>
      [escape(factor.label), ...weights[i]].join(","),
    ),
  ].join("\r\n");
}
