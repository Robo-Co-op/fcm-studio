import { expect, it } from "vitest";
import {
  describeRelationship,
  withDirection,
  withStrength,
} from "./relationship";

it("describes a negative relationship in plain words with the factor names", () => {
  expect(describeRelationship("Communication", "Conflict", -0.7)).toBe(
    "More Communication leads to less Conflict (negative, −0.7).",
  );
});

it("describes a positive relationship", () => {
  expect(describeRelationship("Trust", "Participation", 0.3)).toBe(
    "More Trust leads to more Participation (positive, +0.3).",
  );
});

it("says when there is no relationship yet", () => {
  expect(describeRelationship("Trust", "Participation", 0)).toBe(
    "No relationship from Trust to Participation yet.",
  );
});

it("flips the direction but keeps the strength", () => {
  expect(withDirection(0.7, "decrease")).toBe(-0.7);
  expect(withDirection(-0.7, "increase")).toBe(0.7);
  expect(withDirection(-0.7, "decrease")).toBe(-0.7);
});

it("creates a moderate relationship when choosing a direction for none", () => {
  expect(withDirection(0, "decrease")).toBe(-0.3);
  expect(withDirection(0, "increase")).toBe(0.3);
});

it("changes the strength but keeps the direction", () => {
  expect(withStrength(-0.3, 0.9)).toBe(-0.9);
  expect(withStrength(0.7, 0.1)).toBe(0.1);
  expect(withStrength(0, 0.7)).toBe(0.7);
});
