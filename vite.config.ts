import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  // DBテストは単体2秒弱でも全並列実行時に5秒の既定を超えるため余裕を持たせる
  test: { include: ["src/**/*.test.ts", "server/**/*.test.ts"], testTimeout: 20_000 },
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
});
