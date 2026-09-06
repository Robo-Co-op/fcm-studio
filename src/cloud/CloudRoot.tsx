import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { get } from "idb-keyval";
import { validateProject, type Project } from "../model";
import { getCloudClient } from "./client";
import { createProjectRepository, type CloudProject } from "./repository";
import { SharedProject, type SharedControls } from "./SharedProject";
import "./cloud.css";
interface Props {
  renderLocal: (openCloud: () => void) => ReactNode;
  renderProject: (document: Project, controls: SharedControls) => ReactNode;
}
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The cloud request failed. Please try again.";
export function CloudRoot({ renderLocal, renderProject }: Props) {
  const [client] = useState(getCloudClient);
  const [local, setLocal] = useState(!client);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(!!client);
  const [projects, setProjects] = useState<CloudProject[]>([]);
  const [selected, setSelected] = useState<CloudProject | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [agenda, setAgenda] = useState("");
  const generation = useRef(0);
  const authUserId = useRef<string | null>(null);
  const userId = session?.user.id;
  useEffect(() => {
    if (!client) return;
    let active = true;
    let eventReceived = false;
    const applySession = (next: Session | null) => {
      if (next && authUserId.current === next.user.id) {
        setSession(next);
        setAuthLoading(false);
        return;
      }
      authUserId.current = next?.user.id ?? null;
      generation.current++;
      setSession(next);
      setSelected(null);
      setProjects([]);
      setName("");
      setAgenda("");
      setBusy(false);
      setError("");
      setAuthLoading(false);
    };
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => {
      eventReceived = true;
      if (active) applySession(next);
    });
    void client.auth
      .getSession()
      .then(({ data, error: authError }) => {
        if (!active || eventReceived) return;
        applySession(data.session);
        if (authError) setError(authError.message);
      })
      .catch((cause: unknown) => {
        if (active && !eventReceived) {
          setError(errorMessage(cause));
          setAuthLoading(false);
        }
      });
    return () => {
      active = false;
      generation.current++;
      subscription.unsubscribe();
    };
  }, [client]);
  useEffect(() => {
    if (!client || !userId || local) return;
    const ticket = ++generation.current;
    setBusy(true);
    void createProjectRepository(client, userId)
      .list()
      .then((rows) => {
        if (ticket === generation.current) setProjects(rows);
      })
      .catch((cause: unknown) => {
        if (ticket === generation.current) setError(errorMessage(cause));
      })
      .finally(() => {
        if (ticket === generation.current) setBusy(false);
      });
    return () => {
      generation.current++;
    };
  }, [client, userId, local]);
  const work = async (operation: () => Promise<CloudProject>) => {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const project = await operation();
      if (ticket === generation.current) {
        setSelected(project);
        setProjects((previous) => [
          project,
          ...previous.filter((p) => p.id !== project.id),
        ]);
      }
    } catch (cause) {
      if (ticket === generation.current) setError(errorMessage(cause));
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  };
  const offline = () => {
    generation.current++;
    setSelected(null);
    setProjects([]);
    setBusy(false);
    setError("");
    setLocal(true);
  };
  if (local) return renderLocal(() => setLocal(false));
  if (selected && client && userId)
    return (
      <SharedProject
        client={client}
        userId={userId}
        project={selected}
        onBack={() => setSelected(null)}
        render={renderProject}
      />
    );
  const repository =
    client && userId ? createProjectRepository(client, userId) : null;
  return (
    <div className="cloud-page">
      <header className="cloud-header">
        <strong>
          FCM <span>Studio</span>
        </strong>
        <button onClick={offline}>Return to local workspace</button>
      </header>
      <main className="cloud-main">
        <div className="cloud-eyebrow">
          PARTICIPATORY RESEARCH · CLOUD WORKSPACE
        </div>
        <h1>
          {!client
            ? "Cloud setup needed"
            : session
              ? "Your research projects"
              : "Think together. Map what matters."}
        </h1>
        <p className="cloud-intro">
          A shared place for your questions, factors, and connections. Each
          project is private to its members.
        </p>
        {error && (
          <div role="alert" className="cloud-error">
            {error}
          </div>
        )}
        {!client ? (
          <section className="cloud-card">
            <h2>Cloud workspace is not configured</h2>
            <p>
              This deployment needs Supabase configuration before sign-in is
              available. Your local workspace and saved research remain
              available on this browser.
            </p>
          </section>
        ) : authLoading ? (
          <p role="status">Restoring your session…</p>
        ) : !session ? (
          <section className="cloud-card cloud-login">
            <h2>Welcome to your research workspace</h2>
            <p>
              Sign in to create private cloud projects and reopen them on
              another device.
            </p>
            <button
              className="cloud-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const { error: loginError } =
                    await client.auth.signInWithOAuth({
                      provider: "google",
                      options: {
                        redirectTo:
                          window.location.origin + window.location.pathname,
                      },
                    });
                  if (loginError) throw loginError;
                } catch (cause) {
                  setError(errorMessage(cause));
                  setBusy(false);
                }
              }}
            >
              Continue with Google
            </button>
            <p className="cloud-note">
              Prefer this browser only? Return to the local workspace above.
            </p>
          </section>
        ) : (
          <>
            <div className="cloud-account">
              <span>Signed in as {session.user.email ?? "researcher"}</span>
              <button
                onClick={async () => {
                  generation.current++;
                  setSelected(null);
                  setProjects([]);
                  setBusy(true);
                  setError("");
                  const { error: logoutError } = await client.auth.signOut();
                  setBusy(false);
                  if (logoutError) setError(logoutError.message);
                }}
              >
                Sign out
              </button>
            </div>
            <div className="cloud-columns">
              <section className="cloud-card">
                <h2>Start a project</h2>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!repository) return;
                    void work(() =>
                      repository.create({
                        version: 1,
                        id: crypto.randomUUID(),
                        name: name.trim(),
                        agenda,
                        revision: 0,
                        model: { factors: [], relationships: [] },
                        baseline: { factors: [], relationships: [] },
                        scenarios: [],
                        runs: [],
                      }),
                    );
                  }}
                >
                  <label>
                    Project name
                    <input
                      required
                      maxLength={16000}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="A question worth exploring"
                    />
                  </label>
                  <label>
                    Research agenda
                    <textarea
                      maxLength={16000}
                      value={agenda}
                      onChange={(event) => setAgenda(event.target.value)}
                      placeholder="What would your group like to understand?"
                    />
                  </label>
                  <button
                    className="cloud-primary"
                    disabled={busy || !name.trim()}
                  >
                    Create private project
                  </button>
                </form>
                <div className="cloud-import">
                  <h3>Bring your local research</h3>
                  <p>
                    Make a cloud copy of the project saved in this browser. Your
                    local original stays intact.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (repository)
                        void work(async () => {
                          const document: unknown =
                            await get("fcm-studio-project");
                          if (!document)
                            throw new Error(
                              "No local project is saved in this browser.",
                            );
                          validateProject(document);
                          return repository.create(document);
                        });
                    }}
                  >
                    Import local project
                  </button>
                </div>
              </section>
              <section className="cloud-card">
                <div className="cloud-list-heading">
                  <h2>Your projects</h2>
                  <span>{projects.length}</span>
                </div>
                {busy && <p role="status">Connecting to your workspace…</p>}
                {!busy && !projects.length && (
                  <p className="cloud-empty">
                    Your next research question starts here. Create a project or
                    import your local map.
                  </p>
                )}
                <ul className="cloud-projects">
                  {projects.map((project) => (
                    <li key={project.id}>
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (repository)
                            void work(() => repository.load(project.id));
                        }}
                      >
                        <span>
                          <strong>{project.document.name}</strong>
                          <small>
                            {project.document.model.factors.length} factors ·{" "}
                            {project.document.model.relationships.length}{" "}
                            connections
                          </small>
                        </span>
                        <span className="cloud-role">{project.role}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
