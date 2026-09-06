# 03 — Invite participants and preserve shared research history

Type: AFK. Covers user stories 8–11 in the cloud PRD.

## What to build

Owners create email-bound editor/viewer invitation links and manage membership. Recipients authenticate and accept into the project. Add immutable baseline/scenario/run persistence integrated with the existing simulation workflow.

## Acceptance criteria

- [ ] Only owners create/revoke invitations or remove/change editor/viewer membership; no owner transfer or last-owner removal exists.
- [ ] Invitation tokens are random, hashed at rest, expire after seven days, and are consumed once transactionally.
- [ ] Recipient email from Supabase Auth must match the bound normalized email and have non-null `auth.users.email_confirmed_at`; browser-supplied emails or verification flags are ignored. Outsiders cannot inspect invite details through arbitrary queries.
- [ ] Wrong-email, expired, revoked, and reused links fail without creating membership or changing a role.
- [ ] UI exposes a copyable invitation link; implementation sends no invitation messages.
- [ ] Viewer can read/export and simulate locally but cannot edit or save a shared run; editor can edit/save but cannot manage membership.
- [ ] Baselines, scenarios, and runs are immutable, project-scoped, and attributed; one-time baseline creation is atomic.
- [ ] Concurrent run/scenario saves both survive; shared history is not automatically truncated to ten records.
- [ ] Loading a baseline/scenario requires an explicit revision-checked shared change; run snapshots remain reproducible after later edits.
- [ ] Real database adversarial tests and an owner-to-invitee browser journey pass, including revocation and cross-project denial.

## Blocked by

Issue 02 — safe shared commands and synchronization. Replace this local reference with the real tracker ID when publishing.
