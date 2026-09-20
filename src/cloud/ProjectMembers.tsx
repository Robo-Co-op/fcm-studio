import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createInvitation,
  listProjectInvitations,
  listProjectMembers,
  removeProjectMember,
  revokeInvitation,
  updateProjectMemberRole,
  type InviteRole,
  type ProjectInvitation,
  type ProjectMember,
} from "./invitations";

interface Props {
  client: SupabaseClient;
  projectId: string;
}

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
      ? error.message
      : "The membership request failed. Please try again.";

export function ProjectMembers({ client, projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("editor");
  const [invitationLink, setInvitationLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    const [nextMembers, nextInvitations] = await Promise.all([
      listProjectMembers(client, projectId),
      listProjectInvitations(client, projectId),
    ]);
    setMembers(nextMembers);
    setInvitations(nextInvitations);
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    setBusy(true);
    setError("");
    void Promise.all([
      listProjectMembers(client, projectId),
      listProjectInvitations(client, projectId),
    ])
      .then(([nextMembers, nextInvitations]) => {
        if (!active) return;
        setMembers(nextMembers);
        setInvitations(nextInvitations);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [client, open, projectId]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const submitInvitation = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInvitationLink("");
    try {
      const invitation = await createInvitation(client, projectId, email, role);
      setInvitationLink(
        `${window.location.origin}${window.location.pathname}#invite=${encodeURIComponent(invitation.token)}`,
      );
      setEmail("");
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <button className="cloud-members-open" onClick={() => setOpen(true)}>
        Manage access
      </button>
    );

  const pending = invitations.filter(
    (invitation) => !invitation.consumedAt && !invitation.revokedAt,
  );

  return (
    <aside className="cloud-members" aria-label="Project access">
      <div className="cloud-members-heading">
        <div>
          <span className="cloud-eyebrow">PROJECT ACCESS</span>
          <h2>Members and invitations</h2>
        </div>
        <button
          onClick={() => {
            setInvitationLink("");
            setOpen(false);
          }}
        >
          Close
        </button>
      </div>

      {error && (
        <div className="cloud-error" role="alert">
          {error}
        </div>
      )}

      <form className="cloud-invite-form" onSubmit={submitInvitation}>
        <label>
          Email address
          <input
            type="email"
            required
            maxLength={320}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="participant@example.org"
          />
        </label>
        <label>
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as InviteRole)}
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <button className="cloud-primary" disabled={busy || !email.trim()}>
          Create invitation link
        </button>
      </form>

      {invitationLink && (
        <div className="cloud-invite-link" role="status">
          <strong>Copy this link now</strong>
          <p>It will not be shown again after you close this panel.</p>
          <div>
            <input
              aria-label="Invitation link"
              readOnly
              value={invitationLink}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(invitationLink).catch(() => {
                  setError("Copy failed. Select and copy the link manually.");
                });
              }}
            >
              Copy
            </button>
          </div>
        </div>
      )}

      <section>
        <h3>Current members</h3>
        {busy && members.length === 0 ? (
          <p role="status">Loading access…</p>
        ) : (
          <ul className="cloud-member-list">
            {members.map((member) => (
              <li key={member.userId}>
                <code>{member.userId}</code>
                {member.role === "owner" ? (
                  <span className="cloud-role">owner</span>
                ) : (
                  <div className="cloud-member-actions">
                    <select
                      aria-label={`Role for ${member.userId}`}
                      disabled={busy}
                      value={member.role}
                      onChange={(event) =>
                        void run(() =>
                          updateProjectMemberRole(
                            client,
                            projectId,
                            member.userId,
                            event.target.value as InviteRole,
                          ),
                        )
                      }
                    >
                      <option value="editor">editor</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          removeProjectMember(client, projectId, member.userId),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Pending invitations</h3>
        {pending.length === 0 ? (
          <p>No pending invitations.</p>
        ) : (
          <ul className="cloud-member-list">
            {pending.map((invitation) => (
              <li key={invitation.id}>
                <span>
                  <strong>{invitation.email}</strong>
                  <small>
                    {invitation.role} · expires{" "}
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </small>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      revokeInvitation(client, projectId, invitation.id),
                    )
                  }
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
