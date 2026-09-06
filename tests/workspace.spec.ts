import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Saved on this device")).toBeVisible();
});

test("map and matrix share factors, signed edges, identity, deletion and undo", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add factor", exact: true }).click();
  await page
    .getByRole("textbox", { name: "New factor name" })
    .fill("Access to finance");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add factor", exact: true })
    .click();
  await expect(
    page.locator(".react-flow__node").filter({ hasText: "Access to finance" }),
  ).toBeVisible();
  const cell = page.getByRole("textbox", {
    name: "Access to finance → Community trust",
    exact: true,
  });
  await cell.fill("-0.7");
  await cell.press("Enter");
  await expect(
    page.getByRole("spinbutton", { name: "Relationship weight" }),
  ).toHaveValue("-0.7");
  await expect(
    page.locator(".react-flow__edge").filter({ hasText: "-0.7" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: /11\s*Access to finance/ }).click();
  await page
    .getByRole("textbox", { name: "Factor name", exact: true })
    .fill("Fair finance");
  await page
    .getByRole("textbox", { name: "Factor name", exact: true })
    .press("Tab");
  await expect(
    page.getByRole("textbox", {
      name: "Fair finance → Community trust",
      exact: true,
    }),
  ).toHaveValue("-0.7");
  await page
    .getByRole("button", { name: "Delete factor & relationships" })
    .click();
  await expect(
    page.getByRole("textbox", {
      name: "Fair finance → Community trust",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("textbox", {
      name: "Fair finance → Community trust",
      exact: true,
    }),
  ).toHaveValue("-0.7");
  await page
    .getByRole("button", { name: "Add factor to map & matrix" })
    .click();
  await page
    .getByRole("textbox", { name: "New factor name" })
    .fill("Mutual support");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add factor", exact: true })
    .click();
  await expect(
    page.locator(".react-flow__node").filter({ hasText: "Mutual support" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", {
      name: "Mutual support → Fair finance",
      exact: true,
    }),
  ).toHaveValue("0");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", {
      name: "Fair finance → Community trust",
      exact: true,
    }),
  ).toHaveValue("-0.7");
});

test("real simulation worker calculates results and edits invalidate them", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Simulate", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Hold Community trust fixed" })
    .check();
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Scenario results" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Activation trajectories" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".result-row")
      .filter({ hasText: "Community trust" })
      .locator("strong"),
  ).toHaveText("0.500");
  const cell = page.getByRole("textbox", {
    name: "Learning opportunities → Member participation",
    exact: true,
  });
  await cell.fill("0.1");
  await cell.press("Enter");
  await page.getByRole("button", { name: "Simulate", exact: true }).click();
  await expect(page.getByText("OUTDATED", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  await expect(page.getByText("OUTDATED", { exact: true })).toHaveCount(0);
});

