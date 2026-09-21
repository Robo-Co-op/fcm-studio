import { expect, it } from "vitest";
import { DemoCloudStore, createDemoControls } from "./demo-store";

it("starts signed out and signs in a demo user on demand", () => {
  const store = new DemoCloudStore();
  expect(store.user).toBeNull();
  const user = store.signIn();
  expect(user.email).toMatch(/@/);
  expect(store.user).toEqual(user);
});

it("signs out and clears the seeded demo user", () => {
  const store = new DemoCloudStore();
  store.signIn();
  store.signOut();
  expect(store.user).toBeNull();
});

it("has no projects to list before signing in", () => {
  const store = new DemoCloudStore();
  expect(store.listProjects()).toEqual([]);
});

it("lists three seeded demo projects with distinct roles after signing in", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const projects = store.listProjects();
  expect(projects).toHaveLength(3);
  const roles = new Set(projects.map((project) => project.role));
  expect(roles).toEqual(new Set(["owner", "editor", "viewer"]));
});

it("applies an edit to a project and bumps its revision", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const next = { ...project.document, name: "Renamed project" };
  store.change(project.id, next);
  const reloaded = store.getProject(project.id)!;
  expect(reloaded.document.name).toBe("Renamed project");
  expect(reloaded.document.revision).toBe(project.document.revision + 1);
});

it("undoes the last local edit and reports whether undo is available", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  expect(store.canUndo(project.id)).toBe(false);
  store.change(project.id, { ...project.document, name: "Renamed project" });
  expect(store.canUndo(project.id)).toBe(true);
  store.undo(project.id);
  expect(store.getProject(project.id)!.document.name).toBe(
    project.document.name,
  );
  expect(store.canUndo(project.id)).toBe(false);
});

it("builds read-only controls for a viewer and editable controls for an editor", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [owner, editor, viewer] = store.listProjects();
  expect(createDemoControls(store, owner, () => {}).readOnly).toBe(false);
  expect(createDemoControls(store, editor, () => {}).readOnly).toBe(false);
  expect(createDemoControls(store, viewer, () => {}).readOnly).toBe(true);
});

it("routes onChange through the store so the document is saved", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const controls = createDemoControls(store, project, () => {});
  controls.onChange({ ...project.document, name: "Via controls" });
  expect(store.getProject(project.id)!.document.name).toBe("Via controls");
});

it("resolves requestAiProposal with a not-yet-available response in this slice", async () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const controls = createDemoControls(store, project, () => {});
  const response = await controls.requestAiProposal(project.id, "test");
  expect(response.ok).toBe(false);
});

it("saves a new baseline model for a project", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const newBaseline = { ...project.document.baseline, factors: [] };
  store.saveBaseline(project.id, newBaseline);
  expect(store.getProject(project.id)!.document.baseline).toEqual(
    newBaseline,
  );
});

it("appends a scenario and a run without disturbing existing entries", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const scenario = {
    id: "scenario-1",
    name: "Test scenario",
    model: project.document.model,
    initial: {},
    clamped: {},
  };
  const run = {
    id: "run-1",
    createdAt: new Date().toISOString(),
    snapshot: project.document.model,
    initial: {},
    clamped: {},
    result: {
      states: [[0, 0]],
      factorIds: [`${project.id}-f1`, `${project.id}-f2`],
      iterations: 1,
      converged: true,
      algorithm: "kosko",
      settings: { slope: 1, tolerance: 0.001, stableSteps: 3, maxIterations: 50 },
    },
  };

  store.saveScenario(project.id, scenario);
  store.saveRun(project.id, run);

  const reloaded = store.getProject(project.id)!;
  expect(reloaded.document.scenarios).toEqual([scenario]);
  expect(reloaded.document.runs).toEqual([run]);
});

it("silently no-ops change, undo, saveBaseline, saveScenario and saveRun for an unknown project id", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const unknownId = "does-not-exist";

  expect(() =>
    store.change(unknownId, {
      version: 1,
      id: unknownId,
      name: "x",
      agenda: "x",
      revision: 0,
      model: { factors: [], relationships: [] },
      baseline: { factors: [], relationships: [] },
      scenarios: [],
      runs: [],
    }),
  ).not.toThrow();
  expect(() => store.undo(unknownId)).not.toThrow();
  expect(() =>
    store.saveBaseline(unknownId, { factors: [], relationships: [] }),
  ).not.toThrow();
  expect(() =>
    store.saveScenario(unknownId, {
      id: "s",
      name: "s",
      model: { factors: [], relationships: [] },
      initial: {},
      clamped: {},
    }),
  ).not.toThrow();
  expect(() =>
    store.saveRun(unknownId, {
      id: "r",
      createdAt: new Date().toISOString(),
      snapshot: { factors: [], relationships: [] },
      initial: {},
      clamped: {},
      result: {
        states: [],
        factorIds: [],
        iterations: 0,
        converged: false,
        algorithm: "kosko",
        settings: { slope: 1, tolerance: 0.001, stableSteps: 3, maxIterations: 50 },
      },
    }),
  ).not.toThrow();
  expect(store.getProject(unknownId)).toBeUndefined();
  expect(store.canUndo(unknownId)).toBe(false);
});

it("keeps only a single level of undo history across consecutive edits", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const original = project.document.name;

  store.change(project.id, { ...project.document, name: "First edit" });
  store.change(project.id, {
    ...store.getProject(project.id)!.document,
    name: "Second edit",
  });

  // Only the state immediately before the last change is recoverable.
  store.undo(project.id);
  expect(store.getProject(project.id)!.document.name).toBe("First edit");
  expect(store.getProject(project.id)!.document.name).not.toBe(original);
  expect(store.canUndo(project.id)).toBe(false);
});

it("routes onSaveBaseline, onSaveScenario, onSaveRun and onUndo through the store", async () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const controls = createDemoControls(store, project, () => {});

  const newBaseline = { ...project.document.baseline, factors: [] };
  await controls.onSaveBaseline(newBaseline);
  expect(store.getProject(project.id)!.document.baseline).toEqual(
    newBaseline,
  );

  const scenario = {
    id: "scenario-ctrl",
    name: "Via controls",
    model: project.document.model,
    initial: {},
    clamped: {},
  };
  await controls.onSaveScenario(scenario);
  expect(store.getProject(project.id)!.document.scenarios).toEqual([
    scenario,
  ]);

  const run = {
    id: "run-ctrl",
    createdAt: new Date().toISOString(),
    snapshot: project.document.model,
    initial: {},
    clamped: {},
    result: {
      states: [[0]],
      factorIds: [],
      iterations: 1,
      converged: true,
      algorithm: "kosko",
      settings: { slope: 1, tolerance: 0.001, stableSteps: 3, maxIterations: 50 },
    },
  };
  await controls.onSaveRun(run);
  expect(store.getProject(project.id)!.document.runs).toEqual([run]);

  controls.onChange({ ...project.document, name: "Before undo" });
  const controlsAfterChange = createDemoControls(store, project, () => {});
  expect(controlsAfterChange.canUndo).toBe(true);
  controlsAfterChange.onUndo();
  expect(store.getProject(project.id)!.document.name).not.toBe(
    "Before undo",
  );
});

it("returns undefined for getProject with an unknown id, and mutating a listed project does not affect the store", () => {
  const store = new DemoCloudStore();
  store.signIn();
  expect(store.getProject("does-not-exist")).toBeUndefined();

  const [project] = store.listProjects();
  project.document.name = "Mutated locally only";
  expect(store.getProject(project.id)!.document.name).not.toBe(
    "Mutated locally only",
  );
});
