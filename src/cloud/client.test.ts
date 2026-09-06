import { describe, expect, it } from "vitest";
import { readCloudConfig } from "./client";
describe("cloud configuration", () => {
  it("keeps offline use available when configuration is missing", () => {
    expect(readCloudConfig({})).toBeNull();
    expect(
      readCloudConfig({ VITE_SUPABASE_URL: "https://example.supabase.co" }),
    ).toBeNull();
  });
});
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CloudRoot } from "./CloudRoot";
it("renders the offline workspace by default without cloud configuration", () => {
  expect(
    renderToStaticMarkup(
      createElement(CloudRoot, {
        renderLocal: () => "Offline workspace",
        renderProject: () => "Cloud document",
      }),
    ),
  ).toContain("Offline workspace");
});