test("synthetic Excel round trip preserves directional weights and rejects invalid editing", async ({
  page,
}, testInfo) => {
  const cell = page.getByRole("textbox", {
    name: "Learning opportunities → Member participation",
    exact: true,
  });
  await cell.fill("4");
  await cell.press("Enter");
  await expect(cell).toHaveValue("0.7");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Excel workbook/ }).click();
  const download = await downloadPromise;
  const file = testInfo.outputPath("synthetic.xlsx");
  await download.saveAs(file);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(file);
  await expect(
    page.getByRole("button", { name: "Import as a new baseline" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Import as a new baseline" }).click();
  await expect(cell).toHaveValue("0.7");
  await expect(
    page.getByRole("textbox", {
      name: "Member participation → Learning opportunities",
      exact: true,
    }),
  ).toHaveValue("0");
  await expect(
    page.getByRole("textbox", {
      name: "Barriers to entry → Member participation",
      exact: true,
    }),
  ).toHaveValue("-0.7");
});

test("AI proposals require review and reject stale model revisions", async ({
  page,
}) => {
  // AI 境界のみを固定し、モデル操作と永続化は実装をそのまま通す。
  await page.route("**/api/draft", async (route) => {
    const body = route.request().postDataJSON() as {
      revision: number;
      model: { factors: unknown[]; relationships: unknown[] };
    };
    await route.fulfill({
      json: {
        revision: body.revision,
        summary: "Synthetic AI proposal",
        model: {
          ...body.model,
          factors: [
            ...body.model.factors,
            {
              id: "ai-finance",
              label: "AI finance",
              color: "#cae6dc",
              x: 50,
              y: 50,
              provenance: "ai",
            },
          ],
        },
      },
    });
  });
  await page.getByRole("button", { name: "Explore with AI" }).click();
  await page.getByRole("button", { name: "Generate proposal" }).click();
  await expect(
    page.getByRole("heading", { name: "Review proposal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", {
      name: "AI finance → Community trust",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review proposal" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Generate proposal" }).click();
  await expect(
    page.getByRole("button", { name: "Accept proposal" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Research agenda" })
    .fill("Changed research question");
  await page.getByRole("button", { name: "Accept proposal" }).click();
  await expect(page.getByRole("status")).toContainText("The model changed");
  await expect(
    page.getByRole("textbox", {
      name: "AI finance → Community trust",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Generate proposal" }).click();
  await page.getByRole("button", { name: "Accept proposal" }).click();
  await expect(
    page.getByRole("textbox", {
      name: "AI finance → Community trust",
      exact: true,
    }),
  ).toHaveValue("0");
  await expect(
    page.locator(".react-flow__node").filter({ hasText: "AI finance" }),
  ).toContainText("AI hypothesis");
});

test("dragging a factor persists its position and desktop workspace remains visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  const node = page
    .locator(".react-flow__node")
    .filter({ hasText: "Learning opportunities" });
  const original = await node.getAttribute("style");
  const box = await node.boundingBox();
  if (!box) throw new Error("Factor is not laid out");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 50,
    box.y + box.height / 2 + 35,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect(node).not.toHaveAttribute("style", original!);
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.getByRole("button", { name: "Fit map", exact: true }).click();
  await page.screenshot({ path: "../fcm-studio-preview.png", fullPage: true });
});

test("unreadable saved data survives recovery without autosave replacement", async ({
  page,
}) => {
  await page.evaluate(async () => {
    const modulePath = "/node_modules/.vite/deps/idb-keyval.js";
    const { set } = await import(modulePath);
    await set("fcm-studio-project", {
      version: 777,
      evidence: "preserve-original",
    });
  });
  await page.reload();
  await expect(
    page.getByText(/Saved project could not be restored/),
  ).toBeVisible();
  await expect(page.getByText(/Recovery needed/)).toBeVisible();
  await page.getByRole("button", { name: "Add factor", exact: true }).click();
  await page
    .getByRole("textbox", { name: "New factor name" })
    .fill("Recovery session factor");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add factor", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", {
      name: "Recovery session factor → Community trust",
      exact: true,
    }),
  ).toBeVisible();
  let observations = 0;
  await expect
    .poll(
      async () => {
        const evidence = await page.evaluate(async () => {
          const modulePath = "/node_modules/.vite/deps/idb-keyval.js";
          const { get } = await import(modulePath);
          return (await get("fcm-studio-project"))?.evidence;
        });
        return evidence === "preserve-original" ? ++observations : -1;
      },
      { intervals: [300] },
    )
    .toBeGreaterThanOrEqual(3);
});

test("a delayed AI response cannot cross into a new project", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route("**/api/draft", async (route) => {
    const body = route.request().postDataJSON() as {
      revision: number;
      model: unknown;
    };
    received?.();
    await held;
    await route.fulfill({
      json: { ...body, summary: "Obsolete project proposal" },
    });
  });
  await page.getByRole("button", { name: "Explore with AI" }).click();
  await page.getByRole("button", { name: "Generate proposal" }).click();
  await started;
  await page.getByRole("button", { name: "New project" }).click();
  await page.locator("input[name=name]").fill("New research");
  await page.locator("textarea[name=agenda]").fill("A new agenda");
  await page.getByRole("button", { name: "Create project" }).click();
  const response = page.waitForResponse("**/api/draft");
  release?.();
  await response;
  await expect(
    page.getByRole("heading", { name: "New research", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review proposal" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Generate proposal" }),
  ).toBeEnabled();
});
