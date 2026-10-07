import { defineConfig, devices } from "@playwright/test";

// デモモード（VITE_DEMO_MODE=true）の E2E。既定設定とポートを分けて共存させる
export default defineConfig({
  testDir: "./tests",
  testMatch: "demo-*.spec.ts",
  timeout: 30_000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  outputDir: "test-results/demo",
  use: {
    baseURL: "http://127.0.0.1:5190",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_CHANNEL
          ? { channel: process.env.PLAYWRIGHT_CHANNEL }
          : {}),
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 5190 --strictPort",
    url: "http://127.0.0.1:5190",
    env: { VITE_DEMO_MODE: "true" },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
