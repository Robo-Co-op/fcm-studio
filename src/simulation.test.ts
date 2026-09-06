import { describe, expect, it } from "vitest";
import type { Model } from "./model";
import { simulate } from "./simulation";

const model: Model = {
  factors: ["a", "b"].map((id, i) => ({
    id,
    label: id,
    color: "#cae6dc",
    x: i,
    y: 0,
    provenance: "human",
  })),
  relationships: [
    { source: "a", target: "b", weight: 0.7, provenance: "human" },
  ],
};
const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

describe("modified Kosko simulation", () => {
  it("uses source-to-target direction and simultaneous previous-step values", () => {
    const result = simulate(
      model,
      { a: 0.2, b: 0.8 },
      {},
      { maxIterations: 2 },
    );
    expect(result.states[0]).toEqual([0.2, 0.8]);
    expect(result.states[1][0]).toBeCloseTo(sigmoid(0.2), 12);
    expect(result.states[1][1]).toBeCloseTo(sigmoid(0.8 + 0.7 * 0.2), 12);
    expect(result.states[2][1]).toBeCloseTo(
      sigmoid(sigmoid(0.94) + 0.7 * sigmoid(0.2)),
      12,
    );
  });

  it("supports a negative feedback cycle without updating nodes in place", () => {
    const cycle: Model = {
      ...model,
      relationships: [
        { source: "a", target: "b", weight: -1, provenance: "human" },
        { source: "b", target: "a", weight: 1, provenance: "human" },
      ],
    };
    expect(
      simulate(cycle, { a: 1, b: 0 }, {}, { maxIterations: 1 }).states[1],
    ).toEqual([sigmoid(1), sigmoid(-1)]);
  });

  it("applies fixed interventions at the initial state and every transition", () => {
    const result = simulate(model, { a: 0.9 }, { a: 0 }, { maxIterations: 3 });
    expect(result.states.every((state) => state[0] === 0)).toBe(true);
    expect(result.states[0]).toEqual([0, 0.5]);
    expect(result.states[1][1]).toBeCloseTo(sigmoid(0.5), 12);
  });

  it("requires five consecutive stable transitions by default", () => {
    const result = simulate(model, {}, { a: 0.2, b: 0.3 });
    expect(result.iterations).toBe(5);
    expect(result.states).toHaveLength(6);
    expect(result.converged).toBe(true);
    expect(result.settings).toEqual({
      slope: 1,
      tolerance: 0.0001,
      stableSteps: 5,
      maxIterations: 100,
    });
    expect(result.algorithm).toBe("modified-kosko-sigmoid-v1");
  });

  it("reports the iteration cap without claiming convergence", () => {
    const result = simulate(model, {}, {}, { maxIterations: 1 });
    expect(result.iterations).toBe(1);
    expect(result.converged).toBe(false);
    expect(result.states).toHaveLength(2);
  });

  it("uses the configured sigmoid slope", () => {
    const result = simulate(
      model,
      { a: 0.2, b: 0.8 },
      {},
      { slope: 2, maxIterations: 1 },
    );
    expect(result.states[1][1]).toBeCloseTo(sigmoid(2 * 0.94), 12);
  });

  it("includes explicit self-influence in addition to the memory term", () => {
    const selfLoop: Model = {
      ...model,
      relationships: [
        { source: "a", target: "a", weight: -1, provenance: "human" },
      ],
    };
    expect(
      simulate(selfLoop, { a: 0.9 }, {}, { maxIterations: 1 }).states[1][0],
    ).toBe(0.5);
  });

  it.each(["__proto__", "constructor"])(
    "rejects unsafe factor ID %s under the project contract",
    (factorId) => {
      const special: Model = {
        factors: [{ ...model.factors[0], id: factorId }],
        relationships: [],
      };
      expect(() => simulate(special, {}, {}, { maxIterations: 1 })).toThrow(
        "Invalid factor.",
      );
    },
  );

  it("is deterministic and leaves model and inputs unchanged", () => {
    const before = structuredClone(model);
    const initial = { a: 0.2 };
    expect(simulate(model, initial)).toEqual(simulate(model, initial));
    expect(model).toEqual(before);
    expect(initial).toEqual({ a: 0.2 });
  });

  it.each([NaN, Infinity, -0.1, 1.1])(
    "rejects invalid activation %s",
    (value) => {
      expect(() => simulate(model, { a: value })).toThrow();
      expect(() => simulate(model, {}, { b: value })).toThrow();
    },
  );

  it("rejects unknown factors, empty models, and invalid relationships", () => {
    expect(() => simulate(model, { missing: 0.5 })).toThrow();
    expect(() => simulate(model, {}, { missing: 0.5 })).toThrow();
    expect(() => simulate({ factors: [], relationships: [] })).toThrow();
    expect(() =>
      simulate({
        ...model,
        relationships: [{ ...model.relationships[0], target: "missing" }],
      }),
    ).toThrow();
  });

  it.each([
    { slope: 0 },
    { slope: Infinity },
    { tolerance: -1 },
    { tolerance: NaN },
    { stableSteps: 0 },
    { stableSteps: 1.5 },
    { maxIterations: 0 },
    { maxIterations: 1.5 },
    { maxIterations: 10001 },
  ])("rejects invalid settings %j", (settings) => {
    expect(() => simulate(model, {}, {}, settings)).toThrow();
  });
});
