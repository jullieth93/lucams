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

// El dev server de esta VM corre en :4000 (gestionado por make en
// lucams-shop-local). Default a 4000 y reusa el server ya levantado; en CI se
// usa PLAYWRIGHT_BASE_URL (Vercel preview).
const PORT = process.env.PORT ?? "4000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  // 60s por test (default 30s): los flujos de carrito/checkout hacen addToCart
  // (~10s) + un toPass de hasta 30s que tolera el read-after-write del pooler;
  // 30s no alcanza para ambos y el test time out antes de que el toPass reintente.
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: isCI,
  // 2 reintentos: los flujos que mutan el carrito corren contra `next dev` (no
  // optimizado para concurrencia) + el pooler de Supabase; bajo carga el
  // read-after-write flakea. toPass cubre la mayoría; los reintentos son la red.
  retries: 2,
  // Local (contra `next dev`): 1 worker. El dev server + el pooler de Supabase no
  // toleran mutaciones de carrito concurrentes — dos add-to-cart en paralelo hacen
  // que uno pierda su redirect `?added=1` (verificado: serial pasa, paralelo flakea).
  // CI corre contra el build prod de Vercel (sí aguanta concurrencia) → 2 workers.
  workers: isCI ? 2 : 1,
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
          command: "PORT=4000 pnpm dev",
          url: BASE_URL,
          reuseExistingServer: !isCI,
          timeout: 180_000,
        },
      }),
});
