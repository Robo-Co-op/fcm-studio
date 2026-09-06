# 01 — Sign in and reopen a private cloud project

Type: AFK. Covers user stories 1–5 in the cloud PRD.

## What to build

Complete Google OAuth sign-in, authenticated project dashboard, private project creation, and explicit import of an existing local project. A cloud project must persist and render its map/matrix read-only; keep the existing editable offline application separately accessible. Include schema, RLS, atomic create operation, repository adapter, UI, and tests.

## Acceptance criteria

- [ ] Complete Google sign-in and callback, restore a valid session, and log out with cloud state cleared.
- [ ] With no cloud configuration, show an honest unavailable/setup state while offline mode works.
- [ ] Create a private project and owner membership atomically; a failed creation leaves neither orphan data nor partial membership.
- [ ] Dashboard lists only the signed-in user's projects; loading another user's ID and direct database queries are denied by RLS.
- [ ] Import a validated local research document as a new cloud project, preserving factors, weights, baseline, scenarios, and runs; retain the original local backup.
- [ ] Imported ownership, membership, or project identity cannot change cloud authorization.
- [ ] Refresh restores the persisted project and renders correct map/matrix data; cloud editing controls are visibly disabled in this slice.
- [ ] Failed reads/writes display errors and never report successful cloud saving.
- [ ] Unit/contract tests and focused browser flow pass; real database isolation tests cover two distinct users and unauthenticated access.
- [ ] Existing offline editing, JSON/Excel import/export, simulation, and recovery tests remain passing.

## Blocked by

None — can start immediately. Live Google login validation depends on configured Supabase and Google OAuth callback URLs; report local and live evidence separately.
