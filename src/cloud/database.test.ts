import { afterEach, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, fixture, owner, outsider, testDatabase } from "./testDatabase";
let db: PGlite;
afterEach(async () => {
  await db?.close();
});
test("verified owner creates a private project and reads its membership atomically", async () => {
  db = await testDatabase();
  await asUser(db, owner);
  const result = await db.query<{
    id: string;
    document: { id: string; revision: number };
    created_by: string;
  }>("select * from public.create_project($1::jsonb)", [
    JSON.stringify(fixture()),
  ]);
  expect(result.rows[0].id).not.toBe("local-id");
  expect(result.rows[0].document.id).toBe(result.rows[0].id);
  expect(result.rows[0].document.revision).toBe(0);
  expect(result.rows[0].created_by).toBe(owner);
  expect((await db.query("select * from public.projects")).rows).toHaveLength(
    1,
  );
  expect(
    (await db.query("select role from public.project_members")).rows,
  ).toEqual([{ role: "owner" }]);
}, 30000);
test("malformed portable documents are rejected without partial writes", async () => {
  db = await testDatabase();
  await asUser(db, owner);
  const bad = fixture();
  bad.model.factors[0].color = "invalid";
  await expect(
    db.query("select * from public.create_project($1::jsonb)", [
      JSON.stringify(bad),
    ]),
  ).rejects.toThrow();
  expect((await db.query("select * from public.projects")).rows).toHaveLength(
    0,
  );
  expect(
    (await db.query("select * from public.project_members")).rows,
  ).toHaveLength(0);
}, 30000);
test("portable validation enforces types, references, limits and nested snapshots", async () => {
  db = await testDatabase();
  await asUser(db, owner);
  const invalid: unknown[] = [
    null,
    {},
    { ...fixture(), version: 2 },
    { ...fixture(), revision: -1 },
    { ...fixture(), name: 5 },
    { ...fixture(), scenarios: [{}] },
    { ...fixture(), runs: [{}] },
    { ...fixture(), baseline: null },
    {
      ...fixture(),
      model: {
        factors: [{ ...fixture().model.factors[0], id: "__proto__" }],
        relationships: [],
      },
    },
    {
      ...fixture(),
      model: {
        factors: fixture().model.factors,
        relationships: [
          { source: "a", target: "missing", weight: 0.5, provenance: "human" },
        ],
      },
    },
  ];
  for (const value of invalid)
    await expect(
      db.query("select * from public.create_project($1::jsonb)", [
        JSON.stringify(value),
      ]),
    ).rejects.toThrow();
  expect((await db.query("select * from public.projects")).rows).toHaveLength(
    0,
  );
}, 30000);

