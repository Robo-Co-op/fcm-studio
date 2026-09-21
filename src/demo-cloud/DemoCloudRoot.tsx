import { useReducer, useState, type ReactNode } from "react";
import type { Project } from "../model";
import {
  DemoCloudStore,
  createDemoControls,
  createDemoInvite,
  type DemoInvite,
  type DemoProjectSummary,
  type DemoRole,
  type DemoSharedControls,
} from "./demo-store";
import "../cloud/cloud.css";
import "./demo.css";

interface Props {
  renderLocal: (openCloud: () => void) => ReactNode;
  renderProject: (document: Project, controls: DemoSharedControls) => ReactNode;
}

function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      Demo mode — this is a mock preview. No real data or AI is used.
    </div>
  );
}

function RoleSwitcher({
  role,
  onChange,
}: {
  role: DemoRole;
  onChange: (role: DemoRole) => void;
}) {
  return (
    <select
      className="demo-role-switcher"
      value={role}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value as DemoRole)}
      aria-label="Demo role for this project"
    >
      <option value="owner">owner</option>
      <option value="editor">editor</option>
      <option value="viewer">viewer</option>
    </select>
  );
}

function DemoInvitePanel({ project }: { project: DemoProjectSummary }) {
  const [role, setRole] = useState<DemoRole>("editor");
  const [invite, setInvite] = useState<DemoInvite | null>(null);
  if (project.role !== "owner") return null;
  return (
    <div className="demo-invite">
      <span>Invite (demo only, no email is sent):</span>
      <select
        value={role}
        onChange={(event) => {
          setRole(event.target.value as DemoRole);
          setInvite(null);
        }}
      >
        <option value="editor">Editor</option>
        <option value="viewer">Viewer</option>
      </select>
      <button onClick={() => setInvite(createDemoInvite(project, role))}>
        Create invite link
      </button>
      {invite && (
        <span className="demo-invite-link">
          <input
            readOnly
            value={invite.url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(invite.url);
            }}
          >
            Copy
          </button>
        </span>
      )}
    </div>
  );
}

export function DemoCloudRoot({ renderLocal, renderProject }: Props) {
  const [store] = useState(() => new DemoCloudStore());
  const [local, setLocal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [twoEditor, setTwoEditor] = useState(false);
  const [, bump] = useReducer((value: number) => value + 1, 0);

  const withUpdate =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      fn(...args);
      bump();
    };
  const withUpdateAsync =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    async (...args: A) => {
      await fn(...args);
      bump();
    };

  const selectProject = (id: string | null) => {
    setSelectedId(id);
    setTwoEditor(false);
  };

  return (
    <>
      <DemoBanner />
      {renderBody()}
    </>
  );

  function renderBody(): ReactNode {
    if (local) return renderLocal(() => setLocal(false));

    if (selectedId) {
      const project = store.getProject(selectedId);
      if (!project) {
        selectProject(null);
        return null;
      }
      const buildControls = (): DemoSharedControls => {
        const base = createDemoControls(store, project, () =>
          selectProject(null),
        );
        return {
          ...base,
          onChange: withUpdate(base.onChange),
          onUndo: withUpdate(base.onUndo),
          onSaveBaseline: withUpdateAsync(base.onSaveBaseline),
          onSaveScenario: withUpdateAsync(base.onSaveScenario),
          onSaveRun: withUpdateAsync(base.onSaveRun),
        };
      };
      return (
        <>
          <div className="demo-toolbar">
            <span>
              Your demo role: <strong>{project.role}</strong>
            </span>
            <DemoInvitePanel project={project} />
            <button onClick={() => setTwoEditor((value) => !value)}>
              {twoEditor
                ? "Show one editor"
                : "Demo: show two editors side by side"}
            </button>
          </div>
          {twoEditor ? (
            <div className="demo-two-editor">
              <div className="demo-editor-column">
                {renderProject(project.document, buildControls())}
              </div>
              <div className="demo-editor-column">
                {renderProject(project.document, buildControls())}
              </div>
            </div>
          ) : (
            renderProject(project.document, buildControls())
          )}
        </>
      );
    }

    if (!store.user) return renderSignIn();

    return renderDashboard();
  }

  function renderSignIn(): ReactNode {
    return (
      <div className="cloud-page">
        <header className="cloud-header">
          <strong>
            FCM <span>Studio</span>
          </strong>
          <button onClick={() => setLocal(true)}>
            Return to local workspace
          </button>
        </header>
        <main className="cloud-main">
          <div className="cloud-eyebrow">
            PARTICIPATORY RESEARCH · CLOUD WORKSPACE (DEMO)
          </div>
          <h1>Think together. Map what matters.</h1>
          <p className="cloud-intro">
            A shared place for your questions, factors, and connections. This
            preview uses mock sign-in and mock projects only.
          </p>
          <section className="cloud-card cloud-login">
            <h2>Welcome to your research workspace</h2>
            <p>
              Sign in to see how private cloud projects, invitations, and
              shared editing look in FCM Studio.
            </p>
            <button
              className="cloud-primary"
              onClick={withUpdate(() => store.signIn())}
            >
              Continue with Google (demo)
            </button>
            <p className="cloud-note">
              Prefer this browser only? Return to the local workspace above.
            </p>
          </section>
        </main>
      </div>
    );
  }

  function renderDashboard(): ReactNode {
    const projects = store.listProjects();
    return (
      <div className="cloud-page">
        <header className="cloud-header">
          <strong>
            FCM <span>Studio</span>
          </strong>
          <button onClick={() => setLocal(true)}>
            Return to local workspace
          </button>
        </header>
        <main className="cloud-main">
          <div className="cloud-eyebrow">
            PARTICIPATORY RESEARCH · CLOUD WORKSPACE (DEMO)
          </div>
          <h1>Your research projects</h1>
          <div className="cloud-account">
            <span>Signed in as {store.user?.email}</span>
            <button onClick={withUpdate(() => store.signOut())}>
              Sign out
            </button>
          </div>
          <section className="cloud-card">
            <div className="cloud-list-heading">
              <h2>Your projects</h2>
              <span>{projects.length}</span>
            </div>
            <p className="demo-note">
              Role shown per project is a demo-only switch — change it to see
              how owner, editor, and viewer views differ.
            </p>
            <ul className="cloud-projects">
              {projects.map((project) => (
                <li key={project.id}>
                  <button onClick={() => selectProject(project.id)}>
                    <span>
                      <strong>{project.document.name}</strong>
                      <small>
                        {project.document.model.factors.length} factors ·{" "}
                        {project.document.model.relationships.length}{" "}
                        connections
                      </small>
                    </span>
                    <RoleSwitcher
                      role={project.role}
                      onChange={withUpdate((role: DemoRole) =>
                        store.setRole(project.id, role),
                      )}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </main>
      </div>
    );
  }
}
