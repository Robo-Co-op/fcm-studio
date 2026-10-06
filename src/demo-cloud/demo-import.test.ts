import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readDemoImport, workbookToProjectInput } from "./demo-import";
import { MAX_NAME } from "./demo-store";

async function workbookFile(name = "Lander survey.xlsx") {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("FCM Values");
  sheet.getCell("B2").value = "How does trust shape participation?";
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
  const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
  return new File([buffer], name);
}

it("turns an Excel weight matrix into a new project named after the file", async () => {
  const result = await readDemoImport(await workbookFile());
  if (result.kind !== "workbook") throw new Error("expected a workbook");
  expect(result.preview.labels).toEqual(["Trust", "Participation", "Funding"]);
  const input = workbookToProjectInput(result.preview, false, result.fileName);
  expect(input.name).toBe("Lander survey");
  expect(input.agenda).toBe("How does trust shape participation?");
  expect(input.model.factors.map((f) => f.label)).toEqual([
    "Trust",
    "Participation",
    "Funding",
  ]);
  expect(input.model.relationships).toHaveLength(3);
});

it("restores an FCM Studio JSON backup as a new project", async () => {
  const backup = {
    version: 1,
    id: "old-id",
    name: "Workshop backup",
    agenda: "Saved agenda",
    revision: 4,
    model: {
      factors: [
        {
          id: "a",
          label: "A",
          color: "#dbe7f4",
          x: 0,
          y: 0,
          provenance: "human",
        },
        {
          id: "b",
          label: "B",
          color: "#dbe7f4",
          x: 1,
          y: 1,
          provenance: "human",
        },
      ],
      relationships: [
        { source: "a", target: "b", weight: -0.4, provenance: "human" },
      ],
    },
    baseline: { factors: [], relationships: [] },
    scenarios: [],
    runs: [],
  };
  const result = await readDemoImport(
    new File([JSON.stringify(backup)], "backup.json"),
  );
  if (result.kind !== "project") throw new Error("expected a project");
  expect(result.input).toEqual({
    name: "Workshop backup",
    agenda: "Saved agenda",
    model: backup.model,
  });
});

it("rejects files over 10 MB, unsupported formats, and broken JSON with clear messages", async () => {
  const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.xlsx");
  await expect(readDemoImport(big)).rejects.toThrow(/10 MB/);
  await expect(readDemoImport(new File(["a,b"], "matrix.csv"))).rejects.toThrow(
    /\.xlsx or \.json/,
  );
  await expect(
    readDemoImport(new File(["{not json"], "x.json")),
  ).rejects.toThrow(/not a valid FCM Studio backup/);
  await expect(
    readDemoImport(new File(["not a zip"], "broken.xlsx")),
  ).rejects.toThrow(/could not be read as an Excel workbook/);
});

it("keeps the project name within the limit and falls back when the file name is empty", async () => {
  const long = await readDemoImport(
    await workbookFile(`${"n".repeat(300)}.xlsx`),
  );
  if (long.kind !== "workbook") throw new Error("expected a workbook");
  expect(
    workbookToProjectInput(long.preview, false, long.fileName).name,
  ).toHaveLength(MAX_NAME);
  expect(workbookToProjectInput(long.preview, false, ".xlsx").name).toBe(
    "Imported research map",
  );
});

it("refuses to build a project from a matrix that still has issues", async () => {
  const result = await readDemoImport(await workbookFile());
  if (result.kind !== "workbook") throw new Error("expected a workbook");
  const withIssue = { ...result.preview, issues: ["C4 is not a number"] };
  expect(() => workbookToProjectInput(withIssue, false, "x.xlsx")).toThrow(
    /Resolve import issues/,
  );
});

it("shortens an over-long backup name and keeps only known model fields", async () => {
  const backup = {
    version: 1,
    id: "p",
    name: "n".repeat(250),
    agenda: "",
    revision: 0,
    model: {
      factors: [
        {
          id: "a",
          label: "A",
          color: "#dbe7f4",
          x: 0,
          y: 0,
          provenance: "human",
          extra: "x",
        },
      ],
      relationships: [],
    },
    baseline: { factors: [], relationships: [] },
    scenarios: [],
    runs: [],
  };
  const result = await readDemoImport(
    new File([JSON.stringify(backup)], "b.json"),
  );
  if (result.kind !== "project") throw new Error("expected a project");
  expect(result.input.name).toHaveLength(MAX_NAME);
  expect(result.input.model.factors[0]).not.toHaveProperty("extra");
});

it("reads columns as sources when transposed", async () => {
  const result = await readDemoImport(await workbookFile());
  if (result.kind !== "workbook") throw new Error("expected a workbook");
  const model = workbookToProjectInput(result.preview, true, "x.xlsx").model;
  const idOf = (label: string) =>
    model.factors.find((f) => f.label === label)!.id;
  expect(model.relationships).toContainEqual(
    expect.objectContaining({
      source: idOf("Participation"),
      target: idOf("Trust"),
      weight: 0.7,
    }),
  );
});
