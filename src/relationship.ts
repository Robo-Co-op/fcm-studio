import { formatWeight } from "./edge-style";

export type Direction = "increase" | "decrease";

export const STRENGTHS = [0.1, 0.3, 0.7, 0.9];

const DEFAULT_STRENGTH = 0.3;

export function describeRelationship(
  source: string,
  target: string,
  weight: number,
): string {
  if (weight === 0) return `No relationship from ${source} to ${target} yet.`;
  const negative = weight < 0;
  return `More ${source} leads to ${negative ? "less" : "more"} ${target} (${
    negative ? "negative" : "positive"
  }, ${formatWeight(weight)}).`;
}

export function withDirection(weight: number, direction: Direction): number {
  const strength = Math.abs(weight) || DEFAULT_STRENGTH;
  return direction === "decrease" ? -strength : strength;
}

export function withStrength(weight: number, strength: number): number {
  return weight < 0 ? -strength : strength;
}
