import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: true,
  timeout: 60_000,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:5173",
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
