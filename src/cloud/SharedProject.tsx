import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Model, Project, Run, Scenario } from "../model";
import { parseCloudProject, type CloudProject } from "./repository";
import { SharedSession, type PendingCommand } from "./shared-session";
import { ProjectMembers } from "./ProjectMembers";
import {
  loadProjectHistory,
  saveProjectBaseline,
  saveProjectRun,
  saveProjectScenario,
  type ProjectHistory,
} from "./history";

export interface SharedControls {
  readOnly: boolean;
  role: CloudProject["role"];
  status: string;
  onChange: (next: Project) => void;
  onUndo: () => void;
  canUndo: boolean;
  onBack: () => void;
  onSaveBaseline: (model: Model) => Promise<void>;
  onSaveScenario: (scenario: Scenario) => Promise<void>;
  onSaveRun: (run: Run) => Promise<void>;
  requestAiProposal: (projectId: string, instruction: string) => Promise<Response>;
}

interface Props {
  client: SupabaseClient;
  userId: string;
  project: CloudProject;
  onBack: () => void;
  render: (document: Project, controls: SharedControls) => ReactNode;
}

function downloadDraft(project: Project) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.name.replace(/[^a-z0-9-]+/gi, "-") || "fcm-draft"}-unsaved.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SharedProject({
  client,
  userId,
  project,
  onBack,
  render,
}: Props) {
  const [, update] = useReducer((value) => value + 1, 0);
  const [history, setHistory] = useState<ProjectHistory>({
    baseline: null,
    scenarios: [],
    runs: [],
  });
  const [historyError, setHistoryError] = useState("");
  const historyGeneration = useRef(0);
  const session = useMemo(
    () =>
      new SharedSession(
        {
          load: async (id) => {
            const { data, error } = await client
              .from("projects")
              .select("id,document,revision,project_members!inner(role)")
              .eq("project_members.user_id", userId)
              .eq("id", id)
              .single();
            if (error) throw error;
            return parseCloudProject(data);
          },
          apply: async (id, operation: PendingCommand) => {
            const { data, error } = await client.rpc("apply_project_command", {
              p_project_id: id,
              p_operation_id: operation.id,
              p_expected_revision: operation.revision,
              p_command: operation.command,
            });
            if (error) throw error;
            const loaded = await client
              .from("projects")
              .select("id,document,revision,project_members!inner(role)")
              .eq("project_members.user_id", userId)
              .eq("id", id)
              .single();
            if (loaded.error) throw loaded.error;
            return parseCloudProject(loaded.data ?? data);
          },
        },
        project.id,
        update,
      ),
    [client, project.id, userId],
  );

  const refreshHistory = useCallback(async () => {
    const ticket = ++historyGeneration.current;
    try {
      const next = await loadProjectHistory(client, project.id);
      if (ticket !== historyGeneration.current) return;
      setHistory(next);
      setHistoryError("");
    } catch {
      if (ticket === historyGeneration.current)
        setHistoryError("Shared research history is temporarily unavailable.");
    }
  }, [client, project.id]);

  useEffect(() => {
    void refreshHistory();
    return () => {
      historyGeneration.current++;
    };
  }, [refreshHistory]);

  useEffect(() => {
    const refresh = () => {
      void session.refresh();
      void refreshHistory();
    };
    const online = () => {
      session.setOnline(true);
      refresh();
    };
    const offline = () => session.setOnline(false);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const timer = window.setInterval(refresh, 10_000);
    const channel = client
      .channel(`project:${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `id=eq.${project.id}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_baselines",
          filter: `project_id=eq.${project.id}`,
        },
        () => void refreshHistory(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_scenarios",
          filter: `project_id=eq.${project.id}`,
        },
        () => void refreshHistory(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_runs",
          filter: `project_id=eq.${project.id}`,
        },
        () => void refreshHistory(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    // 購読を登録してから初回取得し、接続完了時にも再取得して隙間を埋める。
    refresh();
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [client, project.id, refreshHistory, session]);

  if (!session.state.current && session.state.error)
    return (
      <main className="cloud-access-lost">
        <h1>Project access unavailable</h1>
        <p>{session.state.error}</p>
        <button onClick={onBack}>Back to projects</button>
      </main>
    );
  const current = session.state.current ?? project;
  const scenarioIds = new Set(current.document.scenarios.map(({ id }) => id));
  const runIds = new Set(current.document.runs.map(({ id }) => id));
  const document: Project = {
    ...current.document,
    baseline: history.baseline ?? current.document.baseline,
    scenarios: [
      ...current.document.scenarios,
      ...history.scenarios.filter(({ id }) => !scenarioIds.has(id)),
    ],
    runs: [
      ...current.document.runs,
      ...history.runs.filter(({ id }) => !runIds.has(id)),
    ],
  };
  const saveHistory = async (operation: () => Promise<void>) => {
    await operation();
    await refreshHistory();
  };
  const controls: SharedControls = {
    readOnly: session.readOnly,
    role: current.role,
    status: session.state.pending
      ? "Saving to cloud…"
      : session.state.error
        ? "Cloud change needs attention"
        : session.readOnly
          ? "Cloud project · read only"
          : `Saved to cloud · revision ${current.revision}`,
    onChange: (next) => void session.change(next),
    onUndo: () => void session.undo(),
    canUndo: session.canUndo,
    onBack,
    onSaveBaseline: (model) =>
      saveHistory(() => saveProjectBaseline(client, current.id, model)),
    onSaveScenario: (scenario) =>
      saveHistory(() =>
        saveProjectScenario(client, current.id, scenario, current.revision),
      ),
    onSaveRun: (run) =>
      saveHistory(() =>
        saveProjectRun(client, current.id, run, current.revision),
      ),
    requestAiProposal: async (projectId, instruction) => {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign in to request an AI proposal.");
      return fetch("/api/draft", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId, instruction }),
        signal: AbortSignal.timeout(55000),
      });
    },
  };
  return (
    <>
      {current.role === "owner" && (
        <ProjectMembers client={client} projectId={current.id} />
      )}
      {session.state.error && (
        <div className="cloud-conflict" role="alert">
          <strong>{session.state.error}</strong>
          {session.state.draft && (
            <button onClick={() => downloadDraft(session.state.draft!)}>
              Export unsaved draft
            </button>
          )}
          {session.state.uncertain && (
            <button onClick={() => void session.retryUncertain()}>
              Retry same save
            </button>
          )}
          {session.state.draft && !session.state.uncertain && (
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Apply this complete draft over the latest shared model? Export it first if you need a backup.",
                  )
                )
                  void session.applyDraftAgainstLatest();
              }}
            >
              Apply my draft over latest
            </button>
          )}
          {session.state.draft && (
            <button onClick={() => void session.discardDraft()}>
              Discard unsaved draft
            </button>
          )}
          <button onClick={() => void session.refresh()}>Load latest</button>
        </div>
      )}
      {historyError && (
        <div className="cloud-history-error" role="alert">
          {historyError}
          <button onClick={() => void refreshHistory()}>Retry</button>
        </div>
      )}
      {render(document, controls)}
    </>
  );
}
