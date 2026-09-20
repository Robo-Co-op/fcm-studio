import { expect, test, type Page } from "@playwright/test";
import type { Scenario } from "../src/model";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const token = "33333333-3333-4333-8333-333333333333";
const invitationId = "44444444-4444-4444-8444-444444444444";
const project = {
  version: 1 as const,
  id: projectId,
  name: "Invited research",
  agenda: "What improves community trust?",
  revision: 0,
  model: {
    factors: [
      {
        id: "trust",
        label: "Trust",
        color: "#cae6dc",
        x: 0,
        y: 0,
        provenance: "human",
      },
    ],
    relationships: [],
  },
  baseline: { factors: [], relationships: [] },
  scenarios: [],
  runs: [],
};

async function authenticated(page: Page, email: string) {
  await page.addInitScript(
    ({ email, userId }) =>
      localStorage.setItem(
        "sb-fcm-test-auth-token",
        JSON.stringify({
          access_token: "synthetic-token",
          refresh_token: "synthetic-refresh",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: userId,
            email,
            app_metadata: {},
            user_metadata: {},
            aud: "authenticated",
          },
        }),
      ),
    { email, userId },
  );
}

async function boundary(
  page: Page,
  role: "owner" | "editor" | "viewer",
  failFirstAccept = false,
  sharedHistory: { scenarios: Scenario[] } = { scenarios: [] },
) {
  let accepted = 0;
  let baselineWrites = 0;
  let scenarioWrites = 0;
  let runWrites = 0;
  let pending = false;
  await page.route("https://fcm-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const row = {
      id: projectId,
      document: project,
      revision: 0,
      project_members: [{ role }],
    };
    if (url.pathname === "/auth/v1/user")
      return route.fulfill({
        json: {
          id: userId,
          email:
            role === "owner" ? "owner@example.test" : "invitee@example.test",
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
        },
      });
    if (url.pathname === "/rest/v1/projects")
      return route.fulfill({
        json: url.searchParams.has("id") ? row : [row],
      });
    if (url.pathname === "/rest/v1/project_baselines")
      return route.fulfill({ status: 200, json: null });
    if (url.pathname === "/rest/v1/project_scenarios")
      return route.fulfill({ json: sharedHistory.scenarios });
    if (url.pathname === "/rest/v1/project_runs")
      return route.fulfill({ json: [] });
    if (url.pathname === "/rest/v1/rpc/accept_project_invitation") {
      accepted += 1;
      expect(route.request().postDataJSON()).toEqual({ p_token: token });
      if (failFirstAccept && accepted === 1)
        return route.fulfill({
          status: 503,
          json: { code: "TEMPORARY", message: "Temporary invitation failure" },
        });
      return route.fulfill({
        json: { project_id: projectId, user_id: userId, role: "viewer" },
      });
    }
    if (url.pathname === "/rest/v1/rpc/list_project_members")
      return route.fulfill({ json: [{ user_id: userId, role: "owner" }] });
    if (url.pathname === "/rest/v1/rpc/list_project_invitations")
      return route.fulfill({
        json: pending
          ? [
              {
                id: invitationId,
                email: "participant@example.org",
                role: "editor",
                expires_at: "2026-09-14T00:00:00Z",
                consumed_at: null,
                revoked_at: null,
                created_at: "2026-09-07T00:00:00Z",
              },
            ]
          : [],
      });
    if (url.pathname === "/rest/v1/rpc/create_project_invitation") {
      pending = true;
      return route.fulfill({
        json: [
          {
            id: invitationId,
            token,
            email: "participant@example.org",
            role: "editor",
            expires_at: "2026-09-14T00:00:00Z",
          },
        ],
      });
    }
    if (url.pathname === "/rest/v1/rpc/revoke_project_invitation") {
      pending = false;
      return route.fulfill({ json: null });
    }
    if (url.pathname === "/rest/v1/rpc/save_project_run") {
      runWrites += 1;
      return route.fulfill({ json: null });
    }
    if (url.pathname === "/rest/v1/rpc/save_project_baseline") {
      baselineWrites += 1;
      return route.fulfill({ json: null });
    }
    if (url.pathname === "/rest/v1/rpc/save_project_scenario") {
      scenarioWrites += 1;
      const body = route.request().postDataJSON() as {
        p_scenario: Scenario;
      };
      sharedHistory.scenarios.push(body.p_scenario);
      return route.fulfill({ json: null });
    }
    return route.abort();
  });
  return {
    accepted: () => accepted,
    baselineWrites: () => baselineWrites,
    scenarioWrites: () => scenarioWrites,
    runWrites: () => runWrites,
  };
}

