import { describe, expect, it } from "vitest";
import {
  addFactor,
  removeFactor,
  setWeight,
  validateModel,
  validateProject,
  validateScenario,
  validateRun,
} from "./model";
import { simulate } from "./simulation";
import { demoProject } from "./demo";
describe("shared model operations", () => {
  it("keeps asymmetric relationships independent and removes zero edges", () => {
    let m = demoProject().model;
    m = setWeight(m, "demo-0", "demo-1", 0.3);
    m = setWeight(m, "demo-1", "demo-0", -0.9);
    m = setWeight(m, "demo-0", "demo-1", 0);
    expect(
      m.relationships.find(
        (e) => e.source === "demo-1" && e.target === "demo-0",
      )?.weight,
    ).toBe(-0.9);
    expect(
      m.relationships.some(
        (e) => e.source === "demo-0" && e.target === "demo-1",
      ),
    ).toBe(false);
  });
  it("adds one factor without altering a baseline and deletes incident edges", () => {
    const p = demoProject();
    const m = addFactor(p.model, "New factor");
    expect(m.factors).toHaveLength(11);
    expect(p.baseline.factors).toHaveLength(10);
    const n = removeFactor(m, "demo-4");
    expect(
      n.relationships.some(
        (e) => e.source === "demo-4" || e.target === "demo-4",
      ),
    ).toBe(false);
  });
  it("rejects duplicate labels, unknown endpoints and bad weights", () => {
    const m = demoProject().model;
    expect(() => addFactor(m, " COMMUNITY TRUST ")).toThrow();
    expect(() => setWeight(m, "missing", "demo-0", 0.2)).toThrow();
    expect(() => setWeight(m, "demo-0", "demo-1", NaN)).toThrow();
    expect(() =>
      validateModel({ ...m, factors: [m.factors[0], m.factors[0]] }),
    ).toThrow();
  });
});

describe("untrusted project boundaries", () => {
  const scenario = () => ({
    id: "scenario-1",
    name: "Intervention",
    model: demoProject().model,
    initial: { "demo-0": 0.2 },
    clamped: { "demo-1": 0.7 },
  });
  const run = () => {
    const snapshot = demoProject().model;
    return {
      id: "run-1",
      createdAt: new Date().toISOString(),
      snapshot,
      initial: {},
      clamped: {},
      result: simulate(snapshot),
    };
  };
  it("preserves complete valid projects including scenario and run records", () => {
    const project = {
      ...demoProject(),
      scenarios: [scenario()],
      runs: [run()],
    };
    const restored: unknown = JSON.parse(JSON.stringify(project));
    expect(() => validateProject(restored)).not.toThrow();
    expect(restored).toEqual(project);
  });
  it.each([
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
    "a".repeat(121),
  ])("rejects unsafe factor ID %s", (unsafe) => {
    const model = demoProject().model;
    model.factors[0].id = unsafe;
    expect(() => validateModel(model)).toThrow();
  });
  it("rejects objects in optional text and excessive labels", () => {
    const model = demoProject().model;
    expect(() =>
      validateModel({
        ...model,
        factors: [{ ...model.factors[0], description: {} }],
        relationships: [],
      }),
    ).toThrow();
    expect(() =>
      validateModel({
        ...model,
        factors: [{ ...model.factors[0], label: "x".repeat(301) }],
        relationships: [],
      }),
    ).toThrow();
    expect(() =>
      validateModel({
        ...model,
        relationships: [{ ...model.relationships[0], rationale: {} }],
      }),
    ).toThrow();
  });
  it("rejects invalid metadata on both import and persistence paths", () => {
    for (const change of [
      { name: {} },
      { agenda: null },
      { id: "constructor" },
      { revision: -1 },
      { scenarios: {} },
      { runs: null },
    ]) {
      expect(() => validateProject({ ...demoProject(), ...change })).toThrow();
    }
  });
  it("rejects malformed scenario names and activation maps", () => {
    for (const change of [
      { name: {} },
      { initial: null },
      { initial: [] },
      { initial: { "demo-0": "x" } },
      { clamped: { missing: 0.5 } },
      { clamped: { "demo-0": 1.1 } },
    ]) {
      expect(() => validateScenario({ ...scenario(), ...change })).toThrow();
    }
  });
  it("rejects duplicate scenario and run IDs", () => {
    expect(() =>
      validateProject({
        ...demoProject(),
        scenarios: [scenario(), scenario()],
      }),
    ).toThrow();
    expect(() =>
      validateProject({ ...demoProject(), runs: [run(), run()] }),
    ).toThrow();
  });
  it("rejects corrupt run snapshots, dimensions, values, and settings", () => {
    const valid = run();
    expect(() => validateRun({ ...valid, createdAt: "invalid" })).toThrow();
    for (const change of [
      { algorithm: "unknown" },
      { converged: "yes" },
      { iterations: -1 },
      { factorIds: ["different"] },
      { states: [] },
      { states: valid.result.states.map((state) => state.slice(1)) },
      { states: valid.result.states.map((state) => state.map(() => NaN)) },
      { settings: { ...valid.result.settings, slope: 0 } },
      { settings: { ...valid.result.settings, maxIterations: 0 } },
    ]) {
      expect(() =>
        validateRun({ ...valid, result: { ...valid.result, ...change } }),
      ).toThrow();
    }
  });
});
