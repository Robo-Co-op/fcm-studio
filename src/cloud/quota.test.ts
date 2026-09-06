import { expect, test } from "vitest";
import { asUser, fixture, owner, outsider, testDatabase } from "./testDatabase";

test("creation cap is enforced atomically per owner without blocking another owner", async () => {
  const db = await testDatabase();
  try {
    await asUser(db, owner);
    for (let i = 0; i < 20; i++)
      await db.query("select public.create_project($1::jsonb)", [
        JSON.stringify(fixture()),
      ]);
    await expect(
      db.query("select public.create_project($1::jsonb)", [
        JSON.stringify(fixture()),
      ]),
    ).rejects.toThrow(/quota/i);
    expect(
      (await db.query("select id from public.projects")).rows,
    ).toHaveLength(20);
    await asUser(db, outsider);
    await expect(
      db.query("select public.create_project($1::jsonb)", [
        JSON.stringify(fixture()),
      ]),
    ).resolves.toBeDefined();
  } finally {
    await db.close();
  }
}, 30000);
