import {
  validateModel,
  validateProject,
  type Factor,
  type Model,
  type Project,
} from "../model";

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

export const MAX_NAME = 200;
export const MAX_AGENDA = 16000;

const ROLES: unknown[] = ["owner", "editor", "viewer"];

export const DEMO_STORAGE_KEY = "fcm-studio-demo-v1";

export type DemoStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class DemoCloudStore {
  private signedInUser: DemoUser | null = null;
  private projects: DemoProjectSummary[];
  private history = new Map<string, Project>();

  constructor(private readonly storage?: DemoStorage) {
    this.projects = this.load() ?? createSeedProjects();
  }

  // 保存データは利用者のブラウザ由来で信用しない。壊れていれば seed に戻す
  private load(): DemoProjectSummary[] | undefined {
    try {
      const saved = this.storage?.getItem(DEMO_STORAGE_KEY);
      if (!saved) return undefined;
      const projects: unknown = JSON.parse(saved);
      if (!Array.isArray(projects) || projects.length === 0) return undefined;
      for (const project of projects) {
        if (
          typeof project !== "object" ||
          project === null ||
          !ROLES.includes(project.role)
        )
          return undefined;
        validateProject(project.document);
        if (project.id !== project.document.id) return undefined;
      }
      const ids = new Set(projects.map((project) => project.id));
      if (ids.size !== projects.length) return undefined;
      return projects as DemoProjectSummary[];
    } catch {
      return undefined;
    }
  }

  reset(): void {
    this.projects = createSeedProjects();
    this.history.clear();
    try {
      this.storage?.removeItem(DEMO_STORAGE_KEY);
    } catch {
      // 削除できなくても、このセッションは初期状態で続く
    }
  }

  // プライベートブラウズや容量超過で保存できなくても、デモはメモリ上で動き続ける
  private save(): void {
    try {
      this.storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(this.projects));
    } catch {
      // 保存失敗は無視する
    }
  }

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

  createProject(input: {
    name: string;
    agenda: string;
    model?: Model;
  }): DemoProjectSummary {
    if (!this.signedInUser)
      throw new Error("Please sign in to create a project.");
    const name = input.name.trim();
    if (!name) throw new Error("Project name is required.");
    if (name.length > MAX_NAME)
      throw new Error(`Project name must be ${MAX_NAME} characters or fewer.`);
    if (input.agenda.length > MAX_AGENDA)
      throw new Error(
        `Research agenda must be ${MAX_AGENDA} characters or fewer.`,
      );
    const id = crypto.randomUUID();
    const model: Model = { factors: [], relationships: [] };
    if (input.model) {
      validateModel(input.model);
      Object.assign(model, structuredClone(input.model));
    }
    const project: DemoProjectSummary = {
      id,
      role: "owner",
      document: {
        version: 1,
        id,
        name,
        agenda: input.agenda,
        revision: 0,
        model,
        baseline: structuredClone(model),
        scenarios: [],
        runs: [],
      },
    };
    this.projects.unshift(project);
    this.save();
    return structuredClone(project);
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
    this.save();
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
    this.save();
  }

  private update(id: string, updater: (document: Project) => Project): void {
    const project = this.find(id);
    if (!project) return;
    project.document = updater(project.document);
    this.save();
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
    this.save();
  }
}

export interface DemoSharedControls {
  readOnly: boolean;
  allowImport: boolean;
  role: DemoRole;
  status: string;
  onChange: (next: Project) => void;
  onUndo: () => void;
  canUndo: boolean;
  onBack: () => void;
  onSaveBaseline: (model: Project["baseline"]) => Promise<void>;
  onSaveScenario: (scenario: Project["scenarios"][number]) => Promise<void>;
  onSaveRun: (run: Project["runs"][number]) => Promise<void>;
  requestAiProposal: (
    projectId: string,
    instruction: string,
  ) => Promise<Response>;
}

export interface DemoAiResult {
  revision: number;
  model: Model;
  summary: string;
}

// 実AIプロバイダ(/api/demo-draft、サーバー側でVITE_接頭辞なしのキーを使う)を先に試し、
// 未設定・失敗・ネットワーク不通のいずれでも常にモックへ静かにフォールバックする。
export async function requestDemoAiProposal(
  document: Project,
  instruction: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DemoAiResult> {
  try {
    const response = await fetchImpl("/api/demo-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agenda: document.agenda,
        instruction,
        revision: document.revision,
        model: document.model,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) return (await response.json()) as DemoAiResult;
  } catch {
    // ネットワーク不通・タイムアウト等は下のローカルモックへフォールバックする。
  }
  const proposal = generateDemoProposal(document, instruction);
  return {
    revision: document.revision,
    model: proposal.model,
    summary: proposal.summary,
  };
}

export function createDemoControls(
  store: DemoCloudStore,
  project: DemoProjectSummary,
  onBack: () => void,
): DemoSharedControls {
  const id = project.id;
  return {
    readOnly: project.role === "viewer",
    allowImport: project.role !== "viewer",
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
      const data = await requestDemoAiProposal(current.document, instruction);
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
