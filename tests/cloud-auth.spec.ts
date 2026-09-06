import { test, expect, type Page } from "@playwright/test";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const storageKey = "sb-fcm-test-auth-token";
const document = {
  version: 1,
  id: projectId,
  name: "Private cloud research",
  agenda: "Community wellbeing",
  revision: 0,
  model: { factors: [], relationships: [] },
  baseline: { factors: [], relationships: [] },
  scenarios: [],
  runs: [],
};
const session = {
  access_token: "synthetic-access-token",
  refresh_token: "synthetic-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: userId,
    email: "researcher@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-09-06T00:00:00Z",
  },
};
async function authenticated(page: Page) {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session },
  );
}
async function boundary(page: Page, options: { failList?: boolean } = {}) {
  let saved = structuredClone(document);
  await page.route("https://fcm-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/auth/v1/logout")
      return route.fulfill({ status: 204 });
    if (url.pathname === "/auth/v1/user")
      return route.fulfill({ json: session.user });
    if (url.pathname === "/rest/v1/rpc/create_project") {
      const body = route.request().postDataJSON() as {
        p_document: typeof document;
      };
      saved = { ...body.p_document, id: projectId, revision: 0 };
      return route.fulfill({ json: { id: projectId } });
    }
    if (url.pathname === "/rest/v1/projects") {
      if (options.failList)
        return route.fulfill({
          status: 403,
          json: { message: "Membership is no longer available", code: "42501" },
        });
      const row = {
        id: projectId,
        document: saved,
        revision: 0,
        project_members: [{ role: "owner" }],
      };
      return route.fulfill({ json: url.searchParams.has("id") ? row : [row] });
    }
    return route.abort();
  });
}

test("Google OAuth begins with PKCE and returns to this app", async ({
  page,
}) => {
  await boundary(page);
  await page.route(
    "https://fcm-test.supabase.co/auth/v1/authorize**",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>OAuth boundary reached</h1>",
      }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Think together. Map what matters." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/cloud-auth-login.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(
    page.getByRole("heading", { name: "OAuth boundary reached" }),
  ).toBeVisible();
  const url = new URL(page.url());
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("code_challenge_method")).toBe("s256");
  expect(url.searchParams.get("code_challenge")).toBeTruthy();
  expect(url.searchParams.get("redirect_to")).toBe("http://127.0.0.1:5174/");
});

test("restored session creates a private project and opens an editable map", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await authenticated(page);
  await boundary(page);
  await page.goto("/");
  await expect(
    page.getByText("Signed in as researcher@example.test"),
  ).toBeVisible();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Workshop outcomes");
  await page
    .getByLabel("Research agenda", { exact: true })
    .fill("What improves wellbeing?");
  await page.getByRole("button", { name: "Create private project" }).click();
  await expect(
    page.getByRole("heading", { name: "Workshop outcomes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New project", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Add factor", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Explore with AI", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/cloud-auth-project.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(
    page.getByText("Workshop outcomes", { exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("local project is copied explicitly without changing the local original", async ({
  page,
}) => {
  await authenticated(page);
  await boundary(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Return to local workspace" }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page
    .getByRole("button", { name: "Cloud workspace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import local project", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add factor", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "A thriving community cooperative" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to projects" }).click();
  await page.getByRole("button", { name: "Return to local workspace" }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A thriving community cooperative" }),
  ).toBeVisible();
});

test("denied cloud requests show an error while local research stays available", async ({
  page,
}) => {
  await authenticated(page);
  await boundary(page, { failList: true });
  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Private cloud research" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Return to local workspace" }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
});

test("a project response arriving after sign-out cannot restore the old account", async ({
  page,
}) => {
  await authenticated(page);
  await boundary(page);
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let requestStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  await page.route(
    "https://fcm-test.supabase.co/rest/v1/projects**",
    async (route) => {
      requestStarted();
      await responseGate;
      await route.fulfill({
        json: [
          {
            id: projectId,
            document,
            revision: 0,
            project_members: [{ role: "owner" }],
          },
        ],
      });
    },
  );
  await page.goto("/");
  await started;
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  const response = page.waitForResponse((result) =>
    result.url().includes("/rest/v1/projects"),
  );
  releaseResponse();
  await response;
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(
    page.getByText("Private cloud research", { exact: true }),
  ).toHaveCount(0);
});
