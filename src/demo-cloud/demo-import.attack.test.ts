// 取り込み（信頼できないファイル）に対する攻撃・異常入力の一覧。block は例外で拒否、allow は作成まで通ること
import { afterAll, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readDemoImport, workbookToProjectInput } from "./demo-import";
import { DemoCloudStore } from "./demo-store";

async function xlsx(
  name: string,
  labels: ExcelJS.CellValue[],
  weights: ExcelJS.CellValue[][],
): Promise<File> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("FCM Values");
  sheet.getCell("B2").value = "Agenda";
  labels.forEach((label, i) => {
    sheet.getCell(2, i + 3).value = label;
    sheet.getCell(i + 3, 2).value = label;
    weights[i]?.forEach((w, j) => (sheet.getCell(i + 3, j + 3).value = w));
  });
  return new File([(await book.xlsx.writeBuffer()) as ArrayBuffer], name);
}

const square = (n: number, w: ExcelJS.CellValue = 0) =>
  Array.from({ length: n }, () => Array.from({ length: n }, () => w));

const factor = (id: string, label = id) => ({
  id,
  label,
  color: "#dbe7f4",
  x: 0,
  y: 0,
  provenance: "human",
});

function backup(overrides: Record<string, unknown> = {}, model?: unknown) {
  return {
    version: 1,
    id: "p",
    name: "Backup",
    agenda: "Agenda",
    revision: 0,
    model: model ?? {
      factors: [factor("a"), factor("b")],
      relationships: [
        { source: "a", target: "b", weight: 0.5, provenance: "human" },
      ],
    },
    baseline: { factors: [], relationships: [] },
    scenarios: [],
    runs: [],
    ...overrides,
  };
}

const json = (value: unknown, name = "backup.json") =>
  new File([typeof value === "string" ? value : JSON.stringify(value)], name);

// readDemoImport → (workbook なら) workbookToProjectInput → createProject の全経路を通す
async function attempt(file: File): Promise<"block" | "allow"> {
  const store = new DemoCloudStore();
  store.signIn();
  try {
    const result = await readDemoImport(file);
    const input =
      result.kind === "project"
        ? result.input
        : workbookToProjectInput(result.preview, false, result.fileName);
    store.createProject(input);
    return "allow";
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message.length).toBeGreaterThan(0);
    return "block";
  }
}

