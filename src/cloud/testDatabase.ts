import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import type { Model, Project } from "../model";
export const owner = "00000000-0000-4000-8000-000000000001";
export const outsider = "00000000-0000-4000-8000-000000000002";
export const invitee = "00000000-0000-4000-8000-000000000003";
export const wrongEmailUser = "00000000-0000-4000-8000-000000000004";
export async function testDatabase() {
  const db = new PGlite();
  await db.exec(`create schema auth; create role anon nologin; create role authenticated nologin;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users values
      ('${owner}','owner@example.com',now()),
      ('${outsider}','outsider@example.com',now()),
      ('${invitee}','invitee@example.com',now()),
      ('${wrongEmailUser}','wrong@example.com',now());`);
  const migrations = new URL("../../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(migrations))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  return db;
}
export async function asUser(db: PGlite, user: string | null) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user ?? "",
  ]);
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
}
export function fixture(): Project {
  const model: Model = {
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
