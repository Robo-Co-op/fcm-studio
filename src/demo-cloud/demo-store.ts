import type { Factor, Model, Project } from "../model";

export interface DemoUser {
  id: string;
  name: string;
  email: string;
}

export type DemoRole = "owner" | "editor" | "viewer";

export interface DemoProjectSummary {
  id: string;
  role: DemoRole;
  document: Project;
}

const DEMO_USER: DemoUser = {
  id: "demo-user",
  name: "Demo Researcher",
  email: "demo.researcher@example.com",
};

function seedProject(
  id: string,
  role: DemoRole,
  name: string,
  agenda: string,
): DemoProjectSummary {
  const factors = [
    {
      id: `${id}-f1`,
      label: "Community trust",
      color: "#dbe7f4",
      x: 0,
      y: 0,
      provenance: "imported" as const,
    },
    {
      id: `${id}-f2`,
      label: "Program participation",
      color: "#e9dcef",
      x: 230,
      y: 0,
      provenance: "imported" as const,
    },
  ];
  const model = {
    factors,
    relationships: [
      {
        source: `${id}-f1`,
        target: `${id}-f2`,
        weight: 0.6,
        provenance: "imported" as const,
      },
    ],
  };
  return {
    id,
    role,
    document: {
      version: 1,
      id,
      name,
      agenda,
      revision: 0,
      model,
      baseline: model,
      scenarios: [],
      runs: [],
    },
  };
}

function createSeedProjects(): DemoProjectSummary[] {
  return [
    seedProject(
      "demo-owner-project",
      "owner",
      "Neighborhood resilience map",
      "What strengthens this neighborhood's ability to recover from shocks?",
    ),
    seedProject(
      "demo-editor-project",
      "editor",
      "Workshop follow-up model",
      "How do participation and trust reinforce each other?",
    ),
    seedProject(
      "demo-viewer-project",
      "viewer",
      "Shared baseline review",
      "A read-only research snapshot shared by the project owner.",
    ),
  ];
}

export class DemoCloudStore {
  private signedInUser: DemoUser | null = null;
  private projects: DemoProjectSummary[] = createSeedProjects();
  private history = new Map<string, Project>();

  get user(): DemoUser | null {
    return this.signedInUser;
  }

  signIn(): DemoUser {
    this.signedInUser = DEMO_USER;
    return this.signedInUser;
  }

  signOut(): void {
    this.signedInUser = null;
  }

  listProjects(): DemoProjectSummary[] {
    if (!this.signedInUser) return [];
    return this.projects.map((project) => structuredClone(project));
  }

  getProject(id: string): DemoProjectSummary | undefined {
    const project = this.projects.find((value) => value.id === id);
    return project ? structuredClone(project) : undefined;
  }

  private find(id: string): DemoProjectSummary | undefined {
    return this.projects.find((value) => value.id === id);
  }

  change(id: string, next: Project): void {
    const project = this.find(id);
    if (!project) return;
    this.history.set(id, structuredClone(project.document));
    project.document = { ...next, revision: project.document.revision + 1 };
  }

  canUndo(id: string): boolean {
    return this.history.has(id);
  }

  undo(id: string): void {
    const project = this.find(id);
    const previous = this.history.get(id);
    if (!project || !previous) return;
    project.document = previous;
    this.history.delete(id);
  }

  private update(id: string, updater: (document: Project) => Project): void {
    const project = this.find(id);
    if (!project) return;
    project.document = updater(project.document);
  }

  saveBaseline(id: string, model: Project["baseline"]): void {
    this.update(id, (document) => ({ ...document, baseline: model }));
  }

  saveScenario(id: string, scenario: Project["scenarios"][number]): void {
    this.update(id, (document) => ({
      ...document,
      scenarios: [...document.scenarios, scenario],
    }));
  }

  saveRun(id: string, run: Project["runs"][number]): void {
    this.update(id, (document) => ({
      ...document,
      runs: [...document.runs, run],
    }));
  }

  setRole(id: string, role: DemoRole): void {
    const project = this.find(id);
    if (!project) return;
    project.role = role;
  }
}

export interface DemoSharedControls {
  readOnly: boolean;
  role: DemoRole;
  status: string;
  onChange: (next: Project) => void;
  onUndo: () => void;
  canUndo: boolean;
  onBack: () => void;
  onSaveBaseline: (model: Project["baseline"]) => Promise<void>;
  onSaveScenario: (scenario: Project["scenarios"][number]) => Promise<void>;
  onSaveRun: (run: Project["runs"][number]) => Promise<void>;
  requestAiProposal: (projectId: string, instruction: string) => Promise<Response>;
}

export function createDemoControls(
  store: DemoCloudStore,
  project: DemoProjectSummary,
  onBack: () => void,
): DemoSharedControls {
  const id = project.id;
  return {
    readOnly: project.role === "viewer",
    role: project.role,
    status: "Demo project · not saved to the cloud",
    onChange: (next) => store.change(id, next),
    onUndo: () => store.undo(id),
    canUndo: store.canUndo(id),
    onBack,
    onSaveBaseline: async (model) => store.saveBaseline(id, model),
    onSaveScenario: async (scenario) => store.saveScenario(id, scenario),
    onSaveRun: async (run) => store.saveRun(id, run),
    requestAiProposal: async (projectId, instruction) => {
      const current = store.getProject(projectId);
      if (!current)
        return new Response(
          JSON.stringify({ error: "Demo project not found." }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      const proposal = generateDemoProposal(current.document, instruction);
      return new Response(
        JSON.stringify({
          revision: current.document.revision,
          model: proposal.model,
          summary: proposal.summary,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  };
}

export interface DemoInvite {
  role: DemoRole;
  token: string;
  url: string;
}

export function createDemoInvite(
  project: DemoProjectSummary,
  role: DemoRole,
  base: string = typeof window !== "undefined"
    ? window.location.origin + window.location.pathname
    : "",
): DemoInvite {
  const token = crypto.randomUUID();
  const url = `${base}#demo-invite=${token}&project=${encodeURIComponent(project.id)}&role=${role}`;
  return { role, token, url };
}

export interface DemoProposal {
  model: Model;
  summary: string;
}

function truncateLabel(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function generateDemoProposal(
  document: Project,
  instruction: string,
): DemoProposal {
  const trimmed = instruction.trim();
  const label = trimmed ? truncateLabel(trimmed) : "Participant engagement";
  const newFactor: Factor = {
    id: crypto.randomUUID(),
    label,
    color: "#f8dfbe",
    x: (document.model.factors.length % 4) * 230,
    y: Math.floor(document.model.factors.length / 4) * 130,
    provenance: "ai",
  };
  const anchor = document.model.factors[0];
  const model: Model = {
    factors: [...document.model.factors, newFactor],
    relationships: anchor
      ? [
          ...document.model.relationships,
          {
            source: anchor.id,
            target: newFactor.id,
            weight: 0.5,
            provenance: "ai",
            rationale: trimmed
              ? `Suggested from your instruction: "${trimmed}".`
              : "Suggested as a plausible related factor for this agenda.",
          },
        ]
      : document.model.relationships,
  };
  const summary = trimmed
    ? `Demo AI proposal: added "${label}" based on "${trimmed}" and linked it to an existing factor. Review and accept or reject before it changes the shared model.`
    : `Demo AI proposal: added a plausible new factor ("${label}") to illustrate how a reviewed AI suggestion looks. Review and accept or reject before it changes the shared model.`;
  return { model, summary };
}
