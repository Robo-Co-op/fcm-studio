export type Provenance = "human" | "imported" | "ai";
export interface Factor {
  id: string;
  label: string;
  description?: string;
  color: string;
  x: number;
  y: number;
  provenance: Provenance;
}
export interface Relationship {
  source: string;
  target: string;
  weight: number;
  provenance: Provenance;
  rationale?: string;
}
export interface Model {
  factors: Factor[];
  relationships: Relationship[];
}
export interface Scenario {
  id: string;
  name: string;
  model: Model;
  initial: Record<string, number>;
  clamped: Record<string, number>;
}
export interface SimulationSettings {
  slope: number;
  tolerance: number;
  stableSteps: number;
  maxIterations: number;
}
export interface SimulationResult {
  states: number[][];
  factorIds: string[];
  iterations: number;
  converged: boolean;
  algorithm: string;
  settings: SimulationSettings;
}
export interface Run {
  id: string;
  createdAt: string;
  snapshot: Model;
  initial: Record<string, number>;
  clamped: Record<string, number>;
  result: SimulationResult;
}
export interface Project {
  version: 1;
  id: string;
  name: string;
  agenda: string;
  revision: number;
  model: Model;
  baseline: Model;
  scenarios: Scenario[];
  runs: Run[];
}
export const COLORS = ["#cae6dc", "#e9dcef", "#f8dfbe", "#dbe7f4", "#e7ecc6"];
export const clone = <T>(value: T): T => structuredClone(value);
export const id = (): string => crypto.randomUUID();
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const boundedString = (
  value: unknown,
  max: number,
  nonempty = true,
): value is string =>
  typeof value === "string" &&
  value.length <= max &&
  (!nonempty || value.trim().length > 0);
const safeId = (value: unknown): value is string =>
  boundedString(value, 120) && !(value in Object.prototype);
const optionalText = (value: unknown): boolean =>
  value === undefined || boundedString(value, 4000, false);
// SQL と同じ決定的な比較: 前後空白を除き ASCII 大文字だけを小文字化する。
export const factorLabelKey = (label: string): string =>
  label.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());
export function setWeight(
  model: Model,
  source: string,
  target: string,
  weight: number,
  provenance: Provenance = "human",
): Model {
  if (!Number.isFinite(weight) || weight < -1 || weight > 1)
    throw new Error("Weight must be between −1 and 1.");
  if (
    !model.factors.some((f) => f.id === source) ||
    !model.factors.some((f) => f.id === target)
  )
    throw new Error("Unknown factor.");
  const relationships = model.relationships.filter(
    (e) => e.source !== source || e.target !== target,
  );
  if (weight !== 0) relationships.push({ source, target, weight, provenance });
  return { ...model, relationships };
}
export function addFactor(model: Model, label: string): Model {
  const name = label.trim();
  if (
    !name ||
    model.factors.some((f) => factorLabelKey(f.label) === factorLabelKey(name))
  )
    throw new Error("Enter a unique factor name.");
  const n = model.factors.length;
  return {
    ...model,
    factors: [
      ...model.factors,
      {
        id: id(),
        label: name,
        color: COLORS[n % COLORS.length],
        x: (n % 4) * 230,
        y: Math.floor(n / 4) * 130,
        provenance: "human",
      },
    ],
  };
}
export function removeFactor(model: Model, factorId: string): Model {
  return {
    factors: model.factors.filter((f) => f.id !== factorId),
    relationships: model.relationships.filter(
      (e) => e.source !== factorId && e.target !== factorId,
    ),
  };
}
export function validateModel(value: unknown): asserts value is Model {
  if (!value || typeof value !== "object") throw new Error("Invalid model.");
  const m = value as Model;
  if (
    !Array.isArray(m.factors) ||
    !Array.isArray(m.relationships) ||
    m.factors.length > 200 ||
    m.relationships.length > 40000
  )
    throw new Error("Invalid model size (maximum 200 factors).");
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const f of m.factors) {
    if (
      !f ||
      !safeId(f.id) ||
      !boundedString(f.label, 300) ||
      !optionalText(f.description) ||
      typeof f.color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(f.color) ||
      !Number.isFinite(f.x) ||
      !Number.isFinite(f.y) ||
      !["human", "imported", "ai"].includes(f.provenance)
    )
      throw new Error("Invalid factor.");
    if (ids.has(f.id) || labels.has(factorLabelKey(f.label)))
      throw new Error("Duplicate factor IDs or names.");
    ids.add(f.id);
    labels.add(factorLabelKey(f.label));
  }
  const pairs = new Set<string>();
  for (const e of m.relationships) {
    if (
      !e ||
      !ids.has(e.source) ||
      !ids.has(e.target) ||
      !optionalText(e.rationale) ||
      !Number.isFinite(e.weight) ||
      e.weight < -1 ||
      e.weight > 1 ||
      e.weight === 0 ||
      !["human", "imported", "ai"].includes(e.provenance)
    )
      throw new Error("Invalid relationship.");
    const key = JSON.stringify([e.source, e.target]);
    if (pairs.has(key)) throw new Error("Duplicate relationship.");
    pairs.add(key);
  }
}

