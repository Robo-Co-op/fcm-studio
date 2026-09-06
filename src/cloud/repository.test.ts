import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { createProjectRepository } from "./repository";
const document = {
  version: 1,
  id: "cloud-id",
  name: "Workshop",
  agenda: "Future",
  revision: 0,
  model: { factors: [], relationships: [] },
  baseline: { factors: [], relationships: [] },
  scenarios: [],
  runs: [],
};
it("lists validated projects using the current user's membership role", async () => {
  const fetch = vi.fn(
    async (input: RequestInfo | URL) => (
      String(input),
      new Response(
        JSON.stringify([
          {
            id: "cloud-id",
            document,
            revision: 0,
            project_members: [{ role: "editor" }],
          },
        ]),
        { headers: { "Content-Type": "application/json" } },
      )
    ),
  );
  const client = createClient(
    "https://example.supabase.co",
    "public-test-key",
    { global: { fetch }, auth: { persistSession: false } },
  );
  const result = await createProjectRepository(client, "user-a").list();
  expect(result[0]).toEqual({
    id: "cloud-id",
    document,
    revision: 0,
    role: "editor",
  });
  expect(String(fetch.mock.calls[0]?.[0])).toContain(
    "project_members.user_id=eq.user-a",
  );
});
it("loads the requested project and rejects malformed cloud documents", async () => {
  const fetch = vi.fn(
    async (input: RequestInfo | URL) => (
      String(input),
      new Response(
        JSON.stringify({
          id: "cloud-id",
          document: { ...document, model: {} },
          revision: 0,
          project_members: [{ role: "owner" }],
        }),
        { headers: { "Content-Type": "application/json" } },
      )
    ),
  );
  const client = createClient(
    "https://example.supabase.co",
    "public-test-key",
    { global: { fetch }, auth: { persistSession: false } },
  );
  await expect(
    createProjectRepository(client, "user-a").load("cloud-id"),
  ).rejects.toThrow("Invalid model");
  expect(String(fetch.mock.calls[0]?.[0])).toContain("id=eq.cloud-id");
});
it("creates through the atomic RPC and reloads its server-assigned identity", async () => {
  const fetch = vi.fn(
    async (input: RequestInfo | URL) =>
      new Response(
        JSON.stringify(
          String(input).includes("/rpc/")
            ? { id: "cloud-id" }
            : {
                id: "cloud-id",
                document,
                revision: 0,
                project_members: [{ role: "owner" }],
              },
        ),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  const client = createClient(
    "https://example.supabase.co",
    "public-test-key",
    { global: { fetch }, auth: { persistSession: false } },
  );
  const result = await createProjectRepository(client, "user-a").create({
    ...document,
    version: 1,
    id: "local-original",
  });
  expect(result.id).toBe("cloud-id");
  expect(String(fetch.mock.calls[0]?.[0])).toContain("/rpc/create_project");
});
