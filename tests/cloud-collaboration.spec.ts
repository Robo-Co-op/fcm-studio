import { test, expect, type Browser, type Page } from "@playwright/test";
import type { Project } from "../src/model";

// 外部 HTTP 境界の共有状態。Postgres/RLS/Realtime 自体の検証ではない。
function authority() {
  let revoked = false;
  let document: Project = {
    version: 1,
    id: "11111111-1111-4111-8111-111111111111",
    name: "Shared research",
    agenda: "Wellbeing",
    revision: 0,
    model: {
      factors: [
        {
          id: "seed",
          label: "Trust",
          x: 0,
          y: 0,
          color: "#dce9dd",
          provenance: "human",
        },
        {
          id: "access",
          label: "Access",
          x: 350,
          y: 0,
          color: "#cae6dc",
          provenance: "human",
        },
      ],
      relationships: [],
    },
    baseline: { factors: [], relationships: [] },
    scenarios: [],
    runs: [],
  };
  return {
    get document() {
      return document;
    },
    revoke() {
      revoked = true;
    },
    async open(browser: Browser, role = "editor") {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.addInitScript(() =>
        localStorage.setItem(
          "sb-fcm-test-auth-token",
          JSON.stringify({
            access_token: "synthetic-token",
            refresh_token: "synthetic-refresh",
            token_type: "bearer",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: {
              id: "22222222-2222-4222-8222-222222222222",
              email: "test@example.test",
              app_metadata: {},
              user_metadata: {},
              aud: "authenticated",
            },
          }),
        ),
      );
      await page.route("https://fcm-test.supabase.co/**", async (route) => {
        const url = new URL(route.request().url());
        const row = () => ({
          id: document.id,
          document,
          revision: document.revision,
          project_members: [{ role }],
        });
        if (url.pathname === "/rest/v1/projects") {
          if (revoked)
            return route.fulfill({
              status: 403,
              json: { code: "42501", message: "Membership revoked" },
            });
          return route.fulfill({
            json: url.searchParams.has("id") ? row() : [row()],
          });
        }
        if (url.pathname === "/rest/v1/rpc/apply_project_command") {
          const body = route.request().postDataJSON() as {
            p_expected_revision: number;
            p_command: {
              type: string;
              model: Project["model"];
              name: string;
              agenda: string;
            };
          };
          if (role === "viewer")
            return route.fulfill({
              status: 403,
              json: { code: "42501", message: "Forbidden" },
            });
          if (body.p_expected_revision !== document.revision)
            return route.fulfill({
              status: 409,
              json: { code: "40001", message: "Project revision conflict" },
            });
          document = {
            ...document,
            ...(body.p_command.type === "replace_model"
              ? { model: body.p_command.model }
              : { name: body.p_command.name, agenda: body.p_command.agenda }),
            revision: document.revision + 1,
          };
          return route.fulfill({ json: row() });
        }
        return route.abort();
      });
      await page.goto("/");
      await page.getByRole("button", { name: /Shared research/ }).click();
      await expect(
        page.getByRole("heading", { name: "Shared research" }),
      ).toBeVisible();
      return page;
    },
  };
}
async function addFactor(page: Page, label: string) {
  await page.getByRole("button", { name: "Add factor", exact: true }).click();
  await page.getByRole("textbox", { name: "New factor name" }).fill(label);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add factor", exact: true })
    .click();
}
const node = (page: Page, label: string) =>
  page.locator(".react-flow__node").filter({ hasText: label });
