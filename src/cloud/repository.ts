import type { SupabaseClient } from "@supabase/supabase-js";
import { validateProject, type Project } from "../model";
export interface CloudProject {
  id: string;
  document: Project;
  revision: number;
  role: "owner" | "editor" | "viewer";
}
function parseRow(value: unknown): CloudProject {
  if (!value || typeof value !== "object")
    throw new Error("Invalid cloud project.");
  const row = value as Record<string, unknown>;
  validateProject(row.document);
  const members = row.project_members;
  const role =
    Array.isArray(members) && members.length === 1
      ? members[0]?.role
      : undefined;
  if (
    typeof row.id !== "string" ||
    row.document.id !== row.id ||
    row.document.revision !== row.revision ||
    !Number.isSafeInteger(row.revision) ||
    Number(row.revision) < 0 ||
    !["owner", "editor", "viewer"].includes(role)
  )
    throw new Error("Invalid cloud project membership or revision.");
  return {
    id: row.id,
    document: row.document,
    revision: Number(row.revision),
    role,
  };
}
export function createProjectRepository(
  client: SupabaseClient,
  userId: string,
) {
  const query = () =>
    client
      .from("projects")
      .select("id,document,revision,project_members!inner(role)")
      .eq("project_members.user_id", userId);
  return {
    async create(document: Project): Promise<CloudProject> {
      validateProject(document);
      const { data, error } = await client.rpc("create_project", {
        p_document: document,
      });
      if (error) throw error;
      if (!data || typeof data !== "object" || typeof data.id !== "string")
        throw new Error("Invalid created project identity.");
      return this.load(data.id);
    },
    async load(id: string): Promise<CloudProject> {
      const { data, error } = await query().eq("id", id).single();
      if (error) throw error;
      return parseRow(data);
    },
    async list(): Promise<CloudProject[]> {
      const { data, error } = await query().order("updated_at", {
        ascending: false,
      });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Invalid project list.");
      return data.map(parseRow);
    },
  };
}
