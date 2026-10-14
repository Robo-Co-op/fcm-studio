import type { ImportPreview } from "./excel";

export const blankIssue = (address: string) =>
  `${address}: blank weight. Enter 0 in the workbook or explicitly choose to interpret blanks as zero (no relationship).`;

export function importIssues(
  preview: ImportPreview,
  blanksAsZero = false,
): string[] {
  if (!blanksAsZero) return preview.issues;
  const blanks = new Set(
    preview.blankCells.map((cell) => blankIssue(cell.address)),
  );
  return preview.issues.filter((issue) => !blanks.has(issue));
}
