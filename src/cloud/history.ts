import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateModel,
  validateRun,
  validateScenario,
  type Model,
  type Run,
  type Scenario,
} from "../model";

export interface ProjectHistory {
  baseline: Model | null;
  scenarios: Scenario[];
  runs: Run[];
}

export async function loadProjectHistory(
  client: SupabaseClient,
  projectId: string,
): Promise<ProjectHistory> {
  const [baselineResult, scenarioResult, runResult] = await Promise.all([
    client
      .from("project_baselines")
      .select("model")
      .eq("project_id", projectId)
      .maybeSingle(),
    client
      .from("project_scenarios")
      .select("id,name,model,initial,clamped")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    client
      .from("project_runs")
      .select("run")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
  ]);
  if (baselineResult.error) throw baselineResult.error;
  if (scenarioResult.error) throw scenarioResult.error;
  if (runResult.error) throw runResult.error;

  const baseline = baselineResult.data?.model ?? null;
  if (baseline) validateModel(baseline);
  if (!Array.isArray(scenarioResult.data) || !Array.isArray(runResult.data))
    throw new Error("Invalid shared research history.");
  const scenarios = scenarioResult.data.map((row: unknown) => {
    if (!row || typeof row !== "object")
      throw new Error("Invalid shared scenario history.");
    const value = row as Record<string, unknown>;
    const scenario = {
      id: value.id,
      name: value.name,
      model: value.model,
      initial: value.initial,
      clamped: value.clamped,
    };
    validateScenario(scenario);
    return scenario;
  });
  const runs = runResult.data.map((row: unknown) => {
    if (!row || typeof row !== "object" || !("run" in row))
      throw new Error("Invalid shared run history.");
    const run = (row as { run: unknown }).run;
    validateRun(run);
    return run;
  });
  return { baseline, scenarios, runs };
}

async function save(
  client: SupabaseClient,
  name: string,
  body: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.rpc(name, body);
  if (error) throw error;
}

export const saveProjectBaseline = (
  client: SupabaseClient,
  projectId: string,
  model: Model,
) =>
  save(client, "save_project_baseline", {
    p_project_id: projectId,
    p_model: model,
  });

export const saveProjectScenario = (
  client: SupabaseClient,
  projectId: string,
  scenario: Scenario,
  revision: number,
) =>
  save(client, "save_project_scenario", {
    p_project_id: projectId,
    p_scenario: scenario,
    p_expected_revision: revision,
  });

export const saveProjectRun = (
  client: SupabaseClient,
  projectId: string,
  run: Run,
  revision: number,
) =>
  save(client, "save_project_run", {
    p_project_id: projectId,
    p_run: run,
    p_expected_revision: revision,
  });
