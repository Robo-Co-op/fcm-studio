import { expect, it } from "vitest";
import { demoProject } from "./demo";
import { describeChanges } from "./proposals";
it("makes removed participant edges and previous weights explicit before acceptance", () => {
  const before = demoProject().model;
  const after = structuredClone(before);
  after.relationships.shift();
  after.relationships[0].weight = -0.1;
  const changes = describeChanges(before, after);
  expect(changes).toContain(
    "Remove relationship: Learning opportunities → Member participation (0.7)",
  );
  expect(changes).toContain(
    "Change weight: Digital access → Learning opportunities (0.9 → -0.1)",
  );
});
