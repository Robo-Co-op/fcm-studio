# 03 — Invite participants and preserve shared research history

Type: AFK. Covers user stories 8–11 in the cloud PRD.

## What to build

Owners create email-bound editor/viewer invitation links and manage membership. Recipients authenticate and accept into the project. Add immutable baseline/scenario/run persistence integrated with the existing simulation workflow.

## Acceptance criteria

- [x] Only owners create/revoke invitations or remove/change editor/viewer membership; no owner transfer or last-owner removal exists.
- [x] Invitation tokens are random, hashed at rest, expire after seven days, and are consumed once transactionally.
- [x] Recipient email from Supabase Auth must match the bound normalized email and have non-null `auth.users.email_confirmed_at`; browser-supplied emails or verification flags are ignored. Outsiders cannot inspect invite details through arbitrary queries.
- [x] Wrong-email, expired, revoked, and reused links fail without creating membership or changing a role.
- [x] UI exposes a copyable invitation link; implementation sends no invitation messages.
- [x] Viewer can read/export and simulate locally but cannot edit or save a shared run; editor can edit/save but cannot manage membership.
- [x] Baselines, scenarios, and runs are immutable, project-scoped, and attributed; one-time baseline creation is atomic.
- [x] Concurrent run/scenario saves both survive; shared history is not automatically truncated to ten records.
- [x] Loading a baseline/scenario requires an explicit revision-checked shared change; run snapshots remain reproducible after later edits.
- [x] Real database adversarial tests and an owner-to-invitee browser journey pass, including revocation and cross-project denial.

## Verification boundary

Local PGlite tests and browser journeys cover the database contract and mocked Supabase boundary. A hosted Supabase project, OAuth provider, Realtime publication, and Vercel deployment remain to be verified with provisioned credentials.
