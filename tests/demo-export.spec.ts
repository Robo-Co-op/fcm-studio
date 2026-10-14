import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

for (const kind of ["SVG", "PNG"]) {
  test(`${kind} exports the editor that requested it`, async ({ page }) => {
    await page.setViewportSize({ width: 1800, height: 1000 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Continue with Google (demo)" })
      .click();
    await page
      .getByRole("button", { name: /Neighborhood resilience map/ })
      .click();
    await page
      .getByRole("button", { name: "Demo: show two editors side by side" })
      .click();
    await page.locator(".react-flow").nth(1).waitFor();
    await page.locator(".react-flow").evaluateAll((maps) =>
      maps.forEach((map, index) => {
        map.setAttribute("data-export-origin", String(index));
        const marker = document.createElement("div");
        marker.style.cssText = `position:absolute;left:10px;top:10px;width:50px;height:50px;z-index:9999;background:${index ? "rgb(0,0,255)" : "rgb(255,0,0)"}`;
        map.appendChild(marker);
      }),
    );
    const second = page.locator(".demo-editor-column").nth(1);
    await second.getByRole("button", { name: "Export", exact: true }).click();
    const downloading = page.waitForEvent("download");
    await second.getByRole("button", { name: `Map ${kind}` }).click();
    const bytes = await readFile(await (await downloading).path());
    if (kind === "SVG") {
      expect(bytes.toString()).toContain('data-export-origin="1"');
      expect(bytes.toString()).not.toContain('data-export-origin="0"');
    } else {
      const pixel = await page.evaluate(async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return Array.from(context.getImageData(20, 20, 1, 1).data);
      }, bytes.toString("base64"));
      expect(pixel).toEqual([0, 0, 255, 255]);
    }
  });
}
