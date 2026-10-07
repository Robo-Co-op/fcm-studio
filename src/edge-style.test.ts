import { expect, it } from "vitest";
import {
  edgeAppearance,
  formatWeight,
  loadLineThickness,
  saveLineThickness,
} from "./edge-style";

it("labels weights with a plus sign or a true minus sign", () => {
  expect(formatWeight(0.7)).toBe("+0.7");
  expect(formatWeight(-0.3)).toBe("−0.3");
  expect(formatWeight(0)).toBe("0");
});

it("draws lines thicker than before by default and scales them by strength", () => {
  const before = (w: number) => 1 + Math.abs(w) * 2;
  const weak = edgeAppearance(0.1, "normal", false);
  const strong = edgeAppearance(0.9, "normal", false);
  expect(weak.strokeWidth).toBeGreaterThan(before(0.1));
  expect(strong.strokeWidth).toBeGreaterThan(before(0.9));
  expect(strong.strokeWidth).toBeGreaterThan(weak.strokeWidth);
});

it("orders the thickness settings and keeps the thin setting as it was", () => {
  const width = (t: "thin" | "normal" | "thick") =>
    edgeAppearance(0.5, t, false).strokeWidth;
  expect(width("thin")).toBe(2);
  expect(width("thin")).toBeLessThan(width("normal"));
  expect(width("normal")).toBeLessThan(width("thick"));
});

it("emphasises the selected relationship", () => {
  expect(edgeAppearance(0.5, "normal", true).strokeWidth).toBeGreaterThan(
    edgeAppearance(0.5, "normal", false).strokeWidth,
  );
});

it("dashes negative relationships so polarity does not rely on colour alone", () => {
  const positive = edgeAppearance(0.5, "normal", false);
  const negative = edgeAppearance(-0.5, "normal", false);
  expect(positive.strokeDasharray).toBeUndefined();
  expect(negative.strokeDasharray).toMatch(/\d/);
  expect(positive.stroke).not.toBe(negative.stroke);
});

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

it("remembers the chosen line thickness", () => {
  const storage = memoryStorage();
  expect(loadLineThickness(storage)).toBe("normal");
  saveLineThickness(storage, "thick");
  expect(loadLineThickness(storage)).toBe("thick");
});

it("falls back to normal for unknown values or unavailable storage", () => {
  const storage = memoryStorage();
  storage.setItem("fcm-studio-line-thickness", "huge");
  expect(loadLineThickness(storage)).toBe("normal");
  const broken = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  expect(loadLineThickness(broken)).toBe("normal");
  expect(() => saveLineThickness(broken, "thin")).not.toThrow();
  expect(loadLineThickness(undefined)).toBe("normal");
});

it.each([
  [1, "+1"],
  [-1, "−1"],
  [0.05, "+0.05"],
  [-0.05, "−0.05"],
  [0.1 + 0.2, "+0.3"],
  [-0.30000000000000004, "−0.3"],
])("labels %s as %s without floating-point noise", (weight, label) => {
  expect(formatWeight(weight)).toBe(label);
});

it("gives exact widths and keeps zero-weight lines solid", () => {
  expect(edgeAppearance(-0.5, "normal", false)).toEqual({
    stroke: "#cf766c",
    strokeWidth: 4,
    strokeDasharray: "12 8",
  });
  expect(edgeAppearance(0, "normal", false).strokeDasharray).toBeUndefined();
});

it.each(["thin", "normal", "thick"] as const)(
  "restores the %s setting",
  (thickness) => {
    const storage = memoryStorage();
    saveLineThickness(storage, thickness);
    expect(loadLineThickness(storage)).toBe(thickness);
  },
);
