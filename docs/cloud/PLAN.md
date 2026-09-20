# FCM Studio cloud collaboration

## Problem Statement

Researchers currently edit one browser-local project. They cannot sign in from another device, invite participants, or safely edit the same map and matrix together. Replacing local autosave with cloud document upserts would overwrite concurrent work.

## Solution

Publish the existing application on Vercel with Supabase Google OAuth authentication, private project workspaces, email-bound invitation links, and synchronized editing. Retain the local application as a separate offline workspace. Use Infomaniak AI Services / Euria for optional reviewed AI proposals, with server-side access controls and spending limits.

## User Stories

1. As a researcher, I want Google login so I can access projects without an email delivery dependency.
2. As a researcher, I want a dashboard of projects I belong to so I can resume the correct workshop.
3. As an owner, I want to create a private project so other users cannot discover its research data.
4. As a researcher, I want to import my local project into cloud storage without destroying my local backup.
5. As a member, I want a saved cloud model to reopen after refresh or device change.
6. As an editor, I want map and matrix changes to reach other members without losing their edits.
7. As an editor, I want conflicting changes to be visible so I can resolve them deliberately.
8. As an owner, I want an invitation link bound to an email address and role so I control access.
9. As a viewer, I want to inspect and export research without changing shared data.
10. As an owner, I want to revoke membership and pending invitations.
11. As a researcher, I want immutable baselines, saved scenarios, and reproducible simulation runs.
12. As an editor, I want affordable AI proposals that require review and cannot overwrite newer work.

## Implementation Decisions

- **Tenant boundary:** each project is a tenant. Roles are owner, editor, and viewer. Owners manage invitations and membership; editors change research data; viewers read/export and may simulate locally without publishing a run. No organization layer in this release.
- **Authentication and navigation:** Supabase Google OAuth sign-in/callback, session restoration, logout, authenticated dashboard, and project view. Keep the offline workspace explicitly selectable. Cloud mode without configuration displays setup guidance and does not pretend to save remotely.
- **Persistence interface:** cloud repository exposes list, create, load, and later apply-command operations. Project creation atomically establishes owner membership and validated initial document. Cloud import creates a new project ID; imported IDs or role fields never confer authorization. The portable research document remains compatible with existing JSON export.
- **Slice 1 boundary:** a newly created or imported cloud project persists and renders its map and matrix read-only. Do not wire the current snapshot-based edit/autosave/undo code to remote writes. Local editing remains functional.
- **Database authorization:** project and membership records use RLS. Only authenticated members read a project; no anonymous access. Avoid recursive membership policies through narrowly scoped authorization helpers. Membership creation, role changes, and project mutations use checked transactional functions. No browser service-role key or arbitrary member insertion. Google ID token verification is handled by Supabase Auth; invitation acceptance reads the authenticated user's email and requires a non-null `auth.users.email_confirmed_at` server-side. Never trust a browser-supplied email or verification flag.
- **Shared commands:** apply a command with project ID, unique operation ID, expected revision, and a validated payload. Lock the project, check caller role, apply the operation, increment the authoritative revision, and record the actor atomically. Repeating an operation ID returns its original result. A stale revision returns a visible conflict and latest revision; never silently replace a peer's document.
- **Supported commands:** add/update/remove factor, set/remove relationship, move factor, update agenda/name, and deliberate model replacement. Matrix paste is one atomic batch. Full model replacement is reserved for reviewed AI acceptance or explicit scenario restoration. Undo uses a preconditioned inverse operation, never an old whole-document snapshot.
- **Realtime:** subscribe to committed project revisions and fetch an authorized snapshot; refresh after reconnect. Keep local pending edits separate from acknowledged state. Cloud editing is online-only initially. Clear in-memory cloud data on logout and stop editing after authorization failure; cache keys, if introduced, include user and project identity.
- **Research history:** baseline, scenarios, and runs are immutable project-scoped records with author/server timestamp. Establish an empty project's baseline once atomically; retain run snapshots and algorithm/settings. Loading a scenario or baseline is an explicit shared model change with revision checks. Do not retain the current automatic deletion of all but ten runs in shared history.
- **Invitations:** owners create a 7-day, single-use random link bound to normalized verified email and editor/viewer role. Store only a token hash; consume it transactionally, preventing reuse, expired/revoked acceptance, wrong-email acceptance, and role escalation. Display a copyable link; this task sends no invitation messages. No owner transfer or last-owner removal in this release.
- **AI:** authenticated Vercel functions verify editor/owner membership and fetch authoritative project data. Euria API key, product ID, and model remain server-side. Reserve durable per-user/project usage before requests, cap input/output, handle provider failure without model changes, and validate output. Proposal acceptance uses the same revision-checked command interface.
- **Hosting and cost:** use free Vercel and Supabase capacity; do not purchase or upgrade. Evaluate an available Euria model only within the product's displayed existing credit balance. Select a configured allowlisted model using current price and synthetic FCM evaluation results; do not label quality as verified before evaluation. Record the model ID and measured result at release, and fail closed when its budget is unavailable.

## Testing Decisions

Test external behaviors with existing Vitest and Playwright conventions. Use TDD for validation, repository contracts, authorization, command concurrency, invitations, and quota reservation. Exercise RLS/RPC using real separate authenticated identities in a local or isolated Supabase database; mocks alone do not prove isolation. Browser coverage stays focused on complete journeys. Existing local map/matrix, import, simulation, recovery, and stale-AI tests remain regressions. Never publish private research fixtures.

## Out of Scope

Organization billing, subscriptions, purchased hosting, invitation email sending, email/password or OTP login, SMTP setup, offline cloud-write queues, CRDT text editing, live cursor presence, and public anonymous AI are excluded. Free-tier service restrictions may limit availability; deployment success and live authentication must be reported separately from local checks.

## Delivery and workflow evidence

1. **AFK — authenticated dashboard and saved read-only cloud project**; no dependency; stories 1–5.
2. **AFK — safe shared map/matrix editing**; depends on 1; stories 6–7.
3. **AFK — invitations, roles, and research history**; depends on 2; stories 8–11.
4. **AFK — hosted Euria proposals and release**; depends on 3; story 12.

The dedicated planning agent read and applied the installed RoboBuilder Lite plan instructions (orient, PRD, vertical issues). Orientation used direct inspection of the existing application, model, AI service, and tests. Design grilling was already completed by the parent agent and confirmed choices are incorporated here. No native slash/Skill invocation occurred. Issue files are prepared for publication; they are not evidence that GitHub issues already exist. No implementation or deployment is claimed by this planning stage.
