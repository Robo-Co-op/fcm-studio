# 04 — Publish authenticated OpenRouter proposals on free hosting

Type: AFK. Covers user story 12 in the cloud PRD.

## What to build

Deploy the application to free Vercel/Supabase resources and expose authenticated OpenRouter proposals through server functions. Evaluate inexpensive candidate models with synthetic FCM tasks using at most USD 1 of existing OpenRouter balance. Integrate reviewed proposals with shared command acceptance.

## Acceptance criteria

- [ ] Hosted application supports Google login, project creation/loading, invitation acceptance, and two-session editing on the deployment domain.
- [ ] Server verifies identity and editor/owner membership before loading authoritative project data and calling OpenRouter.
- [ ] Provider key never reaches client bundles, logs, repository, or exported research; model/provider choices use a server allowlist.
- [ ] Durable usage reservation prevents concurrent requests from bypassing per-user/project limits; capped input/output and provider timeout fail safely.
- [ ] Evaluation uses synthetic prompts, records candidate IDs/prices, validity and FCM instruction adherence, and spends no more than USD 1; do not purchase credits or upgrade hosting.
- [ ] Record selected model and evaluation evidence; if live calls are unavailable, explicitly mark quality/provider verification incomplete rather than invent results.
- [ ] Malformed output is rejected, proposals require review, and stale acceptance fails on the server after another editor's change.
- [ ] AI failure leaves manual collaborative editing available and never mutates the research model.
- [ ] Authentication redirect configuration and production Realtime/RLS behavior are verified; evidence distinguishes local tests from live checks.
- [ ] Simplifier, test, and security review plus relevant CI checks pass before release; README documents deployment, limits, and research-data handling.

## Blocked by

Issue 03 — invitations and research history. Replace this local reference with the real tracker ID when publishing.
