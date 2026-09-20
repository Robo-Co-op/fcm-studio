import { describe, expect, it } from "vitest";
import { asUser, fixture, invitee, outsider, owner, testDatabase } from "./testDatabase";

async function project(db: Awaited<ReturnType<typeof testDatabase>>) {
  await asUser(db, owner);
  const result = await db.query<{ id: string }>("select id from public.create_project($1::jsonb)", [JSON.stringify(fixture())]);
  return result.rows[0]!.id;
}

describe("AI proposal reservations", () => {
  it("returns the authoritative document only to a verified owner or editor", async () => {
    const db = await testDatabase();
    const id = await project(db);
    const request = "00000000-0000-4000-8000-000000000101";
    await asUser(db, owner);
    const reserved = await db.query<{ revision: number; document: { agenda: string } }>(
      "select * from public.reserve_ai_proposal($1,$2)", [id, request],
    );
    expect(reserved.rows[0]?.revision).toBe(0);
    expect(reserved.rows[0]?.document.agenda).toBe("Access");
    await db.query("select public.complete_ai_proposal($1,12,8)", [request]);
    await asUser(db, outsider);
    await expect(db.query("select * from public.reserve_ai_proposal($1,$2)", [id, "00000000-0000-4000-8000-000000000102"])).rejects.toThrow("Project edit permission denied");
    await db.exec("reset role");
    await db.query("insert into public.project_members(project_id,user_id,role) values($1,$2,'viewer')", [id, invitee]);
    await asUser(db, invitee);
    await expect(db.query("select * from public.reserve_ai_proposal($1,$2)", [id, "00000000-0000-4000-8000-000000000103"])).rejects.toThrow("Project edit permission denied");
  });
});
