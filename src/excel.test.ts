import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
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

describe("Excel import hardening (issue #18)", () => {
  it("reads labels written as rich text, numbers or hyperlinks", async () => {
    const book = await fixture(
      ["Alpha", "Beta", "Gamma"],
      [
        [0, 0.7, 0],
        [0, 0, -0.3],
        [0, 0, 0],
      ],
    );
    const sheet = book.worksheets[0];
    const rich = {
      richText: [{ text: "Al" }, { font: { bold: true }, text: "pha" }],
    };
    sheet.getCell("C2").value = rich;
    sheet.getCell("B3").value = rich;
    sheet.getCell("D2").value = 2030;
    sheet.getCell("B4").value = 2030;
    const link = { text: "Gamma", hyperlink: "https://example.org" };
    sheet.getCell("E2").value = link;
    sheet.getCell("B5").value = link;
    const preview = await inspect(book);
    expect(preview.labels).toEqual(["Alpha", "2030", "Gamma"]);
    expect(preview.issues).toEqual([]);
  });

  it("flags weights to the right of the matrix instead of dropping them", async () => {
    const book = await fixture(
      ["Alpha", "Beta"],
      [
        [0, 0.7],
        [-0.3, 0],
      ],
    );
    book.worksheets[0].getCell("E3").value = 0.5;
    const issues = (await inspect(book)).issues.join(" ");
    expect(issues).toMatch(/E3/);
    expect(issues).toMatch(/outside/i);
  });

  it("flags weights below the matrix instead of dropping them", async () => {
    const book = await fixture(
      ["Alpha", "Beta"],
      [
        [0, 0.7],
        [-0.3, 0],
      ],
    );
    book.worksheets[0].getCell("D5").value = -0.4;
    expect((await inspect(book)).issues.join(" ")).toMatch(/D5.*outside/i);
  });

  it("flags a trailing blank label whose column still has weights", async () => {
    const book = await fixture(
      ["Alpha", "Beta"],
      [
        [0, 0.7],
        [-0.3, 0],
      ],
    );
    book.worksheets[0].getCell("D2").value = null;
    book.worksheets[0].getCell("B4").value = null;
    const preview = await inspect(book);
    expect(preview.issues.join(" ")).toMatch(/outside/i);
    expect(() => previewToModel(preview)).toThrow(/Resolve import issues/);
  });

  it("flags labels longer than the 300-character factor limit", async () => {
    const long = "x".repeat(301);
    const preview = await inspect(await fixture([long, "Beta"]));
    expect(preview.issues.join(" ")).toMatch(/300/);
  });

  it("refuses workbooks with too many sheets", async () => {
    const book = await fixture();
    for (let i = 0; i < 25; i++) book.addWorksheet(`Extra ${i}`);
    await expect(inspect(book)).rejects.toThrow(/sheets/i);
  });

  // 本物のワークブックに 60 MB の詰め物を足した zip bomb を作り、加工して宣言値の偽装を試す
  async function bomb(): Promise<Uint8Array> {
    const zip = await JSZip.loadAsync(
      (await (await fixture()).xlsx.writeBuffer()) as ArrayBuffer,
    );
    zip.file("xl/padding.bin", new Uint8Array(60 * 1024 * 1024));
    return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  }
  function endOfCentralDirectory(bytes: Uint8Array): number {
    for (let i = bytes.length - 22; i >= 0; i--)
      if (
        bytes[i] === 0x50 &&
        bytes[i + 1] === 0x4b &&
        bytes[i + 2] === 0x05 &&
        bytes[i + 3] === 0x06
      )
        return i;
    throw new Error("no EOCD");
  }
  it.each([
    [
      "a lying entry count",
      (bytes: Uint8Array) => {
        const copy = bytes.slice();
        const end = endOfCentralDirectory(copy);
        new DataView(copy.buffer).setUint16(end + 8, 1, true);
        new DataView(copy.buffer).setUint16(end + 10, 1, true);
        return copy;
      },
    ],
    [
      "junk bytes in front",
      (bytes: Uint8Array) => {
        const copy = new Uint8Array(bytes.length + 100);
        copy.set(bytes, 100);
        return copy;
      },
    ],
    [
      "a long tail after the archive",
      (bytes: Uint8Array) => {
        const copy = new Uint8Array(bytes.length + 70000);
        copy.set(bytes, 0);
        return copy;
      },
    ],
  ])("still refuses a zip bomb with %s", async (_, tamper) => {
    const data = tamper(await bomb());
    await expect(
      inspectWorkbook(data.buffer.slice(0) as ArrayBuffer),
    ).rejects.toThrow(/50 MB/);
  });

  it("refuses archives that expand to more than 50 MB before parsing them", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("xl/padding.bin", new Uint8Array(60 * 1024 * 1024));
    const data = await zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
    });
    expect(data.byteLength).toBeLessThan(1024 * 1024);
    await expect(inspectWorkbook(data)).rejects.toThrow(/50 MB/);
  });
});
