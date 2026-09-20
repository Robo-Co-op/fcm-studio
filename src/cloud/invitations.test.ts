import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import {
  acceptInvitation,
  captureInvitationToken,
  clearInvitationToken,
  createInvitation,
  listProjectInvitations,
  listProjectMembers,
  removeProjectMember,
  revokeInvitation,
  updateProjectMemberRole,
} from "./invitations";

it("moves an invitation out of the URL into tab-scoped storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  const captured = captureInvitationToken(
    new URL(
      "https://studio.example.org/?view=map#invite=secret-token&section=notes",
    ),
    storage,
  );
  expect(captured).toEqual({
    token: "secret-token",
    cleanUrl: "/?view=map#section=notes",
  });
  expect(
    captureInvitationToken(new URL("https://studio.example.org/"), storage),
  ).toEqual({ token: "secret-token", cleanUrl: null });
  clearInvitationToken(storage);
  expect(
    captureInvitationToken(new URL("https://studio.example.org/"), storage),
  ).toEqual({ token: null, cleanUrl: null });
  expect(
    captureInvitationToken(
      new URL("https://studio.example.org/?invite=query-token"),
      storage,
    ),
  ).toEqual({ token: null, cleanUrl: null });
});

it("creates an email-bound invitation through the checked RPC", async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    void init;
    return new Response(
      JSON.stringify([
        {
          id: "invite-a",
          token: "one-time-token",
          email: "person@example.com",
          role: "editor",
          expires_at: "2026-09-13T00:00:00Z",
        },
      ]),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  });
  const client = createClient(
    "https://example.supabase.co",
    "public-test-key",
    { global: { fetch }, auth: { persistSession: false } },
  );

  await expect(
    createInvitation(client, "project-a", " Person@Example.com ", "editor"),
  ).resolves.toEqual({
    id: "invite-a",
    token: "one-time-token",
    email: "person@example.com",
    role: "editor",
    expiresAt: "2026-09-13T00:00:00Z",
  });
  expect(String(fetch.mock.calls[0]?.[0])).toContain(
    "/rpc/create_project_invitation",
  );
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
    p_project_id: "project-a",
    p_email: "Person@Example.com",
    p_role: "editor",
  });
});

it("lists members without requesting email addresses", async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    void init;
    return new Response(
      JSON.stringify([
        { user_id: "owner-a", role: "owner" },
        { user_id: "viewer-b", role: "viewer" },
      ]),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  const client = createClient(
    "https://example.supabase.co",
    "public-test-key",
    { global: { fetch }, auth: { persistSession: false } },
  );

  await expect(listProjectMembers(client, "project-a")).resolves.toEqual([
    { userId: "owner-a", role: "owner" },
    { userId: "viewer-b", role: "viewer" },
  ]);
  expect(String(fetch.mock.calls[0]?.[0])).toContain(
    "/rpc/list_project_members",
  );
  expect(String(fetch.mock.calls[0]?.[1]?.body)).not.toContain("email");
});

it("lists owner-visible invitation status without exposing tokens", async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void input;
    void init;
    return new Response(
      JSON.stringify([
        {
          id: "invite-a",
          email: "person@example.com",
          role: "viewer",
          expires_at: "2026-09-13T00:00:00Z",
          consumed_at: null,
          revoked_at: null,
          created_at: "2026-09-06T00:00:00Z",
        },
      ]),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  const client = createClient(
    "https://example.supabase.co",
    "public-test-key",
    { global: { fetch }, auth: { persistSession: false } },
  );

  await expect(listProjectInvitations(client, "project-a")).resolves.toEqual([
    {
      id: "invite-a",
      email: "person@example.com",
      role: "viewer",
      expiresAt: "2026-09-13T00:00:00Z",
      consumedAt: null,
      revokedAt: null,
      createdAt: "2026-09-06T00:00:00Z",
    },
  ]);
  expect(String(fetch.mock.calls[0]?.[0])).toContain(
    "/rpc/list_project_invitations",
  );
});

it("uses checked RPCs for acceptance, revocation, role changes, and removal", async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const url = String(input);
    const response = url.includes("accept_project_invitation")
      ? { project_id: "project-a", user_id: "member-b", role: "viewer" }
      : null;
    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = createClient(
    "https://example.supabase.co",
    "public-test-key",
    { global: { fetch }, auth: { persistSession: false } },
  );

  await expect(acceptInvitation(client, "one-time-token")).resolves.toBe(
    "project-a",
  );
  await revokeInvitation(client, "project-a", "invite-a");
  await updateProjectMemberRole(client, "project-a", "member-b", "editor");
  await removeProjectMember(client, "project-a", "member-b");

  const calls = fetch.mock.calls.map(([input, init]) => ({
    url: String(input),
    body: JSON.parse(String(init?.body)),
  }));
  expect(calls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        url: expect.stringContaining("/rpc/accept_project_invitation"),
        body: { p_token: "one-time-token" },
      }),
      expect.objectContaining({
        url: expect.stringContaining("/rpc/revoke_project_invitation"),
        body: { p_project_id: "project-a", p_invitation_id: "invite-a" },
      }),
      expect.objectContaining({
        url: expect.stringContaining("/rpc/update_project_member_role"),
        body: {
          p_project_id: "project-a",
          p_user_id: "member-b",
          p_role: "editor",
        },
      }),
      expect.objectContaining({
        url: expect.stringContaining("/rpc/remove_project_member"),
        body: { p_project_id: "project-a", p_user_id: "member-b" },
      }),
    ]),
  );
});
