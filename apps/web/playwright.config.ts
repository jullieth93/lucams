/*
 * Playwright config — suite E2E y homologación de ambientes (docs/TESTING.md).
 *
 * Estrategia:
 *  - Tests en `tests/e2e/*.spec.ts` (separados de unit tests vitest).
 *  - Ambiente explícito vía E2E_ENV=local|stg|prd (default local — ver
 *    tests/e2e/_setup/env.ts): decide el .env que carga el runner, el baseURL
 *    y el bypass de Vercel (STG inyecta x-vercel-protection-bypass vía
 *    extraHTTPHeaders si VERCEL_BYPASS_TOKEN está presente).
 *    `PLAYWRIGHT_BASE_URL` explícita siempre gana y apaga el webServer local
 *    (compat con previews puntuales y release-check-a1).
 *  - Projects: desktop-chrome (1280×800) y mobile-chrome (390×844) — la matriz
 *    flujo × viewport corre gratis: cada spec corre en ambos. El gate de CI
 *    fija --project=desktop-chrome (ci.yml / nightly-full.yml).
 *  - Auth compartida SOLO vía storageState por ambiente, generado en
 *    global.setup cuando E2E_AUTH=1 (homologación). Sin E2E_AUTH el setup es
 *    no-op y los specs que requieren auth se saltan con mensaje claro — así el
 *    gate de CI (sin GoTrue) sigue verde.
 *  - Evidencia: trace retain-on-failure, screenshot al fallo, video en primer
 *    retry, reporters line+html+json en CI.
 *  - Levanta el server automáticamente solo en LOCAL sin PLAYWRIGHT_BASE_URL:
 *    local → `next dev`; CI → `next start` sobre el build de producción.
 *  - Retries 2 en CI, 0 local (debugging más claro).
 */

import { defineConfig, devices } from "@playwright/test";
import { baseUrlFor, currentEnv, extraHeadersFor, loadEnvFor } from "./tests/e2e/_setup/env";

const E2E_ENV = currentEnv();
// Carga el .env del ambiente en el proceso runner (lo heredan workers y el
// webServer). No-op si el archivo no existe (CI inyecta sus propias vars).
loadEnvFor(E2E_ENV);

const PORT = process.env.PORT ?? "4000";
const BASE_URL = baseUrlFor(E2E_ENV);
const isCI = !!process.env.CI;
// Servidor gestionado por Playwright SOLO en local sin URL explícita. STG/PRD
// apuntan a infraestructura viva — nunca se levanta server para ellos.
const manageLocalServer = E2E_ENV === "local" && !process.env.PLAYWRIGHT_BASE_URL;

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
  reporter: isCI
    ? [
        ["html", { open: "never" }],
        ["line"],
        ["json", { outputFile: "test-results/playwright-results.json" }],
      ]
    : "list",
  globalSetup: "./tests/e2e/_setup/global.setup.ts",
  globalTeardown: "./tests/e2e/_setup/global.teardown.ts",
  use: {
    baseURL: BASE_URL,
    // Bypass de protección de Vercel (STG). En local/PRD es {}.
    extraHTTPHeaders: extraHeadersFor(E2E_ENV),
    // PW_CHANNEL=chromium → build completo en vez de chromium_headless_shell.
    // Páginas de terceros con anti-bot (checkout hospedado de Wompi) detectan
    // el headless shell y bloquean el CTA ~50% de las corridas (verificado
    // 2026-07-28, intentos e2e 15-19 vs 13/14/18).
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      // Matriz §6 del prompt: Desktop 1280×800.
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      // Matriz §6 del prompt: Mobile 390×844 (Chrome móvil con touch).
      // Los audits de admin en 375×812 fijan su propio viewport dentro del spec
      // (precedente: mobile-admin-audit.spec.ts).
      name: "mobile-chrome",
      use: { ...devices["Mobile Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      // Cross-browser §8 ("WebKit/Firefox como matriz ampliada"): storefront
      // público read-only (smoke) en Firefox — no corre specs de mutación.
      // Fuera del gate CI (que fija --project=desktop-chrome).
      // Requiere libs de SO (playwright install-deps firefox / equivalente dnf:
      // gtk3). Verificado en Oracle Linux 9 el 2026-08-07.
      name: "desktop-firefox",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 800 } },
      testMatch: /smoke\.spec\.ts/,
    },
    {
      // Cross-browser §8: idem en WebKit (motor de Safari iOS/macOS).
      // OJO (2026-08-07): en Oracle Linux 9 NO arranca — browserType.launch
      // aborta pidiendo libgtk-4-1 / libicu74 / libmanette-0.2-0 … (OL9 trae
      // icu 67 y no empaqueta webkitgtk-6.0; verificado corriendo el project:
      // los 6 tests de página fallan en launch, los 3 de solo-request pasan).
      // Correrlo donde existan las deps (imagen oficial mcr playwright, macOS,
      // Ubuntu reciente); en OL9 usar --project=desktop-firefox.
      name: "desktop-webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } },
      testMatch: /smoke\.spec\.ts/,
    },
  ],
  ...(manageLocalServer
    ? {
        webServer: {
          // CI: build de producción ya generado → `next start` (estable bajo carga).
          // Local: `next dev` con hot-reload. Ambos en el PORT configurado.
          command: isCI ? `pnpm exec next start -p ${PORT}` : `PORT=${PORT} pnpm dev`,
          url: BASE_URL,
          reuseExistingServer: !isCI,
          timeout: 180_000,
        },
      }
    : {}),
});
