import { afterEach, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, fixture, owner, testDatabase } from "./testDatabase";

let db: PGlite;
afterEach(async () => db?.close());

test("command boundary blocks 20 malformed or overreaching payloads and allows research punctuation", async () => {
  db = await testDatabase();
  await asUser(db, owner);
  const id = (
    await db.query<{ id: string }>(
      "select id from public.create_project($1::jsonb)",
      [JSON.stringify(fixture())],
    )
  ).rows[0].id;
  const badModel = fixture().model;
  badModel.relationships.push({
    source: "a",
    target: "missing",
    weight: 0.5,
    provenance: "human",
  });
  const duplicateModel = fixture().model;
  duplicateModel.factors.push({ ...duplicateModel.factors[0], id: "b" });
  const attacks: unknown[] = [
    null,
    [],
    "replace_model",
    1,
    {},
    { type: "replace_model" },
    { type: "replace_model", model: null },
    {
      type: "replace_model",
      model: fixture().model,
      baseline: fixture().model,
    },
    { type: "set_details" },
    { type: "set_details", name: 3, agenda: "x" },
    { type: "set_details", name: "x", agenda: 3 },
    { type: "set_details", name: "\t", agenda: "x" },
    { type: "set_details", name: "x".repeat(16001), agenda: "x" },
    { type: "unknown" },
    { type: "delete_project" },
    { type: "set_role", role: "owner" },
    { type: "replace_model", model: badModel },
    { type: "replace_model", model: duplicateModel },
    { type: "set_details", name: "x", agenda: "x", created_by: owner },
    { type: "set_details", name: "x", agenda: "x", revision: 99 },
  ];
  for (const command of attacks)
    await expect(
      db.query("select public.apply_project_command($1,$2,0,$3::jsonb)", [
        id,
        crypto.randomUUID(),
        JSON.stringify(command),
      ]),
    ).rejects.toThrow();
  const allowed = await db.query<{ name: string }>(
    "select name from public.apply_project_command($1,$2,0,$3::jsonb)",
    [
      id,
      crypto.randomUUID(),
      JSON.stringify({
        type: "set_details",
        name: "Access; equity | care && trust",
        agenda: "Who influences whom?",
      }),
    ],
  );
  expect(allowed.rows[0].name).toBe("Access; equity | care && trust");
}, 30000);
