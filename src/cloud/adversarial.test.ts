import { afterAll, beforeAll, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { validateProject } from "../model";
import { createProjectRepository } from "./repository";
import { asUser, fixture, owner, outsider, testDatabase } from "./testDatabase";

let db: PGlite;
let projectId: string;

test("BLOCK server row/document revision mismatch before using an imported snapshot", async () => {
  const document = fixture();
  const client = createClient(
    "https://example.supabase.co",
    "public-test-key",
    {
      auth: { persistSession: false },
      global: {
        fetch: async () =>
          new Response(
            JSON.stringify({
              id: document.id,
              document,
              revision: document.revision + 1,
              project_members: [{ role: "owner" }],
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
      },
    },
  );
  await expect(
    createProjectRepository(client, owner).load(document.id),
  ).rejects.toThrow();
});
beforeAll(async () => {
  db = await testDatabase();
  await asUser(db, owner);
  const result = await db.query<{ id: string }>(
    "select id from public.create_project($1::jsonb)",
    [JSON.stringify(fixture())],
  );
  projectId = result.rows[0].id;
}, 30000);
afterAll(async () => {
  await db?.close();
});

const factor = fixture().model.factors[0];
const modelDocument = (factors: unknown[], relationships: unknown[] = []) => ({
  ...fixture(),
  model: { factors, relationships },
});
const edge = { source: "a", target: "a", weight: 0.5, provenance: "human" };
const malformed: [string, unknown][] = [
  ["null document", null],
  ["array document", []],
  ["string version", { ...fixture(), version: "1" }],
  ["fractional revision", { ...fixture(), revision: 0.5 }],
  ["unsafe integer revision", { ...fixture(), revision: 9007199254740992 }],
  ["prototype identifier", modelDocument([{ ...factor, id: "constructor" }])],
  ["object identifier", modelDocument([{ ...factor, id: {} }])],
  ["tab-only label", modelDocument([{ ...factor, label: "\t\n" }])],
  [
    "duplicate label casing",
    modelDocument([factor, { ...factor, id: "b", label: "ACCESS" }]),
  ],
  [
    "duplicate label unicode whitespace",
    modelDocument([
      factor,
      { ...factor, id: "b", label: "\u00a0Access\u00a0" },
    ]),
  ],
  [
    "label exceeds UTF-16 limit",
    modelDocument([{ ...factor, label: "🌱".repeat(151) }]),
  ],
  ["numeric coordinate string", modelDocument([{ ...factor, x: "0" }])],
  ["null coordinate", modelDocument([{ ...factor, y: null }])],
  ["numeric description", modelDocument([{ ...factor, description: 12 }])],
  ["unknown provenance", modelDocument([{ ...factor, provenance: "owner" }])],
  [
    "missing edge target",
    modelDocument([factor], [{ ...edge, target: "missing" }]),
  ],
  ["zero edge", modelDocument([factor], [{ ...edge, weight: 0 }])],
  [
    "too positive edge",
    modelDocument([factor], [{ ...edge, weight: 1.00001 }]),
  ],
  [
    "too negative edge",
    modelDocument([factor], [{ ...edge, weight: -1.00001 }]),
  ],
  ["string edge weight", modelDocument([factor], [{ ...edge, weight: "0.5" }])],
  ["duplicate directed edge", modelDocument([factor], [edge, edge])],
  ["null baseline", { ...fixture(), baseline: null }],
  [
    "missing scenario fields",
    { ...fixture(), scenarios: [{ id: "s", name: "s" }] },
  ],
  [
    "oversize factors",
    modelDocument(
      Array.from({ length: 201 }, (_, i) => ({
        ...factor,
        id: `f${i}`,
        label: `Factor ${i}`,
      })),
    ),
  ],
];

test.each(malformed)("BLOCK portable attack: %s", async (_name, document) => {
  expect(() => validateProject(document)).toThrow();
  await asUser(db, owner);
  const before = (await db.query("select id from public.projects")).rows.length;
  await expect(
    db.query("select * from public.create_project($1::jsonb)", [
      JSON.stringify(document),
    ]),
  ).rejects.toThrow();
  expect((await db.query("select id from public.projects")).rows).toHaveLength(
    before,
  );
});

test("BLOCK outsider enumeration, targeted access, joins, and role discovery", async () => {
  await asUser(db, outsider);
  for (const sql of [
    "select * from public.projects",
    "select * from public.projects where id=$1",
    "select m.* from public.project_members m join public.projects p on p.id=m.project_id where p.id=$1",
    "select * from public.project_members where project_id=$1",
  ])
    expect(
      (await db.query(sql, sql.includes("$1") ? [projectId] : [])).rows,
    ).toEqual([]);
  expect(
    (await db.query("select public.project_role($1) as role", [projectId]))
      .rows,
  ).toEqual([{ role: null }]);
});

test("BLOCK direct writes and attempts to disable or replace the defense", async () => {
  await asUser(db, outsider);
  for (const sql of [
    "insert into public.project_members(project_id,user_id,role) values($1,auth.uid(),'owner')",
    "update public.project_members set role='owner' where project_id=$1",
    "delete from public.project_members where project_id=$1",
    "update public.projects set created_by=auth.uid() where id=$1",
    "delete from public.projects where id=$1",
    "alter table public.projects disable row level security",
    "drop policy project_read on public.projects",
    "drop function public.project_role(uuid) cascade",
    "alter function public.create_project(jsonb) security invoker",
  ])
    await expect(
      db.query(sql, sql.includes("$1") ? [projectId] : []),
    ).rejects.toThrow();
});

test("ALLOW verified creation and viewer reads, BLOCK viewer promotion and edits", async () => {
  await db.exec("reset role");
  await db.query("insert into public.project_members values($1,$2,'viewer')", [
    projectId,
    outsider,
  ]);
  try {
    await asUser(db, outsider);
    expect(
      (
        await db.query("select id from public.projects where id=$1", [
          projectId,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select public.project_role($1) as role", [projectId]))
        .rows,
    ).toEqual([{ role: "viewer" }]);
    await expect(
      db.query(
        "update public.project_members set role='owner' where project_id=$1",
        [projectId],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("update public.projects set name='stolen' where id=$1", [
        projectId,
      ]),
    ).rejects.toThrow();
  } finally {
    await db.exec("reset role");
    await db.query(
      "delete from public.project_members where project_id=$1 and user_id=$2",
      [projectId, outsider],
    );
  }
});

test("ALLOW empty models and signed boundary weights without granting forged ownership", async () => {
  await asUser(db, owner);
  const documents = [
    modelDocument([]),
    modelDocument([factor], [{ ...edge, weight: -1 }]),
    modelDocument([factor], [{ ...edge, weight: 1 }]),
  ];
  for (const document of documents) {
    validateProject(document);
    const result = await db.query<{ created_by: string }>(
      "select created_by from public.create_project($1::jsonb)",
      [JSON.stringify({ ...document, created_by: outsider })],
    );
    expect(result.rows[0].created_by).toBe(owner);
  }
});

test("falsification: isolation assertion fails with RLS disabled and passes after rollback", async () => {
  await asUser(db, outsider);
  const assertIsolation = async () =>
    expect(
      (
        await db.query("select id from public.projects where id=$1", [
          projectId,
        ])
      ).rows,
    ).toEqual([]);
  await assertIsolation();
  await db.exec(
    "reset role; begin; alter table public.projects disable row level security",
  );
  try {
    await asUser(db, outsider);
    await expect(assertIsolation()).rejects.toThrow();
  } finally {
    await db.exec("reset role; rollback");
  }
  await asUser(db, outsider);
  await assertIsolation();
});
