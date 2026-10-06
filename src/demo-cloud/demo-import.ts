// ExcelJS を含むため、呼び出し側は動的 import で遅延読み込みすること
import { inspectWorkbook, previewToModel, type ImportPreview } from "../excel";
import { validateProject, type Model } from "../model";
import { MAX_NAME } from "./demo-store";

export interface DemoProjectInput {
  name: string;
  agenda: string;
  model: Model;
}

export type DemoImport =
  | { kind: "workbook"; preview: ImportPreview; fileName: string }
  | { kind: "project"; input: DemoProjectInput };

const MAX_FILE_BYTES = 10 * 1024 * 1024;

// validateModel は未知のキーを通すため、バックアップ由来の余分なプロパティをここで落とす
function knownFields(model: Model): Model {
  return {
    factors: model.factors.map(
      ({ id, label, description, color, x, y, provenance }) => ({
        id,
        label,
        ...(description === undefined ? {} : { description }),
        color,
        x,
        y,
        provenance,
      }),
    ),
    relationships: model.relationships.map(
      ({ source, target, weight, provenance, rationale }) => ({
        source,
        target,
        weight,
        provenance,
        ...(rationale === undefined ? {} : { rationale }),
      }),
    ),
  };
}

export async function readDemoImport(file: File): Promise<DemoImport> {
  if (file.size > MAX_FILE_BYTES)
    throw new Error("Choose a file smaller than 10 MB.");
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "json") {
    let project: unknown;
    try {
      project = JSON.parse(await file.text());
      validateProject(project);
    } catch (error) {
      throw new Error(
        `This file is not a valid FCM Studio backup: ${(error as Error).message}`,
      );
    }
    return {
      kind: "project",
      input: {
        name: project.name.slice(0, MAX_NAME),
        agenda: project.agenda,
        model: knownFields(project.model),
      },
    };
  }
  if (extension !== "xlsx")
    throw new Error(
      "Choose an Excel workbook or FCM Studio backup (.xlsx or .json).",
    );
  let preview: ImportPreview;
  try {
    preview = await inspectWorkbook(await file.arrayBuffer());
  } catch (error) {
    throw new Error(
      `This file could not be read as an Excel workbook: ${(error as Error).message}`,
    );
  }
  return { kind: "workbook", preview, fileName: file.name };
}

export function workbookToProjectInput(
  preview: ImportPreview,
  transpose: boolean,
  fileName: string,
): DemoProjectInput {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  return {
    name: base ? base.slice(0, MAX_NAME) : "Imported research map",
    agenda: preview.agenda,
    model: previewToModel(preview, transpose),
  };
}