function validateActivations(
  value: unknown,
  model: Model,
): asserts value is Record<string, number> {
  if (!isRecord(value)) throw new Error("Invalid activation values.");
  const ids = new Set(model.factors.map((factor) => factor.id));
  for (const [key, activation] of Object.entries(value)) {
    if (
      !ids.has(key) ||
      typeof activation !== "number" ||
      !Number.isFinite(activation) ||
      activation < 0 ||
      activation > 1
    )
      throw new Error("Invalid activation value or factor ID.");
  }
}

export function validateScenario(value: unknown): asserts value is Scenario {
  if (!isRecord(value) || !safeId(value.id) || !boundedString(value.name, 300))
    throw new Error("Invalid scenario.");
  validateModel(value.model);
  validateActivations(value.initial, value.model);
  validateActivations(value.clamped, value.model);
}

export function validateRun(value: unknown): asserts value is Run {
  if (
    !isRecord(value) ||
    !safeId(value.id) ||
    !boundedString(value.createdAt, 100) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.createdAt) ||
    value.createdAt.startsWith("0000-") ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    new Date(value.createdAt).toISOString() !== value.createdAt
  )
    throw new Error("Invalid run.");
  validateModel(value.snapshot);
  validateActivations(value.initial, value.snapshot);
  validateActivations(value.clamped, value.snapshot);
  const result = value.result;
  if (
    !isRecord(result) ||
    result.algorithm !== "modified-kosko-sigmoid-v1" ||
    typeof result.converged !== "boolean" ||
    !Number.isInteger(result.iterations) ||
    typeof result.iterations !== "number" ||
    result.iterations < 1 ||
    result.iterations > 10000
  )
    throw new Error("Invalid simulation result.");
  const settings = result.settings;
  if (
    !isRecord(settings) ||
    typeof settings.slope !== "number" ||
    !Number.isFinite(settings.slope) ||
    settings.slope <= 0 ||
    settings.slope > 100 ||
    typeof settings.tolerance !== "number" ||
    !Number.isFinite(settings.tolerance) ||
    settings.tolerance <= 0 ||
    settings.tolerance > 1
  )
    throw new Error("Invalid simulation settings.");
  for (const setting of [settings.stableSteps, settings.maxIterations]) {
    if (
      typeof setting !== "number" ||
      !Number.isInteger(setting) ||
      setting < 1 ||
      setting > 10000
    )
      throw new Error("Invalid iteration settings.");
  }
  if (result.iterations > (settings.maxIterations as number))
    throw new Error("Run exceeds iteration limit.");
  const factorIds = value.snapshot.factors.map((factor) => factor.id);
  if (
    !factorIds.length ||
    !Array.isArray(result.factorIds) ||
    result.factorIds.length !== factorIds.length ||
    result.factorIds.some((factorId, index) => factorId !== factorIds[index])
  )
    throw new Error("Run factor IDs differ from its snapshot.");
  if (
    !Array.isArray(result.states) ||
    result.states.length !== result.iterations + 1
  )
    throw new Error("Invalid trajectory length.");
  for (const state of result.states) {
    if (
      !Array.isArray(state) ||
      state.length !== factorIds.length ||
      state.some(
        (activation) =>
          typeof activation !== "number" ||
          !Number.isFinite(activation) ||
          activation < 0 ||
          activation > 1,
      )
    )
      throw new Error("Invalid trajectory activations.");
  }
}

// ファイル取込とIndexedDB復元で同じ境界検証を使う。
export function validateProject(value: unknown): asserts value is Project {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !safeId(value.id) ||
    !boundedString(value.name, 16000) ||
    !boundedString(value.agenda, 16000, false) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !Array.isArray(value.scenarios) ||
    value.scenarios.length > 100 ||
    !Array.isArray(value.runs) ||
    value.runs.length > 100
  )
    throw new Error("Invalid project backup.");
  validateModel(value.model);
  validateModel(value.baseline);
  const scenarioIds = new Set<string>();
  for (const scenario of value.scenarios) {
    validateScenario(scenario);
    if (scenarioIds.has(scenario.id)) throw new Error("Duplicate scenario ID.");
    scenarioIds.add(scenario.id);
  }
  const runIds = new Set<string>();
  for (const run of value.runs) {
    validateRun(run);
    if (runIds.has(run.id)) throw new Error("Duplicate run ID.");
    runIds.add(run.id);
  }
}
