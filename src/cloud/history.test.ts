import { createClient } from "@supabase/supabase-js";
import { expect, test, vi } from "vitest";
import {
  saveProjectBaseline,
  saveProjectRun,
  saveProjectScenario,
} from "./history";
import { fixture } from "./testDatabase";

test("history writes use dedicated checked RPCs and the current revision", async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    return new Response("null", {
      headers: { "Content-Type": "application/json" },
      status: init?.method === "POST" ? 200 : 404,
    });
  });
  const client = createClient(
    "https://example.supabase.co",
    "public-test-key",
    {
      global: { fetch },
      auth: { persistSession: false },
    },
  );
  const project = fixture();
  const scenario = {
    id: "scenario-a",
    name: "Access scenario",
    model: project.model,
    initial: { a: 0.2 },
    clamped: {},
  };
  const run = {
    id: "run-a",
    createdAt: "2026-09-07T00:00:00.000Z",
    snapshot: project.model,
    initial: { a: 0.2 },
    clamped: {},
    result: {
      states: [[0.2]],
      factorIds: ["a"],
      iterations: 0,
      converged: true,
      algorithm: "modified-kosko-sigmoid-v1",
      settings: {
        slope: 1,
        tolerance: 0.0001,
        stableSteps: 5,
        maxIterations: 100,
      },
    },
  };
  await saveProjectBaseline(client, project.id, project.model);
  await saveProjectScenario(client, project.id, scenario, 7);
  await saveProjectRun(client, project.id, run, 7);
  const calls = fetch.mock.calls.map(([input, init]) => ({
    url: String(input),
    body: JSON.parse(String(init?.body)),
  }));
  expect(calls.map(({ url }) => url)).toEqual([
    expect.stringContaining("/rpc/save_project_baseline"),
    expect.stringContaining("/rpc/save_project_scenario"),
    expect.stringContaining("/rpc/save_project_run"),
  ]);
  expect(calls[1]?.body.p_expected_revision).toBe(7);
  expect(calls[2]?.body.p_expected_revision).toBe(7);
});
