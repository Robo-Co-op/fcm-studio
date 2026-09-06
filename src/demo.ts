import { COLORS, clone } from "./model";
import type { Model, Project } from "./model";
// 公開用の合成データ。参加者の研究データではない。
const labels = [
  "Learning opportunities",
  "Digital access",
  "Shared resources",
  "Community trust",
  "Member participation",
  "Collective decisions",
  "Local partnerships",
  "Financial resilience",
  "Cooperative growth",
  "Barriers to entry",
];
const positions = [
  [0, 0],
  [220, 0],
  [440, 0],
  [0, 170],
  [220, 170],
  [440, 170],
  [660, 0],
  [660, 170],
  [880, 170],
  [880, 0],
];
const links = [
  [0, 4, 0.7],
  [1, 0, 0.9],
  [2, 1, 0.7],
  [3, 4, 0.9],
  [4, 5, 0.7],
  [5, 3, 0.3],
  [6, 2, 0.7],
  [6, 8, 0.3],
  [7, 2, 0.7],
  [8, 7, 0.7],
  [4, 8, 0.9],
  [9, 4, -0.7],
  [1, 9, -0.3],
  [5, 8, 0.3],
  [7, 9, -0.3],
  [0, 3, 0.3],
];
export function demoProject(): Project {
  const model: Model = {
    factors: labels.map((label, i) => ({
      id: `demo-${i}`,
      label,
      color: COLORS[i % 5],
      x: positions[i][0],
      y: positions[i][1],
      provenance: "human",
    })),
    relationships: links.map(([a, b, w]) => ({
      source: `demo-${a}`,
      target: `demo-${b}`,
      weight: w,
      provenance: "human",
      rationale:
        "Synthetic example for exploring the interface; not a research finding.",
    })),
  };
  return {
    version: 1,
    id: "demo",
    name: "A thriving community cooperative",
    agenda: "What helps a community build a resilient, inclusive cooperative?",
    revision: 0,
    model,
    baseline: clone(model),
    scenarios: [],
    runs: [],
  };
}
