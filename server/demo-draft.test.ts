import { describe, expect, it, vi } from "vitest";
import { createDemoDraftHandler } from "./demo-draft.mjs";

const model = {
  factors: [
    { id: "a", label: "Access", color: "#dbe7f4", x: 0, y: 0, provenance: "imported" },
  ],
  relationships: [],
};
const env = {
  AI_MODEL: "z-ai/glm-5.3-flash",
  OPENAI_API_KEY: "never-disclose-test-key",
  AI_BASE_URL: "https://openrouter.ai/api/v1",
};
const payload = { agenda: "Education access", instruction: "Add mentoring", revision: 3, model };
const provider = (proposal: unknown) =>
  vi.fn().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(proposal) } }] }),
        { status: 200 },
      ),
  );

describe("demo AI drafting (OpenRouter-compatible)", () => {
  it("reports missing configuration without throwing", async () => {
    const handler = createDemoDraftHandler({ env: {} });
    const result = await handler({ method: "POST", body: payload });
    expect(result.status).toBe(503);
  });

  it("proxies a valid request to the configured provider and normalizes the reply", async () => {
    const proposed = {
      factors: [...model.factors, { id: "b", label: "Mentoring", provenance: "human" }],
      relationships: [
        { source: "a", target: "b", weight: 0.7, provenance: "human", rationale: "Proposed" },
      ],
    };
    const fetchImpl = provider({ model: proposed, summary: "Hypothesis for review" });
    const handler = createDemoDraftHandler({ env, fetchImpl });
    const result = await handler({ method: "POST", body: payload });
    expect(result.status).toBe(200);
    expect(result.body.revision).toBe(3);
    expect(result.body.model.factors[1].provenance).toBe("ai");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(JSON.stringify(result.body)).not.toContain(env.OPENAI_API_KEY);
    const sent = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string);
    expect(sent.max_completion_tokens).toBe(4000);
  });

  it("rejects invalid input before calling the provider", async () => {
    const fetchImpl = provider({ model, summary: "Draft" });
    const handler = createDemoDraftHandler({ env, fetchImpl });
    const result = await handler({
      method: "POST",
      body: { ...payload, model: { factors: [model.factors[0], model.factors[0]], relationships: [] } },
    });
    expect(result.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("limits requests to 10 per minute per client id, without one client blocking another", async () => {
    const fetchImpl = provider({ model, summary: "Draft" });
    let clock = 0;
    const handler = createDemoDraftHandler({ env, fetchImpl, now: () => clock });
    for (let i = 0; i < 10; i++)
      expect((await handler({ method: "POST", body: payload, clientId: "1.2.3.4" })).status).toBe(200);
    expect((await handler({ method: "POST", body: payload, clientId: "1.2.3.4" })).status).toBe(429);
    expect((await handler({ method: "POST", body: payload, clientId: "5.6.7.8" })).status).toBe(200);
    clock += 61000;
    expect((await handler({ method: "POST", body: payload, clientId: "1.2.3.4" })).status).toBe(200);
  });

  it("enforces a global ceiling across all client ids to cap total spend", async () => {
    const fetchImpl = provider({ model, summary: "Draft" });
    const handler = createDemoDraftHandler({ env, fetchImpl, globalLimit: 3 });
    for (let i = 0; i < 3; i++)
      expect((await handler({ method: "POST", body: payload, clientId: `client-${i}` })).status).toBe(200);
    expect((await handler({ method: "POST", body: payload, clientId: "brand-new-client" })).status).toBe(429);
  });

  it("never exposes the provider key when the upstream call fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error(env.OPENAI_API_KEY));
    const handler = createDemoDraftHandler({ env, fetchImpl });
    const result = await handler({ method: "POST", body: payload });
    expect(result.status).toBe(502);
    expect(JSON.stringify(result.body)).not.toContain(env.OPENAI_API_KEY);
  });
});
