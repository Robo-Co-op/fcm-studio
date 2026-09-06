import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export const owner = "00000000-0000-4000-8000-000000000001";
export const outsider = "00000000-0000-4000-8000-000000000002";
export async function testDatabase() {
  const db = new PGlite();
  await db.exec(`create schema auth; create role anon nologin; create role authenticated nologin;
    create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values ('${owner}',now()),('${outsider}',now());`);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/202609060001_projects.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  return db;
}
export async function asUser(db: PGlite, user: string | null) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user ?? "",
  ]);
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
}
export function fixture() {
  const model = {
    factors: [
      {
        id: "a",
        label: "Access",
        color: "#cae6dc",
        x: 0,
        y: 0,
        provenance: "human",
      },
    ],
    relationships: [],
  };
  return {
    version: 1,
    id: "local-id",
    name: "Synthetic study",
    agenda: "Access",
    revision: 7,
    model,
    baseline: structuredClone(model),
    scenarios: [],
    runs: [],
  };
}
