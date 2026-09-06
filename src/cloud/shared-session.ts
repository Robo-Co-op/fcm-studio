import { validateProject, type Model, type Project } from "../model";
import type { CloudProject } from "./repository";
export type ProjectCommand =
  | { type: "replace_model"; model: Model }
  | { type: "set_details"; name: string; agenda: string };
export interface PendingCommand {
  id: string;
  revision: number;
  command: ProjectCommand;
  before: Project;
  draft: Project;
}
interface Transport {
  load(id: string): Promise<CloudProject>;
  apply(id: string, operation: PendingCommand): Promise<CloudProject>;
}
export interface SharedState {
  current: CloudProject | null;
  pending: PendingCommand | null;
  draft: Project | null;
  uncertain: PendingCommand | null;
  error: string;
}
const codeOf = (error: unknown): string =>
  error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "";
export class SharedSession {
  state: SharedState = {
    current: null,
    pending: null,
    draft: null,
    uncertain: null,
    error: "",
  };
  private inverse: { before: Project; revision: number } | null = null;
  get canUndo() {
    return (
      !this.readOnly &&
      !!this.inverse &&
      this.inverse.revision === this.state.current?.revision
    );
  }
  async undo() {
    if (!this.canUndo || !this.inverse || !this.state.current) return;
    const draft = {
      ...this.inverse.before,
      revision: this.state.current.revision,
    };
    await this.change(draft);
    this.inverse = null;
    this.notify();
  }
  private online = true;
  private connected = false;
  private generation = 0;
  setOnline(online: boolean) {
    if (!online && this.state.pending) {
      this.state.draft = this.state.pending.draft;
      this.state.uncertain = this.state.pending;
      this.state.pending = null;
      this.state.error =
        "Save outcome is uncertain. Retry the same operation when connected.";
      this.generation++;
    }
    this.online = online;
    this.connected = false;
    this.notify();
  }
  constructor(
    private transport: Transport,
    private id: string,
    private notify: () => void = () => {},
  ) {}
  get readOnly() {
    return (
      !this.online ||
      !this.connected ||
      !this.state.current ||
      !!this.state.pending ||
      !!this.state.draft ||
      this.state.current.role === "viewer"
    );
  }
  async refresh() {
    if (!this.online || this.state.pending) return;
    const ticket = ++this.generation;
    try {
      const row = await this.transport.load(this.id);
      if (ticket !== this.generation) return;
      if (row.revision !== this.state.current?.revision) this.inverse = null;
      this.state.current = row;
      this.connected = true;
      this.state.error = "";
    } catch (error) {
      if (ticket !== this.generation) return;
      this.connected = false;
      if (["PGRST116", "42501", "401", "403"].includes(codeOf(error)))
        this.state.current = null;
      this.state.error =
        "Cloud access unavailable. Reconnect or check project membership.";
    }
    this.notify();
  }
  async change(draft: Project) {
    if (this.readOnly || !this.state.current) return;
    const before = this.state.current.document;
    validateProject(draft);
    if (draft.id !== before.id || draft.revision !== before.revision)
      throw new Error("Cloud draft identity or revision changed unexpectedly.");
    const command: ProjectCommand =
      JSON.stringify(before.model) !== JSON.stringify(draft.model)
        ? { type: "replace_model", model: draft.model }
        : { type: "set_details", name: draft.name, agenda: draft.agenda };
    await this.send({
      id: crypto.randomUUID(),
      revision: this.state.current.revision,
      command,
      before,
      draft,
    });
  }
  async retryUncertain() {
    if (this.state.uncertain && !this.state.pending)
      await this.send(this.state.uncertain);
  }
  async discardDraft() {
    this.state.draft = null;
    this.state.uncertain = null;
    this.state.error = "";
    this.connected = false;
    this.notify();
    await this.refresh();
  }
  async applyDraftAgainstLatest() {
    if (!this.state.draft || !this.state.current || this.state.pending) return;
    const draft = {
      ...this.state.draft,
      revision: this.state.current.revision,
    };
    this.state.draft = null;
    this.state.error = "";
    await this.change(draft);
  }
  private async send(pending: PendingCommand) {
    const ticket = ++this.generation;
    this.state.pending = pending;
    this.notify();
    try {
      const row = await this.transport.apply(this.id, pending);
      if (ticket !== this.generation) return;
      this.state.current = row;
      this.inverse =
        row.revision === pending.revision + 1
          ? { before: pending.before, revision: row.revision }
          : null;
      this.state.draft = null;
      this.state.uncertain = null;
      this.state.error = "";
    } catch (error) {
      this.state.draft = pending.draft;
      if (codeOf(error) === "40001") {
        this.state.uncertain = null;
        this.state.error =
          "Project revision conflict. Review the latest version and your draft.";
        try {
          const row = await this.transport.load(this.id);
          if (ticket === this.generation) this.state.current = row;
        } catch (loadError) {
          if (
            ticket === this.generation &&
            ["PGRST116", "42501", "401", "403"].includes(codeOf(loadError))
          ) {
            this.state.current = null;
            this.state.error =
              "Cloud access unavailable. Reconnect or check project membership.";
          }
        }
      } else {
        this.state.uncertain = pending;
        this.state.error =
          "Save outcome is uncertain. Retry the same operation when connected.";
      }
    } finally {
      this.state.pending = null;
      this.notify();
    }
  }
}
