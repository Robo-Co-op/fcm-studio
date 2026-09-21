import { createDemoDraftHandler } from "../server/demo-draft.mjs";

const draftDemoProposal = createDemoDraftHandler();

export default async function handler(req, res) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 256 * 1024) {
      res.status(413).json({ error: "Request too large." });
      return;
    }
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { body = null; }
  const clientId = String(req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "unknown").split(",")[0].trim();
  const result = await draftDemoProposal({ method: req.method, body, clientId });
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(result.status).json(result.body);
}