test("RLS isolates two users and prevents browser membership escalation", async () => {
  db = await testDatabase();
  await asUser(db, owner);
  const { rows } = await db.query<{ id: string }>(
    "select id from public.create_project($1::jsonb)",
    [JSON.stringify(fixture())],
  );
  const id = rows[0].id;
  await asUser(db, outsider);
  expect(
    (await db.query("select * from public.projects where id=$1", [id])).rows,
  ).toEqual([]);
  expect((await db.query("select * from public.project_members")).rows).toEqual(
    [],
  );
  await expect(
    db.query("insert into public.project_members values($1,$2,'owner')", [
      id,
      outsider,
    ]),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.query(
      "update public.project_members set role='owner' where project_id=$1",
      [id],
    ),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.query("delete from public.projects where id=$1", [id]),
  ).rejects.toThrow(/permission denied/);
  await asUser(db, null);
  await expect(db.query("select * from public.projects")).rejects.toThrow(
    /permission denied/,
  );
  await expect(
    db.query("select * from public.project_members"),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.query("select * from public.create_project($1::jsonb)", [
      JSON.stringify(fixture()),
    ]),
  ).rejects.toThrow(/permission denied/);
  await asUser(db, owner);
  expect((await db.query("select * from public.projects")).rows).toHaveLength(
    1,
  );
}, 30000);
test("relationship endpoint IDs must be strings, not coerced numbers", async () => {
  db = await testDatabase();
  await asUser(db, owner);
  const d = fixture();
  d.model.factors[0].id = "1";
  const bad = {
    ...d,
    model: {
      ...d.model,
      relationships: [
        { source: 1, target: "1", weight: 0.3, provenance: "human" },
      ],
    },
  };
  await expect(
    db.query("select * from public.create_project($1::jsonb)", [
      JSON.stringify(bad),
    ]),
  ).rejects.toThrow();
}, 30000);
test("unverified users and a missing subject cannot create projects", async () => {
  db = await testDatabase();
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    outsider,
  ]);
  await asUser(db, outsider);
  await expect(
    db.query("select * from public.create_project($1::jsonb)", [
      JSON.stringify(fixture()),
    ]),
  ).rejects.toThrow(/Verified authentication/);
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await expect(
    db.query("select * from public.create_project($1::jsonb)", [
      JSON.stringify(fixture()),
    ]),
  ).rejects.toThrow(/Verified authentication/);
}, 30000);
test("import retains baseline, scenarios and reproducible runs while rejecting corrupted nested data", async () => {
  db = await testDatabase();
  await asUser(db, owner);
  const base = fixture();
  const run = {
    id: "run-a",
    createdAt: "2026-09-06T00:00:00.000Z",
    snapshot: base.model,
    initial: { a: 0.5 },
    clamped: {},
    result: {
      algorithm: "modified-kosko-sigmoid-v1",
      converged: false,
      iterations: 1,
      factorIds: ["a"],
      states: [[0.5], [0.6]],
      settings: {
        slope: 1,
        tolerance: 0.0001,
        stableSteps: 5,
        maxIterations: 100,
      },
    },
  };
  const document = {
    ...base,
    scenarios: [
      {
        id: "scenario-a",
        name: "Intervention",
        model: base.model,
        initial: { a: 0.3 },
        clamped: { a: 0.8 },
      },
    ],
    runs: [run],
    created_by: outsider,
    members: [{ user_id: outsider, role: "owner" }],
  };
  const { rows } = await db.query<{
    document: typeof document;
    created_by: string;
  }>("select * from public.create_project($1::jsonb)", [
    JSON.stringify(document),
  ]);
  expect(rows[0].document.baseline).toEqual(document.baseline);
  expect(rows[0].document.scenarios).toEqual(document.scenarios);
  expect(rows[0].document.runs).toEqual(document.runs);
  expect(rows[0].created_by).toBe(owner);
  expect(
    (await db.query("select user_id,role from public.project_members")).rows,
  ).toEqual([{ user_id: owner, role: "owner" }]);
  const corruptions: unknown[] = [
    {
      ...document,
      runs: [{ ...run, result: { ...run.result, factorIds: ["missing"] } }],
    },
    {
      ...document,
      runs: [{ ...run, result: { ...run.result, states: [[0.5], [2]] } }],
    },
    { ...document, runs: [{ ...run, initial: { missing: 0.3 } }] },
    {
      ...document,
      runs: [
        {
          ...run,
          result: {
            ...run.result,
            settings: { ...run.result.settings, slope: 0 },
          },
        },
      ],
    },
    { ...document, runs: [run, run] },
    { ...document, scenarios: [document.scenarios[0], document.scenarios[0]] },
    {
      ...document,
      scenarios: [{ ...document.scenarios[0], clamped: { a: null } }],
    },
    {
      ...document,
      model: {
        ...base.model,
        factors: [base.model.factors[0], base.model.factors[0]],
      },
    },
    {
      ...document,
      model: { ...base.model, factors: [{ ...base.model.factors[0], x: "0" }] },
    },
    {
      ...document,
      model: {
        ...base.model,
        relationships: [
          { source: "a", target: "a", weight: 0, provenance: "human" },
        ],
      },
    },
    {
      ...document,
      model: {
        ...base.model,
        relationships: [
          { source: "a", target: "a", weight: 1.1, provenance: "human" },
        ],
      },
    },
  ];
  for (const value of corruptions)
    await expect(
      db.query("select * from public.create_project($1::jsonb)", [
        JSON.stringify(value),
      ]),
    ).rejects.toThrow();
}, 30000);
