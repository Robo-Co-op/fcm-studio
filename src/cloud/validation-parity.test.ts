import { afterEach, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, fixture, owner, testDatabase } from "./testDatabase";
import { validateModel, validateRun } from "../model";

let db: PGlite;
afterEach(async () => {
  await db?.close();
});

test("research timestamps reject PostgreSQL relative dates and normalized invalid calendar dates", async () => {
  db = await testDatabase();
  await asUser(db, owner);
  const document = fixture();
  const run = {
    id: "run",
    createdAt: "2026-09-06T00:00:00.000Z",
    snapshot: document.model,
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
  expect(() => validateRun(run)).not.toThrow();
  await expect(
    db.query("select * from public.create_project($1::jsonb)", [
      JSON.stringify({ ...document, runs: [run] }),
    ]),
  ).resolves.toHaveProperty("rows");
  for (const createdAt of [
    "0000-01-01T00:00:00.000Z",
    "now",
    "today",
    "2026-02-30T00:00:00.000Z",
    "2026-09-06T00:00:00",
  ]) {
    const bad = { ...run, createdAt };
    expect(() => validateRun(bad)).toThrow();
    await expect(
      db.query("select * from public.create_project($1::jsonb)", [
        JSON.stringify({ ...document, runs: [bad] }),
      ]),
    ).rejects.toThrow();
  }
}, 30000);

test("label comparisons fold ASCII only and preserve non-ASCII case across SQL and TypeScript", async () => {
  db = await testDatabase();
  await asUser(db, owner);
  for (const [first, second] of [
    ["ΟΣ", "ος"],
    ["İ", "i"],
    ["İ", "i\u0307"],
  ]) {
    const document = fixture();
    document.model.factors[0].label = first;
    document.model.factors.push({
      ...document.model.factors[0],
      id: "b",
      label: second,
    });
    expect(() => validateModel(document.model)).not.toThrow();
    await expect(
      db.query("select * from public.create_project($1::jsonb)", [
        JSON.stringify(document),
      ]),
    ).resolves.toHaveProperty("rows");
  }
  for (const [first, second] of [
    ["ACCESS", "access"],
    ["ΟΣ", "ΟΣ"],
    ["İ", "İ"],
  ]) {
    const document = fixture();
    document.model.factors[0].label = first;
    document.model.factors.push({
      ...document.model.factors[0],
      id: "b",
      label: second,
    });
    expect(() => validateModel(document.model)).toThrow();
    await expect(
      db.query("select * from public.create_project($1::jsonb)", [
        JSON.stringify(document),
      ]),
    ).rejects.toThrow(/Duplicate factor/);
  }
}, 30000);

test("SQL text boundaries match JavaScript whitespace and UTF-16 lengths", async () => {
  db = await testDatabase();
  await asUser(db, owner);
  for (const label of ["\t", "\n\t", "\u00a0", "\uFEFF", "😀".repeat(151)]) {
    const document = fixture();
    document.model.factors[0].label = label;
    await expect(
      db.query("select * from public.create_project($1::jsonb)", [
        JSON.stringify(document),
      ]),
    ).rejects.toThrow(/Invalid factor/);
  }
  const document = fixture();
  document.name = "\n\t";
  await expect(
    db.query("select * from public.create_project($1::jsonb)", [
      JSON.stringify(document),
    ]),
  ).rejects.toThrow(/Invalid project/);
  document.name = "Valid multilingual research";
  document.model.factors[0].label = "😀".repeat(150);
  await expect(
    db.query("select * from public.create_project($1::jsonb)", [
      JSON.stringify(document),
    ]),
  ).resolves.toHaveProperty("rows");
}, 30000);

test("SQL duplicate labels normalize every JavaScript trim character", async () => {
  db = await testDatabase();
  await asUser(db, owner);
  const whitespace =
    "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
  for (const padding of whitespace) {
    const document = fixture();
    document.model.factors.push({
      ...document.model.factors[0],
      id: "b",
      label: `${padding}Access${padding}`,
    });
    await expect(
      db.query("select * from public.create_project($1::jsonb)", [
        JSON.stringify(document),
      ]),
    ).rejects.toThrow(/Duplicate factor/);
  }
}, 30000);
