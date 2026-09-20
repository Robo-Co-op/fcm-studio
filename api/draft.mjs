import { draftCloudProposal } from "../server/cloud-draft.mjs";

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
  const result = await draftCloudProposal({ method: req.method, authorization: req.headers.authorization, body });
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(result.status).json(result.body);
}