test("owner creates a single-display invitation link and can revoke it", async ({
  page,
}) => {
  await authenticated(page, "owner@example.test");
  await boundary(page, "owner");
  await page.goto("/");
  await page.getByRole("button", { name: /Invited research/ }).click();
  await page.getByRole("button", { name: "Manage access" }).click();
  await page.getByLabel("Email address").fill("participant@example.org");
  await page.getByRole("button", { name: "Create invitation link" }).click();
  await expect(page.getByLabel("Invitation link")).toHaveValue(
    `http://127.0.0.1:5174/#invite=${token}`,
  );
  await expect(page.getByText("participant@example.org")).toBeVisible();
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("No pending invitations.")).toBeVisible();
});

test("editor saves baseline, scenario, and simulation run as shared history", async ({
  page,
}) => {
  await authenticated(page, "editor@example.test");
  const calls = await boundary(page, "editor");
  await page.goto("/");
  await page.getByRole("button", { name: /Invited research/ }).click();
  await page.getByRole("button", { name: "Simulate" }).click();
  page.once("dialog", (dialog) => dialog.accept("Shared scenario"));
  await page.getByRole("button", { name: "Save scenario" }).click();
  await expect(
    page.getByText("Scenario saved to shared history."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(
    page.getByText("Simulation saved to shared history."),
  ).toBeVisible();
  expect(calls.baselineWrites()).toBe(1);
  expect(calls.scenarioWrites()).toBe(1);
  expect(calls.runWrites()).toBe(1);
});

test("invite is removed from the URL and a viewer can simulate without a shared write", async ({
  page,
}) => {
  await authenticated(page, "invitee@example.test");
  const calls = await boundary(page, "viewer");
  await page.goto(`/#invite=${token}`);
  await expect(
    page.getByRole("heading", { name: "Invited research" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.has("invite")).toBe(false);
  expect(new URL(page.url()).hash).not.toContain("invite");
  expect(calls.accepted()).toBe(1);
  await expect(
    page.getByRole("button", { name: "Add factor", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Simulate" }).click();
  await expect(
    page.getByRole("button", { name: "Run simulation" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(
    page.getByText("Simulation result stays in this browser session."),
  ).toBeVisible();
  expect(calls.runWrites()).toBe(0);
});

test("a temporary invitation failure keeps a safe retry path", async ({
  page,
}) => {
  await authenticated(page, "invitee@example.test");
  const calls = await boundary(page, "viewer", true);
  await page.goto(`/#invite=${token}`);
  await expect(page.getByText("Temporary invitation failure")).toBeVisible();
  expect(new URL(page.url()).hash).not.toContain("invite");
  await page.getByRole("button", { name: "Retry invitation" }).click();
  await expect(
    page.getByRole("heading", { name: "Invited research" }),
  ).toBeVisible();
  expect(calls.accepted()).toBe(2);
});

test("a peer scenario appears after the shared history refreshes", async ({
  browser,
}) => {
  const sharedHistory = { scenarios: [] as Scenario[] };
  const editorContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  const editor = await editorContext.newPage();
  const viewer = await viewerContext.newPage();
  await authenticated(editor, "editor@example.test");
  await authenticated(viewer, "viewer@example.test");
  await boundary(editor, "editor", false, sharedHistory);
  await boundary(viewer, "viewer", false, sharedHistory);
  await editor.goto("/");
  await viewer.goto("/");
  await editor.getByRole("button", { name: /Invited research/ }).click();
  await viewer.getByRole("button", { name: /Invited research/ }).click();
  await editor.getByRole("button", { name: "Simulate" }).click();
  editor.once("dialog", (dialog) => dialog.accept("Peer scenario"));
  await editor.getByRole("button", { name: "Save scenario" }).click();
  await expect(
    editor.getByText("Scenario saved to shared history."),
  ).toBeVisible();
  await viewer.evaluate(() => window.dispatchEvent(new Event("focus")));
  await viewer.getByRole("button", { name: "Simulate" }).click();
  await expect(viewer.getByLabel("Load scenario")).toContainText(
    "Peer scenario",
  );
  await editorContext.close();
  await viewerContext.close();
});
