import { describe, expect, it, vi } from "vitest";
import { draftCloudProposal } from "./cloud-draft.mjs";

const env = { EURIA_API_KEY: "server-key", EURIA_PRODUCT_ID: "42", EURIA_MODEL: "swiss-ai/Apertus-v1.5-70B", SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "publishable" };
const document = { agenda: "Access", model: { factors: [{ id: "a", label: "Access", color: "#dbe7f4", x: 0, y: 0, provenance: "human" }], relationships: [] } };

describe("cloud Euria proposals", () => {
  it("reserves and loads the authoritative project before sending Euria a review-only proposal", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ revision: 4, document }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ model: document.model, summary: "Hypothesis" }) } }], usage: { prompt_tokens: 10, completion_tokens: 8 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await draftCloudProposal({ method: "POST", authorization: "Bearer user-token", body: { projectId: "project-a", instruction: "Suggest a factor" } }, { env, fetchImpl, randomUUID: () => "00000000-0000-4000-8000-000000000100" });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ revision: 4, summary: "Hypothesis" });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("reserve_ai_proposal");
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("api.infomaniak.com/2/ai/42/openai/v1/chat/completions");
    expect(JSON.stringify(fetchImpl.mock.calls[1]?.[1])).not.toContain("user-token");
  });
});
