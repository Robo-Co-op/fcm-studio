import { afterEach, expect, test } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  asUser,
  fixture,
  invitee,
  outsider,
  owner,
  testDatabase,
  wrongEmailUser,
} from "./testDatabase";

let db: PGlite;
afterEach(async () => db?.close());

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

async function invite(
  projectId: string,
  email = "invitee@example.com",
  role = "editor",
) {
  return (
    await db.query<{
      id: string;
      token: string;
      email: string;
      role: string;
      expires_at: Date;
    }>("select * from public.create_project_invitation($1,$2,$3)", [
      projectId,
      email,
      role,
    ])
  ).rows[0];
}

test("owner invitation is email-bound, accepted once, and stores only its SHA-256 hash", async () => {
  const projectId = await setup();
  const createdAt = Date.now();
  const invitation = await invite(projectId, "  Invitee@Example.COM  ");
  expect(invitation.email).toBe("invitee@example.com");
  expect(invitation.token).toMatch(/^[0-9a-f-]{36}$/);
  expect(new Date(invitation.expires_at).getTime() - createdAt).toBeGreaterThan(
    6.99 * 86_400_000,
  );
  await db.exec("reset role");
  const stored = (
    await db.query<{ token_hash: Uint8Array; email: string }>(
      "select token_hash,email from public.project_invitations where id=$1",
      [invitation.id],
    )
  ).rows[0];
  expect(stored.email).toBe("invitee@example.com");
  expect(Buffer.from(stored.token_hash)).toHaveLength(32);
  expect(Buffer.from(stored.token_hash).toString("utf8")).not.toContain(
    invitation.token,
  );
  await asUser(db, invitee);
  expect(
    (
      await db.query<{ role: string }>(
        "select role from public.accept_project_invitation($1)",
        [invitation.token],
      )
    ).rows[0].role,
  ).toBe("editor");
  await expect(
    db.query("select public.accept_project_invitation($1)", [invitation.token]),
  ).rejects.toThrow(/invalid or unavailable/i);
}, 30000);

test("wrong email, expiry, revocation, and unverified auth fail atomically", async () => {
  const projectId = await setup();
  const wrong = await invite(projectId);
  await asUser(db, wrongEmailUser);
  await expect(
    db.query("select public.accept_project_invitation($1)", [wrong.token]),
  ).rejects.toThrow(/invalid or unavailable/i);
  expect(
    (await db.query("select * from public.projects where id=$1", [projectId]))
      .rows,
  ).toHaveLength(0);
  await asUser(db, owner);
  const expired = await invite(projectId);
  const revoked = await invite(projectId);
  await db.query("select public.revoke_project_invitation($1,$2)", [
    projectId,
    revoked.id,
  ]);
  await db.exec("reset role");
  await db.query(
    "update public.project_invitations set expires_at=now()-interval '1 second' where id=$1",
    [expired.id],
  );
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    invitee,
  ]);
  await asUser(db, invitee);
  await expect(
    db.query("select public.accept_project_invitation($1)", [wrong.token]),
  ).rejects.toThrow(/verified authentication/i);
  await db.exec("reset role");
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [
    invitee,
  ]);
  await asUser(db, invitee);
  for (const token of [expired.token, revoked.token])
    await expect(
      db.query("select public.accept_project_invitation($1)", [token]),
    ).rejects.toThrow(/invalid or unavailable/i);
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select * from public.project_members where project_id=$1 and user_id=$2",
        [projectId, invitee],
      )
    ).rows,
  ).toHaveLength(0);
}, 30000);

test("viewer invitations work and owner can list, change, and remove non-owner members", async () => {
  const projectId = await setup();
  const invitation = await invite(projectId, "invitee@example.com", "viewer");
  expect(
    (
      await db.query<{ id: string; email: string; role: string }>(
        "select id,email,role from public.list_project_invitations($1)",
        [projectId],
      )
    ).rows,
  ).toEqual([
    { id: invitation.id, email: "invitee@example.com", role: "viewer" },
  ]);
  await asUser(db, invitee);
  expect(
    (
      await db.query<{ role: string }>(
        "select role from public.accept_project_invitation($1)",
        [invitation.token],
      )
    ).rows[0].role,
  ).toBe("viewer");
  await asUser(db, owner);
  expect(
    (
      await db.query<{ user_id: string; role: string }>(
        "select * from public.list_project_members($1)",
        [projectId],
      )
    ).rows,
  ).toContainEqual({ user_id: invitee, role: "viewer" });
  expect(
    (
      await db.query<{ role: string }>(
        "select role from public.update_project_member_role($1,$2,'editor')",
        [projectId, invitee],
      )
    ).rows[0].role,
  ).toBe("editor");
  const lowerRoleInvitation = await invite(
    projectId,
    "invitee@example.com",
    "viewer",
  );
  await asUser(db, invitee);
  expect(
    (
      await db.query<{ role: string }>(
        "select role from public.accept_project_invitation($1)",
        [lowerRoleInvitation.token],
      )
    ).rows[0].role,
  ).toBe("editor");
  await asUser(db, owner);
  await db.query("select public.remove_project_member($1,$2)", [
    projectId,
    invitee,
  ]);
  expect(
    (
      await db.query("select * from public.list_project_members($1)", [
        projectId,
      ])
    ).rows,
  ).toHaveLength(1);
}, 30000);

