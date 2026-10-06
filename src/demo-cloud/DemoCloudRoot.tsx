import { useReducer, useRef, useState, type ReactNode } from "react";
import type { Project } from "../model";
import type { DemoImport, DemoProjectInput } from "./demo-import";
import {
  DemoCloudStore,
  MAX_AGENDA,
  MAX_NAME,
  createDemoControls,
  createDemoInvite,
  type DemoInvite,
  type DemoProjectSummary,
  type DemoRole,
  type DemoSharedControls,
  type DemoStorage,
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
      Demo mode — sign-in and sharing are simulated. Projects stay in this
      browser; AI proposals may use a live model.
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

type WorkbookPreview = Extract<DemoImport, { kind: "workbook" }>;

// 一部のブラウザ設定では localStorage へのアクセス自体が例外になる
function browserStorage(): DemoStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const MAX_SHOWN_ISSUES = 50;

function DemoImportPanel({
  onCreate,
  onError,
}: {
  onCreate: (input: DemoProjectInput) => void;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<WorkbookPreview | null>(null);
  const [transpose, setTranspose] = useState(false);
  const [busy, setBusy] = useState(false);

  const read = async (file: File) => {
    setBusy(true);
    try {
      const { readDemoImport } = await import("./demo-import");
      const result = await readDemoImport(file);
      if (result.kind === "project") {
        setPending(null);
        onCreate(result.input);
      } else {
        setTranspose(false);
        setPending(result);
      }
    } catch (failure) {
      onError((failure as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const accept = async () => {
    if (!pending) return;
    try {
      const { workbookToProjectInput } = await import("./demo-import");
      onCreate(
        workbookToProjectInput(pending.preview, transpose, pending.fileName),
      );
      setPending(null);
    } catch (failure) {
      onError((failure as Error).message);
    }
  };

  const preview = pending?.preview;
  return (
    <div className="cloud-import">
      <h3>Import a workbook</h3>
      <p>
        Start from an Excel weight matrix (.xlsx) or an FCM Studio backup
        (.json). The file stays in this browser.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.json"
        hidden
        aria-label="Workbook file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void read(file);
        }}
      />
      <button disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? "Reading…" : "Choose .xlsx or .json"}
      </button>
      {preview && (
        <div className="demo-import-preview" aria-label="Import preview">
          <h4>
            {preview.sheet} · {preview.labels.length} factors
          </h4>
          <p className="cloud-note">Detected range: {preview.range}</p>
          {preview.agenda && <p>{preview.agenda}</p>}
          <label>
            Matrix direction
            <select
              value={String(transpose)}
              onChange={(event) => setTranspose(event.target.value === "true")}
            >
              <option value="false">
                Rows are sources → columns are targets
              </option>
              <option value="true">
                Columns are sources → rows are targets
              </option>
            </select>
          </label>
          <div className="demo-import-labels">
            {preview.labels.map((label, index) => (
              <span key={index}>{label}</span>
            ))}
          </div>
          {preview.issues.length > 0 && (
            <div className="cloud-error" role="alert">
              {preview.issues.slice(0, MAX_SHOWN_ISSUES).map((issue, index) => (
                <p key={index}>{issue}</p>
              ))}
              {preview.issues.length > MAX_SHOWN_ISSUES && (
                <p>
                  …and {preview.issues.length - MAX_SHOWN_ISSUES} more issues.
                </p>
              )}
              <p>Fix these cells in the workbook and choose it again.</p>
            </div>
          )}
          <div className="demo-import-actions">
            <button onClick={() => setPending(null)}>Cancel</button>
            <button
              className="cloud-primary"
              disabled={preview.issues.length > 0}
              onClick={() => void accept()}
            >
              Create project from workbook
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DemoCloudRoot({ renderLocal, renderProject }: Props) {
  const [store] = useState(() => new DemoCloudStore(browserStorage()));
  const [local, setLocal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [twoEditor, setTwoEditor] = useState(false);
  const [name, setName] = useState("");
  const [agenda, setAgenda] = useState("");
  const [error, setError] = useState("");
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
              Sign in to see how private cloud projects, invitations, and shared
              editing look in FCM Studio.
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
            <button
              onClick={withUpdate(() => {
                if (
                  window.confirm(
                    "Reset the demo? Projects you created or changed in this browser will be removed.",
                  )
                )
                  store.reset();
              })}
            >
              Reset demo
            </button>
          </div>
          {error && (
            <p className="cloud-error" role="alert">
              {error}
            </p>
          )}
          <div className="cloud-columns">
            <section className="cloud-card">
              <h2>Start a project</h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  try {
                    const created = store.createProject({ name, agenda });
                    setName("");
                    setAgenda("");
                    setError("");
                    selectProject(created.id);
                  } catch (failure) {
                    setError(
                      failure instanceof Error
                        ? failure.message
                        : String(failure),
                    );
                  }
                }}
              >
                <label>
                  Project name
                  <input
                    required
                    maxLength={MAX_NAME}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="A question worth exploring"
                  />
                </label>
                <label>
                  Research agenda
                  <textarea
                    maxLength={MAX_AGENDA}
                    value={agenda}
                    onChange={(event) => setAgenda(event.target.value)}
                    placeholder="What would your group like to understand?"
                  />
                </label>
                <button className="cloud-primary" disabled={!name.trim()}>
                  Create project
                </button>
              </form>
              <DemoImportPanel
                onCreate={(input) => {
                  const created = store.createProject(input);
                  setError("");
                  selectProject(created.id);
                }}
                onError={setError}
              />
            </section>
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
          </div>
        </main>
      </div>
    );
  }
}
