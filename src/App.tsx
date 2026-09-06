import { useCallback, useEffect, useRef, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import type { Connection, NodeProps } from "@xyflow/react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  CircleHelp,
  GitBranch,
  Grid2X2,
  Layers,
  Maximize2,
  Network,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  X,
  Check,
  FlaskConical,
  Download,
} from "lucide-react";
import { get, set } from "idb-keyval";
import { toPng, toSvg } from "html-to-image";
import {
  addFactor,
  clone,
  COLORS,
  id,
  removeFactor,
  setWeight,
  validateModel,
  validateProject,
} from "./model";
import type { Model, Project, Run, SimulationResult } from "./model";
import { demoProject } from "./demo";
import { describeChanges } from "./proposals";
import type { ImportPreview } from "./excel";

function FactorNode({ data, selected }: NodeProps) {
  return (
    <div
      className={`factor-node ${selected ? "selected" : ""}`}
      style={{ background: String(data.color) }}
    >
      <Handle type="target" position={Position.Left} />
      <span className="factor-node-index">
        FACTOR {String(data.index).padStart(2, "0")}
      </span>
      <strong>{String(data.label)}</strong>
      <span className="factor-node-meta">
        {String(data.connections)} connections
        {data.provenance === "ai" ? " · AI hypothesis" : ""}
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { factor: FactorNode };
const presets = [-0.9, -0.7, -0.3, -0.1, 0, 0.1, 0.3, 0.7, 0.9];
const pairKey = (s: string, t: string) => JSON.stringify([s, t]);
function download(data: BlobPart, name: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function safeName(name: string) {
  return name.replace(/[^a-z0-9-]+/gi, "-").slice(0, 80) || "fcm-project";
}
function WeightCell({
  value,
  label,
  onChange,
  onSelect,
  active,
}: {
  value: number;
  label: string;
  onChange: (n: number) => void;
  onSelect: () => void;
  active: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const cancel = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (cancel.current) {
      cancel.current = false;
      setDraft(String(value));
      return;
    }
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n) && n >= -1 && n <= 1) {
      onChange(n);
    } else {
      setDraft(String(value));
    }
  };
  return (
    <input
      aria-label={label}
      className={`${value > 0 ? "positive" : value < 0 ? "negative" : "zero"} ${active ? "active-cell" : ""}`}
      value={draft}
      onFocus={onSelect}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          cancel.current = true;
          setDraft(String(value));
          e.currentTarget.blur();
        }
        if (
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
        ) {
          const td = e.currentTarget.closest("td");
          const tr = td?.parentElement;
          const row = (tr?.parentElement as HTMLTableSectionElement | undefined)
            ?.rows;
          const ri =
            (tr as HTMLTableRowElement | undefined)?.sectionRowIndex ?? 0;
          const ci = (td as HTMLTableCellElement | undefined)?.cellIndex ?? 0;
          const next =
            e.key === "ArrowUp"
              ? row?.[ri - 1]?.cells[ci]
              : e.key === "ArrowDown"
                ? row?.[ri + 1]?.cells[ci]
                : tr?.children[ci + (e.key === "ArrowLeft" ? -1 : 1)];
          const input = next?.querySelector("input");
          if (input) {
            e.preventDefault();
            input.focus();
          }
        }
      }}
    />
  );
}
export default function App() {
  const [project, setProject] = useState<Project>(demoProject);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Loading…");
  const [restoreBlocked, setRestoreBlocked] = useState(false);
  const [past, setPast] = useState<Model[]>([]);
  const [future, setFuture] = useState<Model[]>([]);
  const [tab, setTab] = useState<"map" | "split" | "matrix">("split");
  const [panel, setPanel] = useState<"inspector" | "simulation" | "ai">(
    "inspector",
  );
  const [selected, setSelected] = useState<{
    source: string;
    target: string;
  } | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [dragPositions, setDragPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState<
    "factor" | "import" | "help" | "export" | "new" | null
  >(null);
  const [factorName, setFactorName] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [transpose, setTranspose] = useState(false);
  const [initial, setInitial] = useState<Record<string, number>>({});
  const [clamped, setClamped] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Run | null>(null);
  const [baselineResult, setBaselineResult] = useState<SimulationResult | null>(
    null,
  );
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const aiGeneration = useRef(0);
  const [instruction, setInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [proposal, setProposal] = useState<{
    revision: number;
    model: Model;
    summary: string;
    projectId: string;
  } | null>(null);
  const [aiConfigured, setAiConfigured] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const baselineWorkerRef = useRef<Worker | null>(null);
  const runGeneration = useRef(0);
  const projectRef = useRef(project);
  projectRef.current = project;
  const { fitView } = useReactFlow();
  const model = project.model;
  const notify = useCallback((text: string) => setMessage(text), []);
  useEffect(() => {
    let live = true;
    get<Project>("fcm-studio-project")
      .then((p) => {
        if (live && p) {
          validateProject(p);
          setProject(p);
          setResult(p.runs.at(-1) ?? null);
          setStep(p.runs.at(-1)?.result.iterations ?? 0);
        }
      })
      .catch(() => {
        if (live) {
          setRestoreBlocked(true);
          setSaveStatus("Recovery needed · original data retained");
          notify(
            "Saved project could not be restored. Original data is preserved; export recovery data before starting a new project.",
          );
        }
      })
      .finally(() => {
        if (live) setReady(true);
      });
    fetch("/api/health")
      .then((r) => r.json())
      .then((x: { configured?: boolean }) => {
        if (live) setAiConfigured(x.configured === true);
      })
      .catch(() => {});
    return () => {
      live = false;
      workerRef.current?.terminate();
      baselineWorkerRef.current?.terminate();
    };
  }, [notify]);
  useEffect(() => {
    if (!ready || restoreBlocked) return;
    setSaveStatus("Saving…");
    const t = setTimeout(() => {
      set("fcm-studio-project", project)
        .then(() => setSaveStatus("Saved on this device"))
        .catch(() => {
          setSaveStatus("Save failed · export a backup");
        });
    }, 350);
    return () => clearTimeout(t);
  }, [project, ready, restoreBlocked]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 6500);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    const valid = new Set(model.factors.map((f) => f.id));
    setInitial((p) =>
      Object.fromEntries(Object.entries(p).filter(([k]) => valid.has(k))),
    );
    setClamped((p) =>
      Object.fromEntries(Object.entries(p).filter(([k]) => valid.has(k))),
    );
  }, [model.factors]);
  const edit = (next: Model) => {
    try {
      validateModel(next);
      setPast((p) => [...p.slice(-49), clone(model)]);
      setFuture([]);
      setProject((p) => ({ ...p, model: next, revision: p.revision + 1 }));
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const weight = (source: string, target: string, n: number) => {
    try {
      if (
        (model.relationships.find(
          (e) => e.source === source && e.target === target,
        )?.weight ?? 0) === n
      )
        return;
      edit(setWeight(model, source, target, n));
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [clone(model), ...f]);
    setProject((p) => ({
      ...p,
      model: past[past.length - 1],
      revision: p.revision + 1,
    }));
    setPast((p) => p.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, clone(model)]);
    setProject((p) => ({ ...p, model: future[0], revision: p.revision + 1 }));
    setFuture((f) => f.slice(1));
  };
  const selectPair = (source: string, target: string) => {
    setSelected({ source, target });
    setFactorId(null);
    setPanel("inspector");
  };
  const add = () => {
    try {
      edit(addFactor(model, factorName));
      setFactorName("");
      setModal(null);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const layout = (circle: boolean) => {
    const n = model.factors.length;
    edit({
      ...model,
      factors: model.factors.map((f, i) => ({
        ...f,
        x: circle ? 430 + 370 * Math.cos((i / n) * Math.PI * 2) : (i % 4) * 250,
        y: circle
          ? 320 + 260 * Math.sin((i / n) * Math.PI * 2)
          : Math.floor(i / 4) * 150,
      })),
    });
    setTimeout(() => fitView({ padding: 0.18, duration: 400 }), 50);
  };
  const edge = model.relationships.find(
    (e) => e.source === selected?.source && e.target === selected?.target,
  );
  const factor = model.factors.find((f) => f.id === factorId);
  const label = (fid: string) =>
    model.factors.find((f) => f.id === fid)?.label ?? fid;
  const nodes = model.factors.map((f, i) => ({
    id: f.id,
    type: "factor",
    position: dragPositions[f.id] ?? { x: f.x, y: f.y },
    selected: f.id === factorId,
    data: {
      ...f,
      color:
        result &&
        panel === "simulation" &&
        result.result.factorIds.includes(f.id)
          ? `hsl(145 30% ${92 - (result.result.states[Math.min(step, result.result.iterations)]?.[result.result.factorIds.indexOf(f.id)] ?? 0) * 35}%)`
          : f.color,
      index: i + 1,
      connections: model.relationships.filter(
        (e) => e.source === f.id || e.target === f.id,
      ).length,
    },
    style: {
      opacity:
        query && !f.label.toLowerCase().includes(query.toLowerCase())
          ? 0.25
          : 1,
    },
  }));
  const edges = model.relationships
    .filter(
      (e) =>
        filter === "all" ||
        (filter === "positive" ? e.weight > 0 : e.weight < 0),
    )
    .map((e) => {
      const active =
        selected?.source === e.source && selected?.target === e.target;
      const connected =
        !factorId || e.source === factorId || e.target === factorId;
      return {
        id: pairKey(e.source, e.target),
        source: e.source,
        target: e.target,
        label: `${e.weight > 0 ? "+" : ""}${e.weight}`,
        type: "default",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: e.weight > 0 ? "#4c927c" : "#cf766c",
        },
        style: {
          stroke: e.weight > 0 ? "#4c927c" : "#cf766c",
          strokeWidth: active ? 4 : 1 + Math.abs(e.weight) * 2,
          opacity: connected ? (active ? 1 : 0.65) : 0.12,
        },
        labelStyle: {
          fill: active ? "#153b30" : "#5b6b66",
          fontSize: 10,
          fontWeight: 600,
        },
        labelBgStyle: { fill: "#fbfcf9", fillOpacity: 0.9 },
        animated: active,
      };
    });
  const resetRuntime = () => {
    setRestoreBlocked(false);
    runGeneration.current++;
    aiGeneration.current++;
    setAiBusy(false);
    workerRef.current?.terminate();
    baselineWorkerRef.current?.terminate();
    setRunning(false);
    setInitial({});
    setClamped({});
    setResult(null);
    setBaselineResult(null);
    setPast([]);
    setFuture([]);
    setSelected(null);
    setFactorId(null);
    setProposal(null);
  };
  const importFile = async (file: File) => {
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose a file smaller than 10 MB.");
      if (file.name.endsWith(".json")) {
        const p = JSON.parse(await file.text()) as Project;
        validateProject(p);
        resetRuntime();
        setProject(p);
        setResult(p.runs.at(-1) ?? null);
        setStep(p.runs.at(-1)?.result.iterations ?? 0);
        setModal(null);
        notify("Project, scenarios, and run history restored.");
      } else {
        setPreview(
          await (
            await import("./excel")
          ).inspectWorkbook(await file.arrayBuffer()),
        );
        setTranspose(false);
        setModal("import");
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const acceptImport = async () => {
    if (!preview) return;
    try {
      const m = (await import("./excel")).previewToModel(preview, transpose);
      const candidate: Project = {
        version: 1,
        id: id(),
        name: preview.agenda || "Imported research map",
        agenda: preview.agenda,
        revision: 0,
        model: m,
        baseline: clone(m),
        scenarios: [],
        runs: [],
      };
      validateProject(candidate);
      resetRuntime();
      setProject(candidate);
      setModal(null);
      notify("Workbook imported. Original baseline preserved.");
      setTimeout(() => fitView(), 100);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const paste = (event: React.ClipboardEvent<HTMLTableElement>) => {
    const input = event.target as HTMLInputElement;
    if (input.tagName !== "INPUT") return;
    const cell = input.closest("td") as HTMLTableCellElement;
    const row = cell.parentElement as HTMLTableRowElement;
    const startRow = row.sectionRowIndex;
    const startCol = cell.cellIndex - 1;
    const raw = event.clipboardData.getData("text");
    if (!raw.includes("\t") && !raw.includes("\n")) return;
    event.preventDefault();
    try {
      const lines = raw
        .replace(/\r/g, "")
        .trimEnd()
        .split("\n")
        .map((l) => l.split("\t"));
      let m = model;
      for (let r = 0; r < lines.length; r++)
        for (let c = 0; c < lines[r].length; c++) {
          const a = model.factors[startRow + r],
            b = model.factors[startCol + c];
          if (!a || !b) throw new Error("Pasted range exceeds the matrix.");
          if (!lines[r][c].trim())
            throw new Error(
              "Blank weights are not allowed. Use 0 for no relationship.",
            );
          m = setWeight(m, a.id, b.id, Number(lines[r][c]));
        }
      edit(m);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const simulate = () => {
    if (!model.factors.length) {
      notify("Add a factor before simulating.");
      return;
    }
    workerRef.current?.terminate();
    baselineWorkerRef.current?.terminate();
    const generation = ++runGeneration.current;
    const snapshot = clone(model),
      savedInitial = clone(initial),
      savedClamped = clone(clamped);
    const baseline = project.baseline.factors.length
      ? clone(project.baseline)
      : clone(snapshot);
    if (!project.baseline.factors.length)
      setProject((p) => ({ ...p, baseline: clone(snapshot) }));
    const w = new Worker(new URL("./simulation.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = w;
    setRunning(true);
    setBaselineResult(null);
    w.onmessage = (
      event: MessageEvent<{ result?: SimulationResult; error?: string }>,
    ) => {
      if (generation !== runGeneration.current) return;
      setRunning(false);
      if (event.data.error) {
        notify(event.data.error);
        w.terminate();
        return;
      }
      if (event.data.result) {
        const run: Run = {
          id: id(),
          createdAt: new Date().toISOString(),
          snapshot,
          initial: savedInitial,
          clamped: savedClamped,
          result: event.data.result,
        };
        setResult(run);
        setStep(run.result.iterations);
        setProject((p) => ({ ...p, runs: [...p.runs.slice(-9), run] }));
      }
      w.terminate();
    };
    w.onerror = () => {
      if (generation === runGeneration.current) {
        setRunning(false);
        notify("Simulation worker failed. Try again.");
      }
      w.terminate();
    };
    w.postMessage({
      model: snapshot,
      initial: savedInitial,
      clamped: savedClamped,
    });
    const bw = new Worker(new URL("./simulation.worker.ts", import.meta.url), {
      type: "module",
    });
    baselineWorkerRef.current = bw;
    bw.onmessage = (event: MessageEvent<{ result?: SimulationResult }>) => {
      if (generation === runGeneration.current && event.data.result)
        setBaselineResult(event.data.result);
      bw.terminate();
    };
    bw.postMessage({ model: baseline, initial: {}, clamped: {} });
  };
  const stale =
    !!result &&
    (JSON.stringify(result.snapshot) !== JSON.stringify(model) ||
      JSON.stringify(result.initial) !== JSON.stringify(initial) ||
      JSON.stringify(result.clamped) !== JSON.stringify(clamped));
  const ai = async () => {
    if (!project.agenda.trim()) {
      notify("Enter a research agenda first.");
      return;
    }
    const requestGeneration = ++aiGeneration.current;
    const requestProjectId = project.id;
    setAiBusy(true);
    setProposal(null);
    try {
      const response = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agenda: project.agenda,
          instruction:
            instruction ||
            "Suggest a useful participatory causal map with factors, relationships, and provisional weights.",
          revision: project.revision,
          model,
        }),
        signal: AbortSignal.timeout(55000),
      });
      const data = (await response.json()) as {
        revision: number;
        model: Model;
        summary: string;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "AI request failed.");
      validateModel(data.model);
      if (
        requestGeneration === aiGeneration.current &&
        requestProjectId === projectRef.current.id
      )
        setProposal({ ...data, projectId: requestProjectId });
    } catch (e) {
      notify(
        `AI unavailable: ${(e as Error).message}. Manual editing remains available.`,
      );
    } finally {
      if (requestGeneration === aiGeneration.current) setAiBusy(false);
    }
  };
  const saveScenario = () => {
    if (project.scenarios.length >= 100) {
      notify("Maximum 100 scenarios per project.");
      return;
    }
    const name = window.prompt(
      "Scenario name",
      `Scenario ${project.scenarios.length + 1}`,
    );
    if (name && name.trim().length > 300) {
      notify("Scenario names must be 300 characters or fewer.");
      return;
    }
    if (name?.trim()) {
      setProject((p) => ({
        ...p,
        scenarios: [
          ...p.scenarios,
          {
            id: id(),
            name: name.trim(),
            model: clone(model),
            initial: clone(initial),
            clamped: clone(clamped),
          },
        ],
      }));
      notify("Scenario saved on this device.");
    }
  };
  const exportFile = async (kind: string) => {
    try {
      const name = safeName(project.name);
      if (kind === "recovery") {
        download(
          JSON.stringify(await get("fcm-studio-project"), null, 2),
          "fcm-recovery.json",
        );
        return;
      }
      if (kind === "json")
        download(JSON.stringify(project, null, 2), `${name}.json`);
      if (kind === "xlsx")
        download(
          await (await import("./excel")).exportWorkbook(model, project.agenda),
          `${name}.xlsx`,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
      if (kind === "csv")
        download(
          (await import("./excel")).matrixCsv(model),
          `${name}-matrix.csv`,
          "text/csv",
        );
      if (kind === "run" && result)
        download(JSON.stringify(result, null, 2), `${name}-run.json`);
      if (kind === "results" && result) {
        const rows = [
          [
            "step",
            ...result.result.factorIds.map(
              (fid) =>
                result.snapshot.factors.find((f) => f.id === fid)?.label ?? fid,
            ),
          ],
          ...result.result.states.map((s, i) => [String(i), ...s.map(String)]),
        ];
        download(
          rows
            .map((r) =>
              r
                .map(
                  (v) =>
                    '"' +
                    (/^[\s]*[=+@-]/.test(v) ? "'" : "") +
                    v.replaceAll('"', '""') +
                    '"',
                )
                .join(","),
            )
            .join("\r\n"),
          `${name}-trajectories.csv`,
          "text/csv",
        );
      }
      if (kind === "png" || kind === "svg") {
        const el = document.querySelector(".react-flow") as HTMLElement | null;
        if (!el) throw new Error("Open the map before exporting an image.");
        const url = await (kind === "png" ? toPng : toSvg)(el, {
          backgroundColor: "#f8faf7",
          filter: (node) =>
            !(node instanceof HTMLElement) ||
            !node.classList.contains("react-flow__controls"),
        });
        const a = document.createElement("a");
        a.download = `${name}.${kind}`;
        a.href = url;
        a.click();
      }
      notify("Export ready.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  if (!ready) return <div className="empty">Opening your local workspace…</div>;
  return (
    <div className="app-shell">
      <aside className="rail">
        <a className="brand-mark" href="#" aria-label="FCM Studio home">
          <GitBranch size={25} />
        </a>
        <span className="rail-divider" />
        <button
          className={panel !== "simulation" ? "rail-active" : ""}
          title="Model workspace"
          onClick={() => setPanel("inspector")}
        >
          <Network size={21} />
        </button>
        <button
          className={panel === "simulation" ? "rail-active" : ""}
          title="Simulation"
          onClick={() => setPanel("simulation")}
        >
          <FlaskConical size={21} />
        </button>
        <button title="AI assistant" onClick={() => setPanel("ai")}>
          <Sparkles size={21} />
        </button>
        <div className="rail-bottom">
          <button title="Help and methodology" onClick={() => setModal("help")}>
            <CircleHelp size={21} />
          </button>
          <span className="avatar">RC</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="wordmark">
            FCM <span>STUDIO</span>
            <span className="beta">PROTOTYPE</span>
          </div>
          <div className="topbar-right">
            <span className="saved">
              <i />
              {saveStatus}
            </span>
            <button className="btn subtle" onClick={() => setModal("import")}>
              <ArrowUpFromLine size={15} />
              Import
            </button>
            <button className="btn" onClick={() => setModal("export")}>
              <ArrowDownToLine size={15} />
              Export
              <ChevronDown size={13} />
            </button>
          </div>
        </header>
        <section className="project-header">
          <div>
            <div className="breadcrumb">
              WORKSPACE <span>/</span> PARTICIPATORY RESEARCH
            </div>
            <h1>{project.name}</h1>
            <p>{project.agenda}</p>
          </div>
          <div className="project-actions">
            <button className="btn" onClick={() => setModal("new")}>
              <Plus size={15} />
              New project
            </button>
            <button className="btn dark" onClick={() => setPanel("ai")}>
              <Sparkles size={15} />
              Explore with AI
            </button>
          </div>
        </section>
        <section className="workspace-tools">
          <div className="view-tabs">
            <button
              className={tab === "map" ? "active" : ""}
              onClick={() => setTab("map")}
            >
              <Network size={15} />
              Map
            </button>
            <button
              className={tab === "split" ? "active" : ""}
              onClick={() => setTab("split")}
            >
              <Layers size={15} />
              Split view
            </button>
            <button
              className={tab === "matrix" ? "active" : ""}
              onClick={() => setTab("matrix")}
            >
              <Grid2X2 size={15} />
              Matrix
            </button>
          </div>
          <span className="sync-label">
            <i />
            Live sync
          </span>
          <div className="tool-spacer" />
          <button
            className="icon-btn"
            title="Undo"
            disabled={!past.length}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-btn"
            title="Redo"
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
          <span className="tool-divider" />
          <button
            className="btn green"
            onClick={() => {
              setFactorName("");
              setModal("factor");
            }}
          >
            <Plus size={15} />
            Add factor
          </button>
        </section>
        <div className="workspace-body">
          <div className={`canvas-stack ${tab}`}>
            {tab !== "matrix" && (
              <section className="map-panel">
                <div className="panel-heading">
                  <span>
                    <Network size={15} />
                    Causal map{" "}
                    <small>
                      {model.factors.length} factors ·{" "}
                      {model.relationships.length} relationships
                    </small>
                  </span>
                  <div>
                    <button className="text-btn" onClick={() => layout(false)}>
                      Auto layout
                    </button>
                    <button className="text-btn" onClick={() => layout(true)}>
                      Circle
                    </button>
                    <button
                      className="icon-btn"
                      title="Fit map"
                      onClick={() => fitView({ padding: 0.15, duration: 300 })}
                    >
                      <Maximize2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="map-search">
                  <Search size={15} />
                  <input
                    aria-label="Find a factor"
                    placeholder="Find a factor…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={(changes) => {
                    const positions = changes.flatMap((c) =>
                      c.type === "position" && c.position
                        ? [[c.id, c.position] as const]
                        : [],
                    );
                    if (positions.length)
                      setDragPositions((p) => ({
                        ...p,
                        ...Object.fromEntries(positions),
                      }));
                  }}
                  fitView
                  minZoom={0.15}
                  maxZoom={2}
                  onNodeClick={(_, n) => {
                    setFactorId(n.id);
                    setSelected(null);
                    setPanel("inspector");
                  }}
                  onEdgeClick={(_, e) => selectPair(e.source, e.target)}
                  onPaneClick={() => {
                    setFactorId(null);
                    setSelected(null);
                  }}
                  onConnect={(c: Connection) => {
                    if (c.source && c.target) {
                      weight(c.source, c.target, 0.3);
                      selectPair(c.source, c.target);
                    }
                  }}
                  onNodeDragStop={(_, n) => {
                    edit({
                      ...model,
                      factors: model.factors.map((f) =>
                        f.id === n.id
                          ? { ...f, x: n.position.x, y: n.position.y }
                          : f,
                      ),
                    });
                    setDragPositions({});
                  }}
                  deleteKeyCode={null}
                >
                  <Background gap={22} size={1} color="#d4ddd6" />
                  <Controls showInteractive={false} />
                </ReactFlow>
                <div className="map-legend">
                  <span>
                    <i className="line-pos" />
                    Positive influence
                  </span>
                  <span>
                    <i className="line-neg" />
                    Negative influence
                  </span>
                  <select
                    aria-label="Filter relationships"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">All relationships</option>
                    <option value="positive">Positive only</option>
                    <option value="negative">Negative only</option>
                  </select>
                </div>
              </section>
            )}
            {tab !== "map" && (
              <section className="matrix-panel">
                <div className="panel-heading">
                  <span>
                    <Grid2X2 size={15} />
                    Weight matrix <small>Rows influence columns</small>
                  </span>
                  <span className="matrix-note">
                    −1 to +1 <i /> click to edit
                  </span>
                </div>
                <div className="matrix-scroll">
                  <table className="matrix" onPaste={paste}>
                    <thead>
                      <tr>
                        <th className="matrix-corner">
                          FROM ↓ <span>TO →</span>
                        </th>
                        {model.factors.map((f, i) => (
                          <th key={f.id} title={f.label}>
                            <span className="col-number">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span>{f.label}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {model.factors.map((a, i) => (
                        <tr key={a.id}>
                          <th>
                            <button
                              onClick={() => {
                                setFactorId(a.id);
                                setSelected(null);
                                setPanel("inspector");
                              }}
                            >
                              <span style={{ background: a.color }}>
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              {a.label}
                            </button>
                          </th>
                          {model.factors.map((b) => (
                            <td key={b.id}>
                              <WeightCell
                                label={`${a.label} → ${b.label}`}
                                value={
                                  model.relationships.find(
                                    (e) =>
                                      e.source === a.id && e.target === b.id,
                                  )?.weight ?? 0
                                }
                                onChange={(n) => weight(a.id, b.id, n)}
                                onSelect={() => selectPair(a.id, b.id)}
                                active={
                                  selected?.source === a.id &&
                                  selected?.target === b.id
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!model.factors.length && (
                    <div className="empty">
                      Add a factor or import a workbook to begin.
                    </div>
                  )}
                </div>
                <button
                  className="matrix-add"
                  onClick={() => {
                    setFactorName("");
                    setModal("factor");
                  }}
                >
                  <Plus size={14} />
                  Add factor to map & matrix
                </button>
              </section>
            )}
          </div>
          <aside className="inspector">
            <div className="inspector-tabs">
              <button
                className={panel === "inspector" ? "active" : ""}
                onClick={() => setPanel("inspector")}
              >
                Overview
              </button>
              <button
                className={panel === "simulation" ? "active" : ""}
                onClick={() => setPanel("simulation")}
              >
                Simulate
              </button>
              <button
                className={panel === "ai" ? "active" : ""}
                onClick={() => setPanel("ai")}
              >
                <Sparkles size={13} />
                AI
              </button>
            </div>
            <div className="inspector-content">
              {panel === "inspector" && (
                <>
                  {selected ? (
                    <>
                      <span className="eyebrow">RELATIONSHIP</span>
                      <h2>
                        {label(selected.source)}{" "}
                        <span className="muted">→</span>{" "}
                        {label(selected.target)}
                      </h2>
                      <p className="muted">
                        More of the source leads to{" "}
                        {edge && edge.weight < 0 ? "less" : "more"} of the
                        target.
                      </p>
                      <label className="field-label">Influence weight</label>
                      <input
                        aria-label="Relationship weight"
                        className="full-input"
                        type="number"
                        min="-1"
                        max="1"
                        step="0.1"
                        value={edge?.weight ?? 0}
                        onChange={(e) =>
                          weight(
                            selected.source,
                            selected.target,
                            Number(e.target.value),
                          )
                        }
                      />
                      <div className="presets">
                        {presets.map((n) => (
                          <button
                            key={n}
                            className={
                              (edge?.weight ?? 0) === n ? "chosen" : ""
                            }
                            onClick={() =>
                              weight(selected.source, selected.target, n)
                            }
                          >
                            {n > 0 ? "+" : ""}
                            {n}
                          </button>
                        ))}
                      </div>
                      <p className="note">
                        0 removes this relationship. Reverse influence is edited
                        separately.
                      </p>
                      <span className="provenance">
                        Source: {edge?.provenance ?? "no relationship"}
                      </span>
                      {edge?.rationale && (
                        <p className="note">{edge.rationale}</p>
                      )}
                      <button
                        className="btn danger full"
                        onClick={() =>
                          weight(selected.source, selected.target, 0)
                        }
                      >
                        <Trash2 size={14} />
                        Remove relationship
                      </button>
                    </>
                  ) : factor ? (
                    <>
                      <span className="eyebrow">FACTOR DETAILS</span>
                      <h2>{factor.label}</h2>
                      {factor.description && (
                        <p className="note">{factor.description}</p>
                      )}
                      <label className="field-label">Name</label>
                      <input
                        className="full-input"
                        aria-label="Factor name"
                        maxLength={300}
                        key={factor.id + factor.label}
                        defaultValue={factor.label}
                        onBlur={(e) => {
                          const name = e.target.value.trim();
                          if (name === factor.label) return;
                          if (
                            !name ||
                            model.factors.some(
                              (f) =>
                                f.id !== factor.id &&
                                f.label.trim().toLowerCase() ===
                                  name.toLowerCase(),
                            )
                          ) {
                            notify("Enter a unique factor name.");
                            e.target.value = factor.label;
                            return;
                          }
                          edit({
                            ...model,
                            factors: model.factors.map((f) =>
                              f.id === factor.id ? { ...f, label: name } : f,
                            ),
                          });
                        }}
                      />
                      <label className="field-label">Color</label>
                      <div className="color-list">
                        {COLORS.map((c) => (
                          <button
                            key={c}
                            aria-label={`Set color ${c}`}
                            style={{ background: c }}
                            onClick={() =>
                              edit({
                                ...model,
                                factors: model.factors.map((f) =>
                                  f.id === factor.id ? { ...f, color: c } : f,
                                ),
                              })
                            }
                          >
                            {factor.color === c && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                      <p className="provenance">Source: {factor.provenance}</p>
                      <p className="note">
                        Drag from a card’s right handle to another card’s left
                        handle to connect them.
                      </p>
                      <button
                        className="btn danger full"
                        onClick={() => {
                          edit(removeFactor(model, factor.id));
                          setFactorId(null);
                        }}
                      >
                        <Trash2 size={14} />
                        Delete factor & relationships
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="eyebrow">THE BIG PICTURE</span>
                      <h2>
                        A shared view of
                        <br />a complex system.
                      </h2>
                      <p className="muted">
                        Explore how your factors influence one another. Every
                        edit stays connected.
                      </p>
                      <div className="stat-grid">
                        <div>
                          <strong>{model.factors.length}</strong>
                          <span>Factors</span>
                        </div>
                        <div>
                          <strong>{model.relationships.length}</strong>
                          <span>Relationships</span>
                        </div>
                      </div>
                      <div className="polarity-count">
                        <span>
                          <i className="dot-positive" />
                          {
                            model.relationships.filter((e) => e.weight > 0)
                              .length
                          }{" "}
                          positive
                        </span>
                        <span>
                          <i className="dot-negative" />
                          {
                            model.relationships.filter((e) => e.weight < 0)
                              .length
                          }{" "}
                          negative
                        </span>
                      </div>
                      <hr />
                      <span className="eyebrow">MOST INFLUENTIAL</span>
                      <p className="note">Total absolute outgoing weight</p>
                      <div className="ranking">
                        {model.factors
                          .map((f) => ({
                            ...f,
                            score: model.relationships
                              .filter((e) => e.source === f.id)
                              .reduce((a, e) => a + Math.abs(e.weight), 0),
                          }))
                          .sort((a, b) => b.score - a.score)
                          .slice(0, 4)
                          .map((f, i) => (
                            <button
                              key={f.id}
                              onClick={() => setFactorId(f.id)}
                            >
                              <span className="rank-number">{i + 1}</span>
                              <div>
                                {f.label}
                                <div className="rank-track">
                                  <i
                                    style={{
                                      width: `${Math.min(100, (f.score / 4) * 100)}%`,
                                      background: f.color,
                                    }}
                                  />
                                </div>
                              </div>
                              <strong>{f.score.toFixed(1)}</strong>
                            </button>
                          ))}
                      </div>
                      <span className="eyebrow">MOST AFFECTED</span>
                      <p className="note">Total absolute incoming weight</p>
                      <div className="ranking">
                        {model.factors
                          .map((f) => ({
                            ...f,
                            score: model.relationships
                              .filter((e) => e.target === f.id)
                              .reduce((a, e) => a + Math.abs(e.weight), 0),
                          }))
                          .sort((a, b) => b.score - a.score)
                          .slice(0, 3)
                          .map((f) => (
                            <button
                              key={f.id}
                              onClick={() => setFactorId(f.id)}
                            >
                              <div>{f.label}</div>
                              <strong>{f.score.toFixed(1)}</strong>
                            </button>
                          ))}
                      </div>
                      <div className="insight-box">
                        <FlaskConical size={19} />
                        <strong>What if something changes?</strong>
                        <p>
                          Adjust a factor and explore how its influence moves
                          through the system.
                        </p>
                        <button onClick={() => setPanel("simulation")}>
                          Explore a scenario →
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
              {panel === "simulation" && (
                <>
                  <span className="eyebrow">SCENARIO LAB</span>
                  <h2>Explore the what-ifs.</h2>
                  <p className="muted">
                    Change initial activations or hold a factor fixed. Compare
                    against the original baseline at 0.5.
                  </p>
                  <div className="scenario-buttons">
                    <button className="btn" onClick={saveScenario}>
                      Save scenario
                    </button>
                    <button
                      className="icon-btn"
                      title="Restore baseline"
                      onClick={() => {
                        edit(clone(project.baseline));
                        setInitial({});
                        setClamped({});
                      }}
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                  {project.scenarios.length > 0 && (
                    <select
                      aria-label="Load scenario"
                      className="full-input"
                      defaultValue=""
                      onChange={(e) => {
                        const s = project.scenarios.find(
                          (s) => s.id === e.target.value,
                        );
                        if (s) {
                          edit(clone(s.model));
                          setInitial(clone(s.initial));
                          setClamped(clone(s.clamped));
                        }
                      }}
                    >
                      <option value="" disabled>
                        Load a saved scenario
                      </option>
                      {project.scenarios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <div className="activation-list">
                    {model.factors.map((f) => (
                      <div key={f.id}>
                        <label htmlFor={`activation-${f.id}`}>{f.label}</label>
                        <div>
                          <input
                            id={`activation-${f.id}`}
                            aria-label={`Initial ${f.label}`}
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={initial[f.id] ?? 0.5}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setInitial((p) => ({ ...p, [f.id]: v }));
                              if (f.id in clamped)
                                setClamped((p) => ({ ...p, [f.id]: v }));
                            }}
                          />
                          <span>{(initial[f.id] ?? 0.5).toFixed(2)}</span>
                          <label className="clamp">
                            <input
                              type="checkbox"
                              aria-label={`Hold ${f.label} fixed`}
                              checked={f.id in clamped}
                              onChange={(e) => {
                                const n = { ...clamped };
                                if (e.target.checked)
                                  n[f.id] = initial[f.id] ?? 0.5;
                                else delete n[f.id];
                                setClamped(n);
                              }}
                            />
                            Fix
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn dark full"
                    onClick={simulate}
                    disabled={running}
                  >
                    <Play size={15} />
                    {running ? "Simulating…" : "Run simulation"}
                  </button>
                  <p className="note">
                    Modified Kosko · sigmoid slope 1 · max 100 steps.
                    Activations default to 0.5; these are assumptions.
                  </p>
                  {result && (
                    <div className="results">
                      <select
                        aria-label="Run history"
                        className="full-input"
                        value={result.id}
                        onChange={(e) => {
                          const r = project.runs.find(
                            (r) => r.id === e.target.value,
                          );
                          if (r) {
                            setResult(r);
                            setStep(r.result.iterations);
                            setBaselineResult(null);
                          }
                        }}
                      >
                        {project.runs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {new Date(r.createdAt).toLocaleString()}
                          </option>
                        ))}
                      </select>
                      <h3>
                        Scenario results{" "}
                        {stale && <span className="stale">OUTDATED</span>}
                      </h3>
                      <p className="note">
                        {result.result.converged
                          ? "Converged"
                          : "Iteration limit reached"}{" "}
                        at step {result.result.iterations}.
                      </p>
                      <svg
                        viewBox="0 0 260 115"
                        className="trajectory"
                        aria-label="Activation trajectories"
                        role="img"
                      >
                        <path
                          d="M 8 5 V 105 H 255"
                          fill="none"
                          stroke="#cbd6cf"
                        />
                        {result.result.factorIds.map((fid, i) => (
                          <polyline
                            key={fid}
                            fill="none"
                            stroke={
                              [
                                "#287b66",
                                "#b88053",
                                "#9573b7",
                                "#508bad",
                                "#ca7372",
                              ][i % 5]
                            }
                            strokeWidth="1.5"
                            points={result.result.states
                              .map(
                                (s, t) =>
                                  `${8 + (t / Math.max(1, result.result.iterations)) * 245},${105 - s[i] * 95}`,
                              )
                              .join(" ")}
                          />
                        ))}
                      </svg>
                      <label className="field-label">
                        Map playback · step {step}
                      </label>
                      <input
                        aria-label="Simulation step"
                        type="range"
                        min="0"
                        max={result.result.iterations}
                        value={step}
                        onChange={(e) => setStep(Number(e.target.value))}
                      />
                      <p className="note">
                        Map shade: pale = 0, dark = 1. Final activation / change
                        from baseline:
                      </p>
                      {result.result.factorIds.map((fid, i) => {
                        const bi = baselineResult?.factorIds.indexOf(fid) ?? -1;
                        const final = result.result.states.at(-1)![i];
                        const base =
                          bi >= 0
                            ? baselineResult?.states.at(-1)?.[bi]
                            : undefined;
                        return (
                          <div className="result-row" key={fid}>
                            <span>
                              {
                                result.snapshot.factors.find(
                                  (f) => f.id === fid,
                                )?.label
                              }
                            </span>
                            <strong>{final.toFixed(3)}</strong>
                            <small>
                              {base === undefined
                                ? "—"
                                : `${final - base >= 0 ? "+" : ""}${(final - base).toFixed(3)}`}
                            </small>
                          </div>
                        );
                      })}
                      <button
                        className="btn full"
                        onClick={() => exportFile("run")}
                      >
                        <Download size={14} />
                        Export reproducible run
                      </button>
                      <button
                        className="text-btn"
                        onClick={() => exportFile("results")}
                      >
                        Download trajectories CSV
                      </button>
                    </div>
                  )}
                  <div className="research-note">
                    Model-based exploration, not a prediction. Steps do not
                    represent calendar time.
                  </div>
                </>
              )}
              {panel === "ai" && (
                <>
                  <span className="eyebrow">AI CO-FACILITATOR</span>
                  <h2>Start with a question.</h2>
                  <p className="muted">
                    Draft a map or explore an addition. You review every change
                    before it enters your model.
                  </p>
                  <label className="field-label">Research agenda</label>
                  <textarea
                    maxLength={16000}
                    aria-label="Research agenda"
                    value={project.agenda}
                    onChange={(e) =>
                      setProject((p) => ({
                        ...p,
                        agenda: e.target.value,
                        revision: p.revision + 1,
                      }))
                    }
                  />
                  <label className="field-label">
                    What would you like to explore?
                  </label>
                  <textarea
                    maxLength={8000}
                    aria-label="AI instruction"
                    placeholder="Add access to finance and suggest its relationships…"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                  />
                  <div className="research-note">
                    Sending a request shares this agenda and the current model
                    with your configured AI provider.
                  </div>
                  <button
                    className="btn dark full"
                    disabled={aiBusy}
                    onClick={ai}
                  >
                    <Sparkles size={15} />
                    {aiBusy ? "Drafting…" : "Generate proposal"}
                  </button>
                  {!aiConfigured && (
                    <p className="note">
                      Optional AI service is not configured. See the README to
                      start it locally with your provider credentials.
                    </p>
                  )}
                  {proposal && (
                    <div className="proposal">
                      <h3>Review proposal</h3>
                      <p>{proposal.summary}</p>
                      <p className="note">
                        {proposal.model.factors.length} factors ·{" "}
                        {proposal.model.relationships.length} relationships
                      </p>
                      <div className="proposal-diff">
                        <h3>Changes to your model</h3>
                        {describeChanges(model, proposal.model).map(
                          (change, i) => (
                            <p key={`change-${i}`}>{change}</p>
                          ),
                        )}
                        <h3>Proposed model and rationales</h3>
                        {proposal.model.factors.map((f) => (
                          <p key={f.id}>
                            {model.factors.some((x) => x.id === f.id)
                              ? "•"
                              : "＋"}{" "}
                            {f.label}
                          </p>
                        ))}
                        {model.factors
                          .filter(
                            (f) =>
                              !proposal.model.factors.some(
                                (n) => n.id === f.id,
                              ),
                          )
                          .map((f) => (
                            <p key={f.id}>− {f.label}</p>
                          ))}
                        {proposal.model.relationships.map((e) => (
                          <p key={pairKey(e.source, e.target)}>
                            {
                              proposal.model.factors.find(
                                (f) => f.id === e.source,
                              )?.label
                            }{" "}
                            →{" "}
                            {
                              proposal.model.factors.find(
                                (f) => f.id === e.target,
                              )?.label
                            }
                            : {e.weight} <small>{e.rationale}</small>
                          </p>
                        ))}
                      </div>
                      <div className="research-note">
                        AI weights are provisional hypotheses. Accepting does
                        not establish participant consensus.
                      </div>
                      <button
                        className="btn green full"
                        onClick={() => {
                          if (
                            proposal.projectId !== project.id ||
                            proposal.revision !== project.revision
                          ) {
                            notify(
                              "The model changed. Generate a fresh proposal.",
                            );
                            return;
                          }
                          edit(proposal.model);
                          setProposal(null);
                          notify(
                            "Proposal accepted with AI provenance preserved.",
                          );
                        }}
                      >
                        Accept proposal
                      </button>
                      <button
                        className="btn full"
                        onClick={() => setProposal(null)}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="inspector-footer">
              <GitBranch size={15} /> Built for collective understanding.
            </div>
          </aside>
        </div>
        <footer className="statusbar">
          <span>
            <span className="status-dot" />{" "}
            {project.id === "demo"
              ? "SYNTHETIC DEMO"
              : "LOCAL RESEARCH PROJECT"}{" "}
            <span className="footer-sep">|</span> Original baseline preserved
          </span>
          <span>
            Robo Co-op <span className="footer-sep">/</span> Open source, shared
            knowledge
          </span>
        </footer>
      </div>
      <input
        hidden
        ref={fileRef}
        type="file"
        accept=".xlsx,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
        }}
      />
      {message && (
        <div className="toast" role="status">
          {message}
          <button
            aria-label="Dismiss notification"
            onClick={() => setMessage("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal}
          >
            <button
              className="modal-close icon-btn"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "factor" && (
              <>
                <span className="eyebrow">GROW YOUR MODEL</span>
                <h2>Add a factor</h2>
                <p>A new card, row, and column will appear together.</p>
                <input
                  autoFocus
                  className="full-input"
                  aria-label="New factor name"
                  maxLength={300}
                  placeholder="e.g. Access to finance"
                  value={factorName}
                  onChange={(e) => setFactorName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") add();
                  }}
                />
                <button className="btn dark full" onClick={add}>
                  <Plus size={15} />
                  Add factor
                </button>
              </>
            )}
            {modal === "new" && (
              <>
                <span className="eyebrow">NEW RESEARCH PROJECT</span>
                <h2>What will you explore?</h2>
                <p>
                  Export your current project first if you want a backup. This
                  starts a new local workspace.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    const name = String(d.get("name")).trim();
                    const agenda = String(d.get("agenda")).trim();
                    resetRuntime();
                    setProject({
                      version: 1,
                      id: id(),
                      name,
                      agenda,
                      revision: 0,
                      model: { factors: [], relationships: [] },
                      baseline: { factors: [], relationships: [] },
                      scenarios: [],
                      runs: [],
                    });
                    setPanel("ai");
                    setModal(null);
                  }}
                >
                  <label className="field-label">Project name</label>
                  <input
                    name="name"
                    className="full-input"
                    required
                    maxLength={100}
                  />
                  <label className="field-label">Research agenda</label>
                  <textarea name="agenda" maxLength={16000} required />
                  <button className="btn dark full">Create project</button>
                </form>
              </>
            )}
            {modal === "import" && (
              <>
                <span className="eyebrow">BRING YOUR RESEARCH</span>
                <h2>Import a workbook</h2>
                <p>
                  Open an Excel weight matrix or restore an FCM Studio JSON
                  backup. Files stay on this device.
                </p>
                <button
                  className="upload-zone"
                  onClick={() => fileRef.current?.click()}
                >
                  <ArrowUpFromLine size={26} />
                  <strong>Choose .xlsx or .json</strong>
                  <span>Up to 10 MB · square weight matrices</span>
                </button>
                {preview && (
                  <>
                    <h3>
                      {preview.sheet} · {preview.labels.length} factors
                    </h3>
                    <p className="note">Detected range: {preview.range}</p>
                    <p>{preview.agenda}</p>
                    <label className="field-label">Matrix direction</label>
                    <select
                      className="full-input"
                      value={String(transpose)}
                      onChange={(e) => setTranspose(e.target.value === "true")}
                    >
                      <option value="false">
                        Rows are sources → columns are targets
                      </option>
                      <option value="true">
                        Columns are sources → rows are targets
                      </option>
                    </select>
                    <div className="preview-labels">
                      {preview.labels.map((l, i) => (
                        <span key={i}>{l}</span>
                      ))}
                    </div>
                    {preview.issues.length > 0 && (
                      <div className="research-note">
                        {preview.issues.map((issue, i) => (
                          <p key={i}>{issue}</p>
                        ))}
                      </div>
                    )}
                    <p className="note">
                      Import replaces the current workspace. Export a backup
                      first if needed.
                    </p>
                    <button
                      className="btn dark full"
                      disabled={preview.issues.length > 0}
                      onClick={acceptImport}
                    >
                      Import as a new baseline
                    </button>
                  </>
                )}
              </>
            )}
            {modal === "export" && (
              <>
                <span className="eyebrow">TAKE YOUR WORK WITH YOU</span>
                <h2>Export your project</h2>
                <div className="export-grid">
                  {restoreBlocked && (
                    <button onClick={() => exportFile("recovery")}>
                      Download original recovery data
                    </button>
                  )}
                  {[
                    [
                      "json",
                      "Project backup",
                      "Model, baseline, scenarios & runs",
                    ],
                    [
                      "xlsx",
                      "Excel workbook",
                      "Editable weight matrix & scale",
                    ],
                    ["csv", "Matrix CSV", "Portable signed weights"],
                    ["svg", "Map SVG", "Scalable image of current view"],
                    ["png", "Map PNG", "Image of current view"],
                  ].map(([k, t, d]) => (
                    <button key={k} onClick={() => exportFile(k)}>
                      <Download size={18} />
                      <strong>{t}</strong>
                      <span>{d}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {modal === "help" && (
              <>
                <span className="eyebrow">
                  A SHARED LANGUAGE FOR COMPLEXITY
                </span>
                <h2>How FCM Studio works</h2>
                <p>
                  A fuzzy cognitive map captures how participants perceive a
                  system at a moment in time.
                </p>
                <ol>
                  <li>
                    Add factors and draw directed relationships between them.
                  </li>
                  <li>
                    Use positive weights for same-direction influence and
                    negative weights for opposite-direction influence.
                  </li>
                  <li>
                    Edit either the map or matrix. Rows are sources; columns are
                    targets.
                  </li>
                  <li>
                    Save scenarios and compare simulations against the imported
                    baseline.
                  </li>
                </ol>
                <p>
                  Simulation: xⱼ(t+1) = sigmoid(xⱼ(t) + Σᵢ Wᵢⱼ xᵢ(t)). Default
                  activation 0.5, slope 1. Stop below 0.0001 change for five
                  steps or at 100 steps.
                </p>
                <p>
                  Weights are assessments, not correlations or probabilities.
                  Synthetic demo weights are illustrative. AI suggestions remain
                  labeled hypotheses.
                </p>
                <p className="note">
                  An imported baseline is preserved for the life of the project.
                  For a new empty project, the first simulation captures the
                  baseline. To establish a separate baseline later, export the
                  matrix and import it as a new project.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
