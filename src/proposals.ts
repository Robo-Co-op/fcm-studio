import type { Model } from "./model";
export function describeChanges(before: Model, after: Model): string[] {
  const changes: string[] = [];
  for (const f of after.factors) {
    const old = before.factors.find((x) => x.id === f.id);
    if (!old) changes.push(`Add factor: ${f.label}`);
    else if (old.label !== f.label)
      changes.push(`Rename factor: ${old.label} → ${f.label}`);
  }
  for (const f of before.factors)
    if (!after.factors.some((x) => x.id === f.id))
      changes.push(`Remove factor: ${f.label}`);
  const label = (model: Model, id: string) =>
    model.factors.find((f) => f.id === id)?.label ?? id;
  for (const e of after.relationships) {
    const old = before.relationships.find(
      (x) => x.source === e.source && x.target === e.target,
    );
    const name = `${label(after, e.source)} → ${label(after, e.target)}`;
    if (!old) changes.push(`Add relationship: ${name} (${e.weight})`);
    else if (old.weight !== e.weight)
      changes.push(`Change weight: ${name} (${old.weight} → ${e.weight})`);
    else if (old.rationale !== e.rationale)
      changes.push(`Update rationale: ${name}`);
  }
  for (const e of before.relationships)
    if (
      !after.relationships.some(
        (x) => x.source === e.source && x.target === e.target,
      )
    )
      changes.push(
        `Remove relationship: ${label(before, e.source)} → ${label(before, e.target)} (${e.weight})`,
      );
  return changes;
}
