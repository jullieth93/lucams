/*
 * Playwright config para E2E browser tests.
 *
 * Estrategia:
 *  - Tests en `tests/e2e/*.spec.ts` (separados de unit tests vitest)
 *  - Levanta `next dev` automáticamente en localhost:3000 antes de
 *    correr (webServer config). En CI con `PLAYWRIGHT_BASE_URL` apunta
 *    a Vercel preview.
 *  - Chromium only por default (suficiente para smoke). Firefox/Safari
 *    se suman en sub-bloque L (QA exhaustivo cross-browser).
 *  - Retries 2 en CI, 0 local (debugging más claro).
 *  - Reporter html + line en CI, list local.
 */

import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ?? "3000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [["html", { open: "never" }], ["line"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: "pnpm dev",
          url: BASE_URL,
          reuseExistingServer: !isCI,
          timeout: 180_000,
        },
      }),
});
