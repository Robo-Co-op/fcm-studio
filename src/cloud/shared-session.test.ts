import { expect, it } from "vitest";
import { SharedSession } from "./shared-session";
import type { CloudProject } from "./repository";
const project: CloudProject = {
  id: "p",
  revision: 0,
  role: "owner",
  document: {
    version: 1,
    id: "p",
    revision: 0,
    name: "Research",
    agenda: "",
    model: { factors: [], relationships: [] },
    baseline: { factors: [], relationships: [] },
    scenarios: [],
    runs: [],
  },
};
it("keeps acknowledged state until the write succeeds", async () => {
  let resolve!: (row: CloudProject) => void;
  const session = new SharedSession(
    {
      load: async () => structuredClone(project),
      apply: () =>
        new Promise((done) => {
          resolve = done;
        }),
    },
    "p",
  );
  await session.refresh();
  const next = { ...project.document, name: "Changed" };
  const pending = session.change(next);
  expect(session.state.current?.document.name).toBe("Research");
  expect(session.readOnly).toBe(true);
  resolve({ ...project, revision: 1, document: { ...next, revision: 1 } });
  await pending;
  expect(session.state.current?.document.name).toBe("Changed");
  expect(session.readOnly).toBe(false);
});
it("preserves a conflicting draft and reloads the peer's acknowledged version", async () => {
  const peer = {
    ...project,
    revision: 1,
    document: { ...project.document, name: "Peer", revision: 1 },
  };
  let latest = project;
  const session = new SharedSession(
    {
      load: async () => latest,
      apply: async () => {
        latest = peer;
        throw { code: "40001", message: "Project revision conflict" };
      },
    },
    "p",
  );
  await session.refresh();
  await session.change({ ...project.document, name: "Mine" });
  expect(session.state.current?.document.name).toBe("Peer");
  expect(session.state.draft?.name).toBe("Mine");
  expect(session.state.error).toContain("conflict");
  expect(session.readOnly).toBe(true);
});
it("retries an uncertain network result with the same operation ID", async () => {
  const ids: string[] = [];
  const session = new SharedSession(
    {
      load: async () => project,
      apply: async (_id, operation) => {
        ids.push(operation.id);
        if (ids.length === 1) throw new TypeError("fetch failed");
        return {
          ...project,
          revision: 1,
          document: { ...operation.draft, revision: 1 },
        };
      },
    },
    "p",
  );
  await session.refresh();
  await session.change({ ...project.document, name: "Mine" });
  expect(session.state.uncertain).not.toBeNull();
  await session.retryUncertain();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  expect(session.state.draft).toBeNull();
});
it("blocks offline writes and drops data when membership is revoked", async () => {
  let revoked = false;
  let writes = 0;
  const session = new SharedSession(
    {
      load: async () => {
        if (revoked) throw { code: "PGRST116" };
        return project;
      },
      apply: async () => {
        writes++;
        return project;
      },
    },
    "p",
  );
  await session.refresh();
  session.setOnline(false);
  await session.change({ ...project.document, name: "Offline" });
  expect(writes).toBe(0);
  expect(session.readOnly).toBe(true);
  revoked = true;
  session.setOnline(true);
  await session.refresh();
  expect(session.state.current).toBeNull();
  expect(session.readOnly).toBe(true);
});
it("allows only an acknowledged own undo and clears it on a peer revision", async () => {
  let current = structuredClone(project);
  const session = new SharedSession(
    {
      load: async () => current,
      apply: async (_id, op) => {
        current = {
          ...current,
          revision: current.revision + 1,
          document: { ...op.draft, revision: current.revision + 1 },
        };
        return current;
      },
    },
    "p",
  );
  await session.refresh();
  await session.change({ ...project.document, name: "Mine" });
  expect(session.canUndo).toBe(true);
  await session.undo();
  expect(session.state.current?.document.name).toBe("Research");
  expect(session.canUndo).toBe(false);
  await session.change({ ...session.state.current!.document, name: "Again" });
  current = {
    ...current,
    revision: current.revision + 1,
    document: {
      ...current.document,
      revision: current.revision + 1,
      name: "Peer",
    },
  };
  await session.refresh();
  expect(session.canUndo).toBe(false);
});
it("ignores a stale refresh arriving after an acknowledged edit", async () => {
  let slow = false;
  let resolve!: (p: CloudProject) => void;
  const session = new SharedSession(
    {
      load: async () =>
        slow
          ? new Promise((done) => {
              resolve = done;
            })
          : project,
      apply: async (_id, op) => ({
        ...project,
        revision: 1,
        document: { ...op.draft, revision: 1 },
      }),
    },
    "p",
  );
  await session.refresh();
  slow = true;
  const refresh = session.refresh();
  await session.change({ ...project.document, name: "New" });
  resolve(project);
  await refresh;
  expect(session.state.current?.document.name).toBe("New");
});
it("preserves the pending draft when the browser goes offline", async () => {
  let resolve!: (row: CloudProject) => void;
  const session = new SharedSession(
    {
      load: async () => project,
      apply: () =>
        new Promise((done) => {
          resolve = done;
        }),
    },
    "p",
  );
  await session.refresh();
  const pending = session.change({
    ...project.document,
    name: "Offline draft",
  });
  session.setOnline(false);
  expect(session.state.draft?.name).toBe("Offline draft");
  expect(session.state.uncertain?.id).toBeTruthy();
  resolve({
    ...project,
    revision: 1,
    document: { ...project.document, name: "Late response", revision: 1 },
  });
  await pending;
  expect(session.state.current?.document.name).toBe("Research");
});
it("requires an explicit choice before applying a conflicting draft", async () => {
  let current = structuredClone(project);
  let first = true;
  const session = new SharedSession(
    {
      load: async () => current,
      apply: async (_id, operation) => {
        if (first) {
          first = false;
          current = {
            ...current,
            revision: 1,
            document: { ...current.document, name: "Peer", revision: 1 },
          };
          throw { code: "40001" };
        }
        current = {
          ...current,
          revision: 2,
          document: { ...operation.draft, revision: 2 },
        };
        return current;
      },
    },
    "p",
  );
  await session.refresh();
  await session.change({ ...project.document, name: "Mine" });
  expect(session.state.current?.document.name).toBe("Peer");
  await session.applyDraftAgainstLatest();
  expect(session.state.current?.document.name).toBe("Mine");
  expect(session.state.current?.revision).toBe(2);
});
it("removes acknowledged data when access is revoked during conflict reload", async () => {
  let loads = 0;
  const session = new SharedSession(
    {
      load: async () => {
        if (loads++ === 0) return project;
        throw { code: "42501" };
      },
      apply: async () => {
        throw { code: "40001" };
      },
    },
    "p",
  );
  await session.refresh();
  await session.change({ ...project.document, name: "Mine" });
  expect(session.state.current).toBeNull();
  expect(session.state.draft?.name).toBe("Mine");
  expect(session.state.error).toContain("access unavailable");
});
