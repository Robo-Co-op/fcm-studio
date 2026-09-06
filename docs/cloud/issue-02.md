# 02 — Edit shared maps and matrices without lost updates

Type: AFK. Covers user stories 6–7 in the cloud PRD.

## What to build

Enable owner/editor cloud editing through validated atomic commands and authoritative revisions, then propagate committed changes to other sessions through Realtime. Use database test fixtures for multiple members until invitation UI ships. Replace snapshot undo for cloud mode with preconditioned inverse operations.

## Acceptance criteria

- [ ] Factor, relationship, position, agenda/name, and matrix paste changes use one command boundary with operation ID and expected revision.
- [ ] Server-side role checks reject viewers, outsiders, and revoked members independently of UI.
- [ ] Concurrent requests cannot silently overwrite acknowledged edits; stale operations return an explicit conflict while preserving the attempted local change for review.
- [ ] Retrying the same operation ID does not apply it twice or increment the revision twice.
- [ ] Factor deletion cascades its relationships atomically; conflicting edge additions cannot create dangling references.
- [ ] Two browser sessions receive committed changes and maintain matching map/matrix state; reconnect refreshes missed revisions.
- [ ] Offline/error states do not say saved; no stale full-document write is automatically replayed.
- [ ] Undo refuses stale preconditions and cannot restore a peer's older document.
- [ ] Tests prove distinct-factor conflicts preserve data, same-cell conflicts are visible, paste is atomic, and revocation denies further reads/writes.
- [ ] Existing offline mode remains separate and regression tests pass.

## Blocked by

Issue 01 — authenticated private project persistence. Replace this local reference with the real tracker ID when publishing.
