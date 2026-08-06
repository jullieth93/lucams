/*
 * Fixture de auth E2E — storageState por ambiente (PROMPT_E2E_HOMOLOGACION §8:
 * "auth compartida SOLO vía storageState generado en global.setup por ambiente").
 *
 *   import { test, expect } from "./fixtures/auth";
 *   test("...", async ({ adminPage }) => { ... });
 *
 * `adminPage` / `clientPage` abren un contexto NUEVO con el storageState del
 * ambiente (generado por _setup/global.setup.ts con E2E_AUTH=1). Si el state
 * file no existe el test se SALTA con mensaje claro (así el gate de CI, sin
 * GoTrue, sigue verde).
 *
 * `anonPage` es el cliente anónimo de las verificaciones admin→cliente: un
 * contexto fresco SIN cookies de admin (el `page` por defecto del worker
 * podría estar contaminado si el spec usa storageState a nivel describe).
 */
import { existsSync } from "node:fs";
import { test as base, expect, type Browser, type Page } from "@playwright/test";
import { authStatePath, baseUrlFor, currentEnv, extraHeadersFor, loadEnvFor } from "../_setup/env";

export const E2E_ENV = currentEnv();
loadEnvFor(E2E_ENV);

async function pageWithState(browser: Browser, role: "admin" | "client"): Promise<Page> {
  const statePath = authStatePath(E2E_ENV, role);
  base.skip(
    !existsSync(statePath),
    `No hay storageState de ${role} para ${E2E_ENV}. Corre con E2E_AUTH=1 ` +
      `(E2E_ENV=${E2E_ENV} E2E_AUTH=1 playwright test ...) para generarlo.`,
  );
  const context = await browser.newContext({
    baseURL: baseUrlFor(E2E_ENV),
    extraHTTPHeaders: extraHeadersFor(E2E_ENV),
    storageState: statePath,
    ignoreHTTPSErrors: true,
  });
  return context.newPage();
}

export const test = base.extend<{ adminPage: Page; clientPage: Page; anonPage: Page }>({
  adminPage: async ({ browser }, use) => {
    const page = await pageWithState(browser, "admin");
    await use(page);
    await page.context().close();
  },
  clientPage: async ({ browser }, use) => {
    const page = await pageWithState(browser, "client");
    await use(page);
    await page.context().close();
  },
  anonPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      baseURL: baseUrlFor(E2E_ENV),
      extraHTTPHeaders: extraHeadersFor(E2E_ENV),
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect };
