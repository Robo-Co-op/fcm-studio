import { expect, it, vi } from "vitest";
import type { Factor } from "../model";
import {
  DemoCloudStore,
  MAX_AGENDA,
  MAX_NAME,
  createDemoControls,
  createDemoInvite,
  generateDemoProposal,
  requestDemoAiProposal,
} from "./demo-store";

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

it("resolves requestAiProposal with a mock proposal built from the instruction", async () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const controls = createDemoControls(store, project, () => {});
  const response = await controls.requestAiProposal(
    project.id,
    "grow volunteer turnout",
  );
  expect(response.ok).toBe(true);
  const data = (await response.json()) as {
    model: { factors: unknown[] };
    summary: string;
  };
  expect(data.model.factors.length).toBe(
    project.document.model.factors.length + 1,
  );
  expect(data.summary).toMatch(/volunteer turnout/i);
});

it("resolves requestAiProposal with a 404-style error for an unknown project id", async () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const controls = createDemoControls(store, project, () => {});
  const response = await controls.requestAiProposal("does-not-exist", "test");
  expect(response.ok).toBe(false);
});

it("saves a new baseline model for a project", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const newBaseline = { ...project.document.baseline, factors: [] };
  store.saveBaseline(project.id, newBaseline);
  expect(store.getProject(project.id)!.document.baseline).toEqual(newBaseline);
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
      settings: {
        slope: 1,
        tolerance: 0.001,
        stableSteps: 3,
        maxIterations: 50,
      },
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
        settings: {
          slope: 1,
          tolerance: 0.001,
          stableSteps: 3,
          maxIterations: 50,
        },
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
  expect(store.getProject(project.id)!.document.baseline).toEqual(newBaseline);

  const scenario = {
    id: "scenario-ctrl",
    name: "Via controls",
    model: project.document.model,
    initial: {},
    clamped: {},
  };
  await controls.onSaveScenario(scenario);
  expect(store.getProject(project.id)!.document.scenarios).toEqual([scenario]);

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
      settings: {
        slope: 1,
        tolerance: 0.001,
        stableSteps: 3,
        maxIterations: 50,
      },
    },
  };
  await controls.onSaveRun(run);
  expect(store.getProject(project.id)!.document.runs).toEqual([run]);

  controls.onChange({ ...project.document, name: "Before undo" });
  const controlsAfterChange = createDemoControls(store, project, () => {});
  expect(controlsAfterChange.canUndo).toBe(true);
  controlsAfterChange.onUndo();
  expect(store.getProject(project.id)!.document.name).not.toBe("Before undo");
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

it("switches a demo project's role so the demo can preview each permission level", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  expect(project.role).toBe("owner");
  store.setRole(project.id, "viewer");
  expect(store.getProject(project.id)!.role).toBe("viewer");
});

it("creates a demo invite link bound to a role, with a fresh token each time", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const first = createDemoInvite(project, "editor");
  const second = createDemoInvite(project, "editor");
  expect(first.role).toBe("editor");
  expect(first.url).toContain("editor");
  expect(first.url).not.toBe(second.url);
});

it("generates a mock AI proposal that adds a factor derived from the instruction and summarizes the change", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const proposal = generateDemoProposal(
    project.document,
    "Add a factor for volunteer turnout",
  );
  expect(proposal.model.factors.length).toBe(
    project.document.model.factors.length + 1,
  );
  expect(proposal.summary.length).toBeGreaterThan(0);
  expect(proposal.summary).toMatch(/volunteer turnout/i);
});

it("falls back to a generic proposal summary when the instruction is blank", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const proposal = generateDemoProposal(project.document, "");
  expect(proposal.model.factors.length).toBe(
    project.document.model.factors.length + 1,
  );
  expect(proposal.summary.length).toBeGreaterThan(0);
});

it("uses the real /api/demo-draft response when it succeeds", async () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const fetchImpl = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        revision: 9,
        model: project.document.model,
        summary: "From OpenRouter",
      }),
      { status: 200 },
    ),
  );
  const result = await requestDemoAiProposal(
    project.document,
    "test",
    fetchImpl,
  );
  expect(result.summary).toBe("From OpenRouter");
  expect(result.revision).toBe(9);
  expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("/api/demo-draft");
});

it("falls back to the local mock when /api/demo-draft is unreachable", async () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
  const result = await requestDemoAiProposal(
    project.document,
    "grow volunteer turnout",
    fetchImpl,
  );
  expect(result.summary).toMatch(/volunteer turnout/i);
});

it("falls back to the local mock when /api/demo-draft responds with an error status", async () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const fetchImpl = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: "not configured" }), {
      status: 503,
    }),
  );
  const result = await requestDemoAiProposal(
    project.document,
    "grow volunteer turnout",
    fetchImpl,
  );
  expect(result.summary).toMatch(/volunteer turnout/i);
});

it("does nothing when setRole is called with an unknown project id", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  expect(() => store.setRole("does-not-exist", "viewer")).not.toThrow();
  expect(store.getProject(project.id)!.role).toBe(project.role);
});

it("adds no relationship when generating a proposal for a model with no existing factors", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const emptyDocument = {
    ...project.document,
    model: { factors: [], relationships: [] },
  };
  const proposal = generateDemoProposal(emptyDocument, "seed factor");
  expect(proposal.model.factors.length).toBe(1);
  expect(proposal.model.relationships.length).toBe(0);
});

it("truncates the generated factor label to 60 characters for a long instruction", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const longInstruction =
    "This is a very long free-text instruction that goes well past the sixty character label limit for a generated demo factor";
  const proposal = generateDemoProposal(project.document, longInstruction);
  const newFactor = proposal.model.factors[proposal.model.factors.length - 1];
  expect(newFactor.label.length).toBe(60);
  expect(newFactor.label.endsWith("...")).toBe(true);
});

it("does not truncate a factor label that is exactly 60 characters", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const exactInstruction = "a".repeat(60);
  const proposal = generateDemoProposal(project.document, exactInstruction);
  const newFactor = proposal.model.factors[proposal.model.factors.length - 1];
  expect(newFactor.label).toBe(exactInstruction);
  expect(newFactor.label.endsWith("...")).toBe(false);
});

it("treats a whitespace-only instruction the same as a blank one", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const proposal = generateDemoProposal(project.document, "   ");
  const newFactor = proposal.model.factors[proposal.model.factors.length - 1];
  expect(newFactor.label).toBe("Participant engagement");
});

it("encodes special characters in the project id when building an invite url", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const [project] = store.listProjects();
  const withSpecialId = { ...project, id: "project #1 & co" };
  const invite = createDemoInvite(withSpecialId, "viewer");
  expect(invite.url).toContain(encodeURIComponent("project #1 & co"));
  expect(invite.url).not.toContain("project #1 & co");
});

it("creates an empty owner project at the top of the list", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const created = store.createProject({
    name: "  River basin map ",
    agenda: "What drives flooding?",
  });
  const projects = store.listProjects();
  expect(projects).toHaveLength(4);
  expect(projects[0]).toEqual(created);
  expect(created.role).toBe("owner");
  expect(created.document.name).toBe("River basin map");
  expect(created.document.agenda).toBe("What drives flooding?");
  expect(created.document.model).toEqual({ factors: [], relationships: [] });
  expect(store.getProject(created.id)?.document.id).toBe(created.id);
});

it("rejects a blank or overlong project name without adding a project", () => {
  const store = new DemoCloudStore();
  store.signIn();
  expect(() => store.createProject({ name: "   ", agenda: "" })).toThrow(
    /name/i,
  );
  expect(() =>
    store.createProject({ name: "x".repeat(MAX_NAME + 1), agenda: "" }),
  ).toThrow(String(MAX_NAME));
  expect(() =>
    store.createProject({ name: "ok", agenda: "x".repeat(MAX_AGENDA + 1) }),
  ).toThrow(/agenda/i);
  expect(store.listProjects()).toHaveLength(3);
});

it("accepts a name and agenda exactly at their limits, trimming the name first", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const created = store.createProject({
    name: ` ${"x".repeat(MAX_NAME)} `,
    agenda: "y".repeat(MAX_AGENDA),
  });
  expect(created.document.name).toHaveLength(MAX_NAME);
  expect(created.document.agenda).toHaveLength(MAX_AGENDA);
});

it("returns a copy, so mutating it does not change the stored project", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const created = store.createProject({ name: "Isolated", agenda: "" });
  created.document.name = "changed";
  created.document.model.factors.push({ ...factor("x"), id: "x" });
  const stored = store.getProject(created.id)!.document;
  expect(stored.name).toBe("Isolated");
  expect(stored.model.factors).toEqual([]);
});

it("edits and undoes a new project without touching its baseline", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const created = store.createProject({ name: "Editable", agenda: "" });
  expect(store.canUndo(created.id)).toBe(false);
  store.change(created.id, {
    ...created.document,
    model: { factors: [factor("a")], relationships: [] },
  });
  const edited = store.getProject(created.id)!.document;
  expect(edited.model.factors).toHaveLength(1);
  expect(edited.baseline.factors).toEqual([]);
  store.undo(created.id);
  expect(store.getProject(created.id)!.document.model.factors).toEqual([]);
});

function factor(id: string): Factor {
  return { id, label: id, color: "#dbe7f4", x: 0, y: 0, provenance: "human" };
}

it("refuses to create a project while signed out", () => {
  const store = new DemoCloudStore();
  expect(() => store.createProject({ name: "Map", agenda: "" })).toThrow(
    /sign in/i,
  );
});

it("creates a project from an imported model with an independent baseline", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const model = {
    factors: [factor("a"), factor("b")],
    relationships: [
      {
        source: "a",
        target: "b",
        weight: 0.7,
        provenance: "imported" as const,
      },
    ],
  };
  const created = store.createProject({ name: "Imported", agenda: "Q", model });
  expect(created.document.model).toEqual(model);
  expect(created.document.baseline).toEqual(model);
  model.factors.push(factor("c"));
  expect(store.getProject(created.id)!.document.model.factors).toHaveLength(2);
});

it("rejects an invalid imported model without adding a project", () => {
  const store = new DemoCloudStore();
  store.signIn();
  const broken = {
    factors: [factor("a")],
    relationships: [
      {
        source: "a",
        target: "missing",
        weight: 2,
        provenance: "imported" as const,
      },
    ],
  };
  expect(() =>
    store.createProject({ name: "Broken", agenda: "", model: broken }),
  ).toThrow();
  expect(store.listProjects()).toHaveLength(3);
});
