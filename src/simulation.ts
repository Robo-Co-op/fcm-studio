import { validateModel } from "./model";
import type { Model, SimulationResult, SimulationSettings } from "./model";

export const ALGORITHM_VERSION = "modified-kosko-sigmoid-v1";
export const DEFAULT_SETTINGS: Readonly<SimulationSettings> = Object.freeze({
  slope: 1,
  tolerance: 0.0001,
  stableSteps: 5,
  maxIterations: 100,
});

function activationValues(
  values: Record<string, number>,
  ids: Set<string>,
): Map<string, number> {
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new Error("Activation values must be a factor-to-value object.");
  const entries = Object.entries(values);
  for (const [id, value] of entries) {
    if (!ids.has(id))
      throw new Error(`Unknown factor in activation values: ${id}`);
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw new Error("Activation values must be between 0 and 1.");
  }
  return new Map(entries);
}

export function simulate(
  model: Model,
  initial: Record<string, number> = {},
  clamped: Record<string, number> = {},
  settings: Partial<SimulationSettings> = {},
): SimulationResult {
  validateModel(model);
  if (model.factors.length === 0)
    throw new Error("Add at least one factor before simulating.");
  const config: SimulationSettings = { ...DEFAULT_SETTINGS, ...settings };
  if (!Number.isFinite(config.slope) || config.slope <= 0 || config.slope > 100)
    throw new Error("Sigmoid slope must be greater than 0 and at most 100.");
  if (
    !Number.isFinite(config.tolerance) ||
    config.tolerance <= 0 ||
    config.tolerance > 1
  )
    throw new Error("Tolerance must be greater than 0 and at most 1.");
  for (const value of [config.stableSteps, config.maxIterations]) {
    if (!Number.isInteger(value) || value < 1 || value > 10000)
      throw new Error(
        "Iteration settings must be integers between 1 and 10000.",
      );
  }

  const factorIds = model.factors.map((factor) => factor.id);
  const ids = new Set(factorIds);
  const starting = activationValues(initial, ids);
  const fixed = activationValues(clamped, ids);
  const indices = new Map(factorIds.map((id, index) => [id, index]));
  // 因子IDの索引は両端検証済みの関係から作成する。
  const edges = model.relationships.map((edge) => ({
    source: indices.get(edge.source)!,
    target: indices.get(edge.target)!,
    weight: edge.weight,
  }));
  const states: number[][] = [
    factorIds.map((id) => fixed.get(id) ?? starting.get(id) ?? 0.5),
  ];
  let stableTransitions = 0;
  let converged = false;

  for (let iteration = 0; iteration < config.maxIterations; iteration += 1) {
    const previous = states[states.length - 1];
    // 全入力を前ステップから計算し、ノードの走査順に依存させない。
    const inputs = [...previous];
    for (const edge of edges)
      inputs[edge.target] += previous[edge.source] * edge.weight;
    const next = inputs.map(
      (input, index) =>
        fixed.get(factorIds[index]) ??
        1 / (1 + Math.exp(-config.slope * input)),
    );
    const change = Math.max(
      ...next.map((value, index) => Math.abs(value - previous[index])),
    );
    states.push(next);
    stableTransitions = change < config.tolerance ? stableTransitions + 1 : 0;
    if (stableTransitions >= config.stableSteps) {
      converged = true;
      break;
    }
  }

  return {
    states,
    factorIds,
    iterations: states.length - 1,
    converged,
    algorithm: ALGORITHM_VERSION,
    settings: config,
  };
}