test("owner membership cannot be changed, removed, or downgraded by accepting an invitation", async () => {
  const projectId = await setup();
  await expect(
    db.query("select public.update_project_member_role($1,$2,'viewer')", [
      projectId,
      owner,
    ]),
  ).rejects.toThrow(/cannot be changed/i);
  await expect(
    db.query("select public.remove_project_member($1,$2)", [projectId, owner]),
  ).rejects.toThrow(/cannot be removed/i);
  const ownInvitation = await invite(projectId, "OWNER@EXAMPLE.COM", "viewer");
  expect(
    (
      await db.query<{ role: string }>(
        "select role from public.accept_project_invitation($1)",
        [ownInvitation.token],
      )
    ).rows[0].role,
  ).toBe("owner");
}, 30000);

test("editors, outsiders, anonymous users, and cross-project IDs cannot manage access", async () => {
  const projectId = await setup();
  const invitation = await invite(projectId);
  const secondProjectId = (
    await db.query<{ id: string }>(
      "select id from public.create_project($1::jsonb)",
      [JSON.stringify({ ...fixture(), name: "Second" })],
    )
  ).rows[0].id;
  await expect(
    db.query("select public.revoke_project_invitation($1,$2)", [
      secondProjectId,
      invitation.id,
    ]),
  ).rejects.toThrow(/invalid or unavailable/i);
  await db.exec("reset role");
  await db.query(
    "insert into public.project_members(project_id,user_id,role) values($1,$2,'editor')",
    [projectId, outsider],
  );
  await asUser(db, outsider);
  const denied = [
    db.query(
      "select * from public.create_project_invitation($1,'x@example.com','viewer')",
      [projectId],
    ),
    db.query("select * from public.list_project_invitations($1)", [projectId]),
    db.query("select public.revoke_project_invitation($1,$2)", [
      projectId,
      invitation.id,
    ]),
    db.query("select * from public.list_project_members($1)", [projectId]),
    db.query("select public.update_project_member_role($1,$2,'viewer')", [
      projectId,
      outsider,
    ]),
    db.query("select public.remove_project_member($1,$2)", [
      projectId,
      outsider,
    ]),
  ];
  for (const operation of denied)
    await expect(operation).rejects.toThrow(/owner permission/i);
  await expect(
    db.query("select * from public.project_invitations"),
  ).rejects.toThrow(/permission denied/i);
  await db.exec("reset role");
  await db.query(
    "update public.project_members set role='viewer' where project_id=$1 and user_id=$2",
    [projectId, outsider],
  );
  await asUser(db, outsider);
  await expect(
    db.query("select * from public.list_project_members($1)", [projectId]),
  ).rejects.toThrow(/owner permission/i);
  await db.exec("reset role");
  await db.query(
    "delete from public.project_members where project_id=$1 and user_id=$2",
    [projectId, outsider],
  );
  await asUser(db, outsider);
  await expect(
    db.query("select * from public.list_project_invitations($1)", [projectId]),
  ).rejects.toThrow(/owner permission/i);
  await asUser(db, null);
  await expect(
    db.query("select public.accept_project_invitation($1)", [invitation.token]),
  ).rejects.toThrow();
}, 30000);

test("invitation boundary rejects 20 malformed or overreaching inputs", async () => {
  const projectId = await setup();
  const invalid: Array<[unknown, unknown]> = [
    [null, "viewer"],
    ["", "viewer"],
    ["  ", "viewer"],
    ["a", "viewer"],
    ["a@b", "viewer"],
    ["@example.com", "viewer"],
    ["a@@example.com", "viewer"],
    ["a @example.com", "viewer"],
    ["a@example .com", "viewer"],
    [`${"a".repeat(310)}@example.com`, "viewer"],
    ["a@example.com", null],
    ["a@example.com", ""],
    ["a@example.com", "owner"],
    ["a@example.com", "admin"],
    ["a@example.com", "EDITOR"],
  ];
  for (const [email, role] of invalid)
    await expect(
      db.query("select * from public.create_project_invitation($1,$2,$3)", [
        projectId,
        email,
        role,
      ]),
    ).rejects.toThrow(/invalid invitation/i);
  await asUser(db, invitee);
  for (const token of [null, "", " ", "not-a-token", crypto.randomUUID()])
    await expect(
      db.query("select public.accept_project_invitation($1)", [token]),
    ).rejects.toThrow(/invalid or unavailable/i);
}, 30000);

test("Unicode email case normalization matches the authenticated address", async () => {
  const projectId = await setup();
  await db.exec("reset role");
  await db.query("update auth.users set email=$1 where id=$2", [
    "üser@example.com",
    invitee,
  ]);
  await asUser(db, owner);
  const invitation = await invite(projectId, "  ÜSER@Example.COM ", "viewer");
  expect(invitation.email).toBe("üser@example.com");
  await asUser(db, invitee);
  expect(
    (
      await db.query<{ role: string }>(
        "select role from public.accept_project_invitation($1)",
        [invitation.token],
      )
    ).rows[0].role,
  ).toBe("viewer");
}, 30000);