async function refresh(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

test("two sessions see a committed factor in map and matrix after focus refresh", async ({
  browser,
}) => {
  const db = authority();
  const first = await db.open(browser);
  const second = await db.open(browser);
  await addFactor(first, "Mutual support");
  await expect(node(first, "Mutual support")).toBeVisible();
  await refresh(second);
  await expect(node(second, "Mutual support")).toBeVisible();
  await expect(
    second.getByRole("textbox", {
      name: "Mutual support → Trust",
      exact: true,
    }),
  ).toBeVisible();
  await second.screenshot({
    path: "test-results/cloud-collaboration.png",
    fullPage: true,
  });
  await first.context().close();
  await second.context().close();
});

test("stale edit cannot overwrite a peer and the attempted draft is retained", async ({
  browser,
}) => {
  const db = authority();
  const first = await db.open(browser);
  const second = await db.open(browser);
  await addFactor(first, "Committed peer factor");
  await expect(node(first, "Committed peer factor")).toBeVisible();
  await addFactor(second, "My stale draft");
  await expect(second.getByText(/Project revision conflict/)).toBeVisible();
  await expect(
    second.getByRole("button", { name: "Export unsaved draft" }),
  ).toBeVisible();
  await expect(
    second.getByRole("button", { name: "Apply my draft over latest" }),
  ).toBeVisible();
  expect(db.document.model.factors.map((factor) => factor.label)).toEqual([
    "Trust",
    "Access",
    "Committed peer factor",
  ]);
  await expect(
    second.getByRole("button", { name: /draft/i }).first(),
  ).toBeVisible();
  await first.context().close();
  await second.context().close();
});

test("same matrix cell conflict keeps the acknowledged peer weight", async ({
  browser,
}) => {
  const db = authority();
  const first = await db.open(browser);
  const second = await db.open(browser);
  const firstCell = first.getByRole("textbox", {
    name: "Trust → Access",
    exact: true,
  });
  await firstCell.fill("0.3");
  await firstCell.blur();
  await expect(first.getByText(/revision 1/)).toBeVisible();
  const staleCell = second.getByRole("textbox", {
    name: "Trust → Access",
    exact: true,
  });
  await staleCell.fill("-0.5");
  await staleCell.blur();
  await expect(second.getByText(/Project revision conflict/)).toBeVisible();
  expect(db.document.model.relationships).toContainEqual(
    expect.objectContaining({ source: "seed", target: "access", weight: 0.3 }),
  );
  await first.context().close();
  await second.context().close();
});

test("multi-cell matrix paste commits atomically as one revision", async ({
  browser,
}) => {
  const db = authority();
  const editor = await db.open(browser);
  await editor.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Trust → Trust"]',
    );
    if (!input) throw new Error("Matrix origin missing");
    const clipboard = new DataTransfer();
    clipboard.setData("text", "0\t0.2\n-0.4\t0");
    input.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, clipboardData: clipboard }),
    );
  });
  await expect(editor.getByText(/revision 1/)).toBeVisible();
  expect(db.document.revision).toBe(1);
  expect(db.document.model.relationships).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: "seed",
        target: "access",
        weight: 0.2,
      }),
      expect.objectContaining({
        source: "access",
        target: "seed",
        weight: -0.4,
      }),
    ]),
  );
  await editor.context().close();
});

test("membership revocation removes the open project from the rendered page", async ({
  browser,
}) => {
  const db = authority();
  const editor = await db.open(browser);
  db.revoke();
  await refresh(editor);
  await expect(
    editor.getByRole("heading", { name: "Project access unavailable" }),
  ).toBeVisible();
  await expect(editor.getByText("Trust", { exact: true })).toHaveCount(0);
  await editor.context().close();
});

test("viewer and offline sessions disable mutation and reconnect refreshes", async ({
  browser,
}) => {
  const db = authority();
  const viewer = await db.open(browser, "viewer");
  await expect(
    viewer.getByRole("button", { name: "Add factor", exact: true }),
  ).toBeDisabled();
  const editor = await db.open(browser);
  await editor.context().setOffline(true);
  await expect(
    editor.getByRole("button", { name: "Add factor", exact: true }),
  ).toBeDisabled();
  await editor.context().setOffline(false);
  await expect(
    editor.getByRole("button", { name: "Add factor", exact: true }),
  ).toBeEnabled();
  await viewer.context().close();
  await editor.context().close();
});

test("peer revision disables stale undo and project details save explicitly", async ({
  browser,
}) => {
  const db = authority();
  const first = await db.open(browser);
  const second = await db.open(browser);
  await addFactor(first, "First contribution");
  await expect(
    first.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await refresh(second);
  await expect(node(second, "First contribution")).toBeVisible();
  await addFactor(second, "Second contribution");
  await expect(node(second, "Second contribution")).toBeVisible();
  await refresh(first);
  await expect(
    first.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await first.getByRole("button", { name: "Edit project details" }).click();
  await first
    .getByRole("dialog")
    .getByRole("textbox")
    .first()
    .fill("Revised research");
  await first.getByRole("button", { name: "Save details" }).click();
  await expect(
    first.getByRole("heading", { name: "Revised research" }),
  ).toBeVisible();
  expect(db.document.name).toBe("Revised research");
  await first.context().close();
  await second.context().close();
});
