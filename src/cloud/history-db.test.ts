import { afterEach, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  asUser,
  fixture,
  invitee,
  owner,
  outsider,
  testDatabase,
} from "./testDatabase";

let db: PGlite;
afterEach(async () => db?.close());
test("baseline, scenarios and runs are immutable attributed project records", async () => {
  db = await testDatabase();
  await asUser(db, owner);
  const id = (
    await db.query<{ id: string }>(
      "select id from public.create_project($1::jsonb)",
      [JSON.stringify(fixture())],
    )
  ).rows[0].id;
  const scenario = {
    id: "s1",
    name: "Access scenario",
    model: fixture().model,
    initial: { a: 0.2 },
    clamped: {},
  };
  const run = {
    id: "r1",
    createdAt: "2026-09-06T00:00:00.000Z",
    snapshot: fixture().model,
    initial: { a: 0.2 },
    clamped: {},
    result: {
      algorithm: "modified-kosko-sigmoid-v1",
      converged: true,
      iterations: 1,
      factorIds: ["a"],
      states: [[0.2], [0.5]],
      settings: {
        slope: 1,
        tolerance: 0.0001,
        stableSteps: 5,
        maxIterations: 100,
      },
    },
  };
  await db.query("select public.save_project_baseline($1,$2::jsonb)", [
    id,
    JSON.stringify(fixture().model),
  ]);
  await expect(
    db.query("select public.save_project_baseline($1,$2::jsonb)", [
      id,
      JSON.stringify(fixture().model),
    ]),
  ).rejects.toThrow();
  await db.query("select public.save_project_scenario($1,$2::jsonb,0)", [
    id,
    JSON.stringify(scenario),
  ]);
  await db.query("select public.save_project_scenario($1,$2::jsonb,0)", [
    id,
    JSON.stringify({ ...scenario, id: "s2" }),
  ]);
  await db.query("select public.save_project_run($1,$2::jsonb,0)", [
    id,
    JSON.stringify(run),
  ]);
  await db.query("select public.save_project_run($1,$2::jsonb,0)", [
    id,
    JSON.stringify({ ...run, id: "r2" }),
  ]);
  expect(
    (await db.query("select actor_id from public.project_scenarios")).rows,
  ).toEqual([{ actor_id: owner }, { actor_id: owner }]);
  await db.exec("reset role");
  await db.query(
    "insert into public.project_members(project_id,user_id,role) values($1,$2,'editor')",
    [id, invitee],
  );
  await asUser(db, invitee);
  await db.query("select public.save_project_run($1,$2::jsonb,0)", [
    id,
    JSON.stringify({ ...run, id: "r3" }),
  ]);
  expect(
    (
      await db.query<{ actor_id: string }>(
        "select actor_id from public.project_runs where id='r3'",
      )
    ).rows[0].actor_id,
  ).toBe(invitee);
  await db.exec("reset role");
  await db.query(
    "insert into public.project_members(project_id,user_id,role) values($1,$2,'viewer')",
    [id, outsider],
  );
  await asUser(db, outsider);
  expect(
    (
      await db.query("select id from public.project_runs where project_id=$1", [
        id,
      ])
    ).rows,
  ).toHaveLength(3);
  await expect(
    db.query(
      "update public.project_baselines set model='{}'::jsonb where project_id=$1",
      [id],
    ),
  ).rejects.toThrow();
  await expect(
    db.query("delete from public.project_scenarios where project_id=$1", [id]),
  ).rejects.toThrow();
  await expect(
    db.query("delete from public.project_runs where project_id=$1", [id]),
  ).rejects.toThrow();
  await expect(
    db.query("select public.save_project_run($1,$2::jsonb,0)", [
      id,
      JSON.stringify({ ...run, id: "r3" }),
    ]),
  ).rejects.toThrow(/permission denied/);
}, 30000);
test("history rejects stale revisions and malformed nested research", async () => {
  db = await testDatabase();
  await asUser(db, owner);
  const id = (
    await db.query<{ id: string }>(
      "select id from public.create_project($1::jsonb)",
      [JSON.stringify(fixture())],
    )
  ).rows[0].id;
  await expect(
    db.query("select public.save_project_baseline($1,$2::jsonb)", [
      id,
      JSON.stringify({ factors: [], relationships: [] }),
    ]),
  ).rejects.toThrow(/match the current project model/);
  await expect(
    db.query("select public.save_project_scenario($1,$2::jsonb,1)", [
      id,
      JSON.stringify({
        id: "s",
        name: "Bad",
        model: fixture().model,
        initial: { missing: 1 },
        clamped: {},
      }),
    ]),
  ).rejects.toThrow(/revision conflict/);
  await expect(
    db.query("select public.save_project_scenario($1,$2::jsonb,0)", [
      id,
      JSON.stringify({
        id: "s",
        name: "Bad",
        model: fixture().model,
        initial: { missing: 1 },
        clamped: {},
      }),
    ]),
  ).rejects.toThrow(/Invalid activation/);
  expect(
    (await db.query("select id from public.project_scenarios")).rows,
  ).toHaveLength(0);
  await db.exec("reset role");
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    owner,
  ]);
  await asUser(db, owner);
  await expect(
    db.query("select public.save_project_baseline($1,$2::jsonb)", [
      id,
      JSON.stringify(fixture().model),
    ]),
  ).rejects.toThrow(/permission denied/);
}, 30000);
