/*
 * HOMOLOGACIÓN E2E — recomendador wizard (docs/TESTING.md):
 *
 *   los 4 pasos navegan con gestión de foco (h2 enfocado por paso, WCAG 2.4.3)
 *   → resultado con productos REALES de la DB (ocasión Cumpleaños, 12 activos)
 *   → URL refleja paso/vista → sin resultados → salidas claras ("Ajustar
 *   respuestas" vuelve al paso 3) → error del API → estado de error con
 *   reintento visible (route.fulfill, nunca pantalla en blanco).
 *
 * Corre en LOCAL y STG × desktop/mobile. Read-only para el catálogo (solo
 * lectura) — corre también en PRD como flujo de lectura seguro, pero la
 * corrida oficial es LOCAL+STG por paridad con el resto de la matriz.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { dismissCookieBanner, E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "La corrida de homologación es LOCAL/STG (PRD solo smoke read-only).");
test.setTimeout(180_000);

const run = newRunId("wizard");

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

test.afterAll(async () => {
  await disconnectDb();
});

test("recomendador: 4 pasos con foco → resultados reales → vacío con salidas → error con reintento", async ({
  anonPage,
}, testInfo) => {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const shotsDir = resolve(EVIDENCE_DIR, "shots");
  mkdirSync(shotsDir, { recursive: true });
  const resultsPath = resolve(
    EVIDENCE_DIR,
    `results-${E2E_ENV}-${testInfo.project.name}-${run}.json`,
  );
  const steps: Step[] = [];
  const record = (step: string, ok: boolean, detail?: string, screenshot?: string) =>
    steps.push({ step, ok, detail, screenshot, at: new Date().toISOString() });
  const shot = async (page: Page, name: string) => {
    const path = resolve(shotsDir, `${E2E_ENV}-${testInfo.project.name}-${run}-${name}.png`);
    await page.screenshot({ path, fullPage: false });
    return path;
  };

  // Ocasión REAL con productos activos (leída de la DB del ambiente).
  const ocasion = await db().ocasionTag.findFirst({
    where: {
      deletedAt: null,
      isActive: true,
      products: { some: { product: { isActive: true, deletedAt: null } } },
    },
    select: { slug: true, name: true },
    orderBy: { products: { _count: "desc" } },
  });
  expect(ocasion, "ocasión real con productos").not.toBeNull();

  const h2 = (text: RegExp) => anonPage.getByRole("heading", { name: text, level: 2 });
  const expectStepFocus = async (text: RegExp) => {
    await expect(h2(text)).toBeVisible({ timeout: 15_000 });
    await expect(h2(text), `el h2 "${text}" debe tener el foco (WCAG 2.4.3)`).toBeFocused();
  };

  try {
    // 1. Los 4 pasos con gestión de foco por paso. El foco del paso 1 se
    // verifica ANTES de cerrar el banner (el click de cierre lo robaría; los
    // pasos siguientes lo restaura el useEffect del wizard al transicionar).
    await anonPage.goto("/recomendador", { waitUntil: "domcontentloaded" });
    await expectStepFocus(/para qué ocasión/i);
    await dismissCookieBanner(anonPage);
    await anonPage.getByRole("button", { name: ocasion!.name, exact: true }).click();
    await anonPage.getByRole("button", { name: /siguiente/i }).click();

    await expectStepFocus(/para quién/i);
    await expect(anonPage).toHaveURL(/paso=2/);
    // Primer destinatario disponible (lista estática del wizard).
    await anonPage.locator("div.grid button[aria-pressed]").first().click();
    await anonPage.getByRole("button", { name: /siguiente/i }).click();

    await expectStepFocus(/cuánto quieres gastar/i);
    await expect(anonPage).toHaveURL(/paso=3/);
    // "Menos de $30k" (primera opción): el catálogo concentra sus productos
    // activos bajo $30k — garantiza match real con la ocasión elegida (verificado
    // contra la DB: ≥5 productos de Cumpleaños solapan el rango).
    await anonPage.locator("div.grid button[aria-pressed]").first().click();
    await anonPage.getByRole("button", { name: /siguiente/i }).click();

    await expectStepFocus(/personalizable o listo/i);
    await expect(anonPage).toHaveURL(/paso=4/);
    record("wizard-4-steps-focus", true, "h2 enfocado en los 4 pasos + URL ?paso=N");

    // 2. Resultados con productos REALES de la DB del ambiente.
    await anonPage.getByRole("button", { name: /ver recomendaciones/i }).click();
    await expect(anonPage.locator("body")).toContainText(/encontramos \d+ productos? para ti/i, {
      timeout: 30_000,
    });
    await expect(anonPage).toHaveURL(/vista=resultados/);
    const firstCardLink = anonPage.locator('a[href*="/producto/"]').first();
    await expect(firstCardLink).toBeVisible();
    const href = await firstCardLink.getAttribute("href");
    const realProduct = await db().product.findFirst({
      where: { slug: href?.replace("/producto/", ""), isActive: true, deletedAt: null },
      select: { slug: true },
    });
    expect(realProduct, `el resultado ${href} debe ser un producto real activo`).not.toBeNull();
    record(
      "results-real-products",
      true,
      `match con ${ocasion!.name}: primer resultado ${href} existe en DB`,
      await shot(anonPage, "1-results"),
    );

    // 3. Sin resultados → salidas claras: "Ajustar respuestas" vuelve al paso 3
    // (forzado por interceptación para no depender de un combo vacío en datos).
    await anonPage.unrouteAll();
    await anonPage.route("**/api/catalog/recommend?*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"results":[]}' }),
    );
    await anonPage
      .getByRole("button", { name: /volver/i })
      .first()
      .click();
    await anonPage.getByRole("button", { name: /ver recomendaciones/i }).click();
    await expect(anonPage.locator("body")).toContainText(/no encontramos un match exacto/i, {
      timeout: 20_000,
    });
    await anonPage.getByRole("button", { name: /ajustar respuestas/i }).click();
    await expectStepFocus(/cuánto quieres gastar/i);
    record("empty-state-adjust", true, "estado vacío con salidas + ajustar → paso 3 con foco");

    // 4. Error del API → estado de error con reintento (nunca blanco).
    await anonPage.unrouteAll();
    await anonPage.route("**/api/catalog/recommend?*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' }),
    );
    await anonPage.getByRole("button", { name: /siguiente/i }).click();
    await anonPage.getByRole("button", { name: /ver recomendaciones/i }).click();
    await expect(anonPage.locator("body")).toContainText(/algo falló al buscar/i, {
      timeout: 20_000,
    });
    await expect(anonPage.getByRole("button", { name: /reintentar/i })).toBeVisible();
    record(
      "api-error-retry",
      true,
      "error del API → mensaje + Reintentar",
      await shot(anonPage, "2-error"),
    );

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-recomendador",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          status: "pass",
          steps,
        },
        null,
        2,
      ),
    );
    console.log(`✓ evidencia recomendador: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-recomendador",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          status: "fail",
          error: String(err),
          steps,
        },
        null,
        2,
      ),
    );
    throw err;
  }
});
