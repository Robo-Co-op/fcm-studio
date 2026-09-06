import { defineConfig, devices } from "@playwright/test";

// 外部 Supabase 境界だけを差し替える描画検証。実 OAuth / RLS の証明には使わない。
export default defineConfig({
  testDir: "./tests",
  testMatch: "cloud-auth.spec.ts",
  timeout: 30_000,
  expect: { timeout: 5000 },
  retries: 0,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/cloud-auth",
  use: {
    ...devices["Desktop Chrome"],
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
    baseURL: "http://127.0.0.1:5174",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "https://fcm-test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
    },
    timeout: 30_000,
  },
});
