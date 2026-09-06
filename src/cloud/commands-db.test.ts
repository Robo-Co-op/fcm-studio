import { afterEach, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, fixture, owner, outsider, testDatabase } from "./testDatabase";
let db: PGlite;
afterEach(async () => {
  await db?.close();
});
async function setup() {
  db = await testDatabase();
  await asUser(db, owner);
  return (
    await db.query<{ id: string }>(
      "select id from public.create_project($1::jsonb)",
      [JSON.stringify(fixture())],
    )
  ).rows[0].id;
}
async function apply(
  id: string,
  revision: number,
  command: unknown,
  operation = crypto.randomUUID(),
) {
  return (
    await db.query<{ revision: number; document: ReturnType<typeof fixture> }>(
      "select * from public.apply_project_command($1,$2,$3,$4::jsonb)",
      [id, operation, revision, JSON.stringify(command)],
    )
  ).rows[0];
}
test("owner commits a model command and increments authoritative revision", async () => {
  const id = await setup();
  const model = fixture().model;
  model.factors[0].label = "Changed";
  const row = await apply(id, 0, { type: "replace_model", model });
  expect(Number(row.revision)).toBe(1);
  expect(row.document.revision).toBe(1);
  expect(row.document.model).toEqual(model);
  expect(row.document.baseline).toEqual(fixture().baseline);
}, 30000);
test("viewer, outsider and revoked members cannot execute project commands", async () => {
  const id = await setup();
  await db.exec("reset role");
  await db.query(
    "insert into public.project_members(project_id,user_id,role) values($1,$2,'viewer')",
    [id, outsider],
  );
  await asUser(db, outsider);
  expect(
    (await db.query("select id from public.projects where id=$1", [id])).rows,
  ).toHaveLength(1);
  await expect(
    apply(id, 0, { type: "set_details", name: "No", agenda: "No" }),
  ).rejects.toThrow(/permission denied/);
  await db.exec("reset role");
  await db.query(
    "delete from public.project_members where project_id=$1 and user_id=$2",
    [id, outsider],
  );
  await asUser(db, outsider);
  expect(
    (await db.query("select id from public.projects where id=$1", [id])).rows,
  ).toHaveLength(0);
  await expect(
    apply(id, 0, { type: "set_details", name: "No", agenda: "No" }),
  ).rejects.toThrow(/permission denied/);
}, 30000);
test("invalid replacement models are rejected atomically", async () => {
  const id = await setup();
  const model = fixture().model;
  model.relationships.push({
    source: "a",
    target: "missing",
    weight: 0.5,
    provenance: "human",
  });
  await expect(apply(id, 0, { type: "replace_model", model })).rejects.toThrow(
    /Invalid relationship/,
  );
  expect(
    Number(
      (
        await db.query<{ revision: number }>(
          "select revision from public.projects where id=$1",
          [id],
        )
      ).rows[0].revision,
    ),
  ).toBe(0);
}, 30000);
test("stale same-factor and different-factor edits never overwrite acknowledged changes", async () => {
  const id = await setup();
  const first = fixture().model;
  first.factors[0].label = "Peer changed";
  await apply(id, 0, { type: "replace_model", model: first });
  const same = fixture().model;
  same.factors[0].label = "My changed";
  await expect(
    apply(id, 0, { type: "replace_model", model: same }),
  ).rejects.toThrow(/revision conflict/);
  const different = fixture().model;
  different.factors.push({
    ...different.factors[0],
    id: "b",
    label: "New factor",
  });
  await expect(
    apply(id, 0, { type: "replace_model", model: different }),
  ).rejects.toThrow(/revision conflict/);
  expect(
    (
      await db.query<{ document: ReturnType<typeof fixture> }>(
        "select document from public.projects where id=$1",
        [id],
      )
    ).rows[0].document.model,
  ).toEqual(first);
}, 30000);
test("identical retry is idempotent even after newer commits; reused IDs reject mismatched payload", async () => {
  const id = await setup();
  const operation = crypto.randomUUID();
  const command = { type: "replace_model", model: fixture().model };
  await apply(id, 0, command, operation);
  const newer = fixture().model;
  newer.factors[0].label = "Newer";
  await apply(id, 1, { type: "replace_model", model: newer });
  const retry = await apply(id, 0, command, operation);
  expect(Number(retry.revision)).toBe(2);
  expect(retry.document.model).toEqual(newer);
  await expect(
    apply(id, 0, { type: "replace_model", model: newer }, operation),
  ).rejects.toThrow(/Operation ID reused/);
  await expect(apply(id, 2, command, operation)).rejects.toThrow(
    /Operation ID reused/,
  );
}, 30000);
test("details command updates indexed metadata while refusing unknown command fields", async () => {
  const id = await setup();
  const row = await apply(id, 0, {
    type: "set_details",
    name: "Workshop",
    agenda: "Explore access",
  });
  expect(row.document.name).toBe("Workshop");
  expect(row.document.agenda).toBe("Explore access");
  expect(
    (
      await db.query("select name,agenda from public.projects where id=$1", [
        id,
      ])
    ).rows[0],
  ).toEqual({ name: "Workshop", agenda: "Explore access" });
  for (const command of [
    {
      type: "replace_model",
      model: fixture().model,
      baseline: fixture().model,
    },
    { type: "set_details", name: "Name", agenda: "Agenda", owner: outsider },
    { type: "unknown", model: fixture().model },
  ])
    await expect(apply(id, 1, command)).rejects.toThrow(/Invalid command/);
}, 30000);
test("operation receipts are bounded while successful retries remain available at capacity", async () => {
  const id = await setup();
  const operation = crypto.randomUUID();
  const command = { type: "replace_model", model: fixture().model };
  await apply(id, 0, command, operation);
  await db.exec("reset role");
  await db.query(
    "insert into public.project_operations(project_id,actor_id,operation_id,expected_revision,fingerprint) select $1,$2,gen_random_uuid(),0,'fixture' from generate_series(1,9999)",
    [id, owner],
  );
  await asUser(db, owner);
  await expect(apply(id, 1, command)).rejects.toThrow(/Operation quota/);
  expect(Number((await apply(id, 0, command, operation)).revision)).toBe(1);
}, 30000);
test("editing enforces the project creator's shared storage quota atomically", async () => {
  const id = await setup();
  await db.exec("reset role");
  await db.query(
    "insert into public.projects(name,agenda,document,created_by) values('Quota fixture','',jsonb_build_object('padding',repeat('x',20971520)),$1)",
    [owner],
  );
  await asUser(db, owner);
  await expect(
    apply(id, 0, { type: "set_details", name: "Changed", agenda: "Changed" }),
  ).rejects.toThrow(/storage quota/);
  expect(
    Number(
      (
        await db.query<{ revision: number }>(
          "select revision from public.projects where id=$1",
          [id],
        )
      ).rows[0].revision,
    ),
  ).toBe(0);
}, 30000);
