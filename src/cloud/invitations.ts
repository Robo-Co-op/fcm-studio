import type { SupabaseClient } from "@supabase/supabase-js";

export type MemberRole = "owner" | "editor" | "viewer";
export type InviteRole = Exclude<MemberRole, "owner">;

const PENDING_INVITATION_KEY = "fcm-studio.pending-invitation";

export interface CreatedInvitation {
  id: string;
  token: string;
  email: string;
  role: InviteRole;
  expiresAt: string;
}

export interface ProjectMember {
  userId: string;
  role: MemberRole;
}

const isMemberRole = (value: unknown): value is MemberRole =>
  value === "owner" || value === "editor" || value === "viewer";
const isInviteRole = (value: unknown): value is InviteRole =>
  value === "editor" || value === "viewer";

export interface ProjectInvitation {
  id: string;
  email: string;
  role: InviteRole;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const nullableString = (value: unknown): value is string | null =>
  typeof value === "string" || value === null;

export function captureInvitationToken(
  url: URL,
  storage: Pick<Storage, "getItem" | "setItem">,
): { token: string | null; cleanUrl: string | null } {
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const supplied = fragment.get("invite")?.trim() ?? "";
  if (supplied) {
    if (supplied.length <= 128) {
      try {
        storage.setItem(PENDING_INVITATION_KEY, supplied);
      } catch {
        // セッション保存が無効でも、現在のページでは受諾を試行できる。
      }
    }
    fragment.delete("invite");
    url.hash = fragment.toString() ? `#${fragment.toString()}` : "";
    return {
      token: supplied,
      cleanUrl: `${url.pathname}${url.search}${url.hash}`,
    };
  }
  try {
    return { token: storage.getItem(PENDING_INVITATION_KEY), cleanUrl: null };
  } catch {
    return { token: null, cleanUrl: null };
  }
}

export function clearInvitationToken(
  storage: Pick<Storage, "removeItem">,
): void {
  try {
    storage.removeItem(PENDING_INVITATION_KEY);
  } catch {
    // 保存領域が無効な環境では削除対象も存在しない。
  }
}

export async function listProjectMembers(
  client: SupabaseClient,
  projectId: string,
): Promise<ProjectMember[]> {
  const { data, error } = await client.rpc("list_project_members", {
    p_project_id: projectId,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Invalid project member list.");
  return data.map((value: unknown) => {
    if (!value || typeof value !== "object")
      throw new Error("Invalid project member list.");
    const row = value as Record<string, unknown>;
    if (typeof row.user_id !== "string" || !isMemberRole(row.role))
      throw new Error("Invalid project member list.");
    return { userId: row.user_id, role: row.role };
  });
}

export async function createInvitation(
  client: SupabaseClient,
  projectId: string,
  email: string,
  role: InviteRole,
): Promise<CreatedInvitation> {
  const { data, error } = await client.rpc("create_project_invitation", {
    p_project_id: projectId,
    p_email: email.trim(),
    p_role: role,
  });
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1)
    throw new Error("The invitation service returned an invalid token.");
  const row = data[0] as Record<string, unknown> | undefined;
  if (
    !row ||
    typeof row.id !== "string" ||
    typeof row.token !== "string" ||
    !row.token ||
    typeof row.email !== "string" ||
    !isInviteRole(row.role) ||
    typeof row.expires_at !== "string"
  )
    throw new Error("The invitation service returned an invalid token.");
  return {
    id: row.id,
    token: row.token,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
  };
}

export async function listProjectInvitations(
  client: SupabaseClient,
  projectId: string,
): Promise<ProjectInvitation[]> {
  const { data, error } = await client.rpc("list_project_invitations", {
    p_project_id: projectId,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Invalid invitation list.");
  return data.map((value: unknown) => {
    if (!value || typeof value !== "object")
      throw new Error("Invalid invitation list.");
    const row = value as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.email !== "string" ||
      !isInviteRole(row.role) ||
      typeof row.expires_at !== "string" ||
      !nullableString(row.consumed_at) ||
      !nullableString(row.revoked_at) ||
      typeof row.created_at !== "string"
    )
      throw new Error("Invalid invitation list.");
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    };
  });
}

export async function acceptInvitation(
  client: SupabaseClient,
  token: string,
): Promise<string> {
  const { data, error } = await client.rpc("accept_project_invitation", {
    p_token: token,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || !("project_id" in data))
    throw new Error("The invitation response was invalid.");
  const projectId = data.project_id;
  if (typeof projectId !== "string")
    throw new Error("The invitation response was invalid.");
  return projectId;
}

export async function revokeInvitation(
  client: SupabaseClient,
  projectId: string,
  invitationId: string,
): Promise<void> {
  const { error } = await client.rpc("revoke_project_invitation", {
    p_project_id: projectId,
    p_invitation_id: invitationId,
  });
  if (error) throw error;
}

export async function updateProjectMemberRole(
  client: SupabaseClient,
  projectId: string,
  userId: string,
  role: InviteRole,
): Promise<void> {
  const { error } = await client.rpc("update_project_member_role", {
    p_project_id: projectId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
}

export async function removeProjectMember(
  client: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<void> {
  const { error } = await client.rpc("remove_project_member", {
    p_project_id: projectId,
    p_user_id: userId,
  });
  if (error) throw error;
}