const table: string[] = [];
const cases: [string, () => File | Promise<File>, "block" | "allow"][] = [
  // 許可側（正当な利用を止めないこと）
  [
    "valid xlsx",
    () =>
      xlsx(
        "ok.xlsx",
        ["A", "B"],
        [
          [0, 0.5],
          [0, 0],
        ],
      ),
    "allow",
  ],
  [
    "uppercase .XLSX",
    () =>
      xlsx(
        "OK.XLSX",
        ["A", "B"],
        [
          [0, 0.5],
          [0, 0],
        ],
      ),
    "allow",
  ],
  ["valid JSON backup", () => json(backup()), "allow"],
  ["uppercase .JSON", () => json(backup(), "B.JSON"), "allow"],
  [
    "HTML-like label stays text",
    () =>
      xlsx(
        "x.xlsx",
        ["<img src=x onerror=alert(1)>", "B"],
        [
          [0, 0.5],
          [0, 0],
        ],
      ),
    "allow",
  ],
  [
    "empty matrix weights (all zero)",
    () => xlsx("z.xlsx", ["A", "B"], square(2)),
    "allow",
  ],
  // 拒否側
  [
    "over 10 MB",
    () => new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.xlsx"),
    "block",
  ],
  ["0-byte xlsx", () => new File([], "empty.xlsx"), "block"],
  ["no extension", () => json(backup(), "backup"), "block"],
  ["csv", () => new File(["a,b"], "m.csv"), "block"],
  ["json disguised as xlsx", () => json(backup(), "backup.xlsx"), "block"],
  [
    "xlsx disguised as json",
    async () =>
      new File(
        [await (await xlsx("a.xlsx", ["A"], [[0]])).arrayBuffer()],
        "a.json",
      ),
    "block",
  ],
  ["empty JSON file", () => json(""), "block"],
  ["JSON null", () => json("null"), "block"],
  ["JSON array", () => json("[]"), "block"],
  [
    "weight out of range in JSON",
    () =>
      json(
        backup(
          {},
          {
            factors: [factor("a"), factor("b")],
            relationships: [
              { source: "a", target: "b", weight: 2, provenance: "human" },
            ],
          },
        ),
      ),
    "block",
  ],
  [
    "string weight in JSON",
    () =>
      json(
        backup(
          {},
          {
            factors: [factor("a"), factor("b")],
            relationships: [
              { source: "a", target: "b", weight: "0.5", provenance: "human" },
            ],
          },
        ),
      ),
    "block",
  ],
  [
    "dangling relationship in JSON",
    () =>
      json(
        backup(
          {},
          {
            factors: [factor("a")],
            relationships: [
              {
                source: "a",
                target: "ghost",
                weight: 0.5,
                provenance: "human",
              },
            ],
          },
        ),
      ),
    "block",
  ],
  [
    "duplicate factor ids in JSON",
    () =>
      json(
        backup({}, { factors: [factor("a"), factor("a")], relationships: [] }),
      ),
    "block",
  ],
  [
    "201 factors in JSON",
    () =>
      json(
        backup(
          {},
          {
            factors: Array.from({ length: 201 }, (_, i) => factor(`f${i}`)),
            relationships: [],
          },
        ),
      ),
    "block",
  ],
  [
    "10k-char name in JSON (shortened to 200)",
    () => json(backup({ name: "n".repeat(10000) })),
    "allow",
  ],
  [
    "20k-char agenda in JSON",
    () => json(backup({ agenda: "a".repeat(20000) })),
    "block",
  ],
  [
    "10k-char factor label in JSON",
    () =>
      json(
        backup(
          {},
          { factors: [factor("a", "l".repeat(10000))], relationships: [] },
        ),
      ),
    "block",
  ],
  [
    "xlsx weight 1.5",
    () =>
      xlsx(
        "w.xlsx",
        ["A", "B"],
        [
          [0, 1.5],
          [0, 0],
        ],
      ),
    "block",
  ],
  [
    "xlsx text weight",
    () =>
      xlsx(
        "t.xlsx",
        ["A", "B"],
        [
          [0, "high"],
          [0, 0],
        ],
      ),
    "block",
  ],
  [
    "xlsx formula weight",
    () =>
      xlsx(
        "f.xlsx",
        ["A", "B"],
        [
          [0, { formula: "1/2", result: 0.5 }],
          [0, 0],
        ],
      ),
    "block",
  ],
  [
    "xlsx blank label with weights beyond it",
    () =>
      xlsx(
        "b.xlsx",
        ["A", ""],
        [
          [0, 0.5],
          [0, 0],
        ],
      ),
    "block",
  ],
  [
    "xlsx weight outside the matrix",
    async () => {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet("FCM Values");
      sheet.getCell("B2").value = "Agenda";
      ["A", "B"].forEach((label, i) => {
        sheet.getCell(2, i + 3).value = label;
        sheet.getCell(i + 3, 2).value = label;
      });
      sheet.getCell("C3").value = 0;
      sheet.getCell("D3").value = 0.5;
      sheet.getCell("C4").value = 0;
      sheet.getCell("D4").value = 0;
      sheet.getCell("F3").value = 0.9;
      return new File(
        [(await book.xlsx.writeBuffer()) as ArrayBuffer],
        "o.xlsx",
      );
    },
    "block",
  ],
  [
    "xlsx with 25 sheets",
    async () => {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet("FCM Values");
      ["A", "B"].forEach((label, i) => {
        sheet.getCell(2, i + 3).value = label;
        sheet.getCell(i + 3, 2).value = label;
        [0, 0.5].forEach((w, j) => (sheet.getCell(i + 3, j + 3).value = w));
      });
      for (let i = 0; i < 24; i++) book.addWorksheet(`S${i}`);
      return new File(
        [(await book.xlsx.writeBuffer()) as ArrayBuffer],
        "s.xlsx",
      );
    },
    "block",
  ],
  [
    "zip bomb (60 MB of zeros, compressed below 1 MB)",
    async () => {
      // 正しいワークブックに 60 MB の詰め物を足す。サイズ検査がなければ取り込めてしまう形
      const valid = await xlsx(
        "v.xlsx",
        ["A", "B"],
        [
          [0, 0.5],
          [0, 0],
        ],
      );
      const zip = await JSZip.loadAsync(await valid.arrayBuffer());
      zip.file("xl/padding.bin", new Uint8Array(60 * 1024 * 1024));
      return new File(
        [
          await zip.generateAsync({
            type: "arraybuffer",
            compression: "DEFLATE",
          }),
        ],
        "bomb.xlsx",
      );
    },
    "block",
  ],
  [
    "rich text labels",
    async () => {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet("FCM Values");
      const rich = (text: string) => ({ richText: [{ text }] });
      ["A", "B"].forEach((label, i) => {
        sheet.getCell(2, i + 3).value = rich(label);
        sheet.getCell(i + 3, 2).value = rich(label);
        [0, -0.5].forEach((w, j) => (sheet.getCell(i + 3, j + 3).value = w));
      });
      return new File(
        [(await book.xlsx.writeBuffer()) as ArrayBuffer],
        "r.xlsx",
      );
    },
    "allow",
  ],
  [
    "xlsx duplicate labels",
    () =>
      xlsx(
        "d.xlsx",
        ["A", "a"],
        [
          [0, 0.5],
          [0, 0],
        ],
      ),
    "block",
  ],
  [
    "xlsx 201 factors",
    () =>
      xlsx(
        "h.xlsx",
        Array.from({ length: 201 }, (_, i) => `F${i}`),
        square(201),
      ),
    "block",
  ],
];

for (const [label, make, expected] of cases) {
  it(`import ${expected}: ${label}`, async () => {
    const actual = await attempt(await make());
    table.push(
      `${actual === expected ? "ok  " : "FAIL"} ${expected.padEnd(5)} ${label}`,
    );
    expect(actual).toBe(expected);
  }, 30_000);
}

it("does not pollute Object.prototype through a __proto__ key in a JSON backup", async () => {
  const text = JSON.stringify(backup()).replace(
    '"version":1',
    '"__proto__":{"polluted":"yes"},"version":1',
  );
  await attempt(json(text));
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

afterAll(() => console.log(`demo import attack list\n${table.join("\n")}`));
