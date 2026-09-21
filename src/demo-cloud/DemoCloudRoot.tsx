import { useReducer, useState, type ReactNode } from "react";
import type { Project } from "../model";
import {
  DemoCloudStore,
  createDemoControls,
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

export function DemoCloudRoot({ renderLocal, renderProject }: Props) {
  const [store] = useState(() => new DemoCloudStore());
  const [local, setLocal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
        setSelectedId(null);
        return null;
      }
      const base = createDemoControls(store, project, () =>
        setSelectedId(null),
      );
      const controls: DemoSharedControls = {
        ...base,
        onChange: withUpdate(base.onChange),
        onUndo: withUpdate(base.onUndo),
        onSaveBaseline: withUpdateAsync(base.onSaveBaseline),
        onSaveScenario: withUpdateAsync(base.onSaveScenario),
        onSaveRun: withUpdateAsync(base.onSaveRun),
      };
      return renderProject(project.document, controls);
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
            <ul className="cloud-projects">
              {projects.map((project) => (
                <li key={project.id}>
                  <button onClick={() => setSelectedId(project.id)}>
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
        </main>
      </div>
    );
  }
}
