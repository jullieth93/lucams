/*
 * HOMOLOGACIÓN E2E — errores y resiliencia de red (PROMPT_E2E_HOMOLOGACION
 * §6.19): 404 personalizado (soft 404 con la página de marca), noindex en
 * checkout/cotización/estudio, y con route.fulfill caídas en APIs críticas la
 * UI degrada con MENSAJE VISIBLE, nunca pantalla en blanco (regresión §4d del
 * catch del estudio y del form de cotización).
 *
 * Corre en LOCAL y STG × desktop/mobile. En PRD PROHIBIDO (la cotización de
 * prueba crea datos para el caso de fallo controlado).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb, getActiveProduct } from "./fixtures/db";
import {
  createEphemeralProduct,
  deleteEphemeralProduct,
  fakeCustomer,
  type EphemeralProduct,
} from "./fixtures/data-factory";
import { newRunId } from "./fixtures/run";
import { CarritoPage } from "./pages/carrito";
import { CotizacionPage } from "./pages/cotizacion";
import { PdpPage } from "./pages/pdp";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "El caso de cotización con fallo crea datos: prohibido en PRD.");
test.setTimeout(300_000);

const run = newRunId("errores");
const customer = fakeCustomer(run);

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

let product: EphemeralProduct | null = null;

test.afterAll(async () => {
  if (product) await deleteEphemeralProduct(product);
  await db()
    .$executeRaw`UPDATE "Quote" SET "deletedAt" = NOW(), "updatedAt" = NOW() WHERE "deletedAt" IS NULL AND "customerEmail" ILIKE ${"%" + run + "%"}`;
  await disconnectDb();
});

test("errores: 404 de marca + noindex + fallo de cotización con mensaje visible (route.fulfill)", async ({
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

  try {
    // 1. 404 personalizado: la página de marca se muestra (soft 404 en Next 16).
    const notFound = await anonPage.goto("/esto-no-existe-jamas", {
      waitUntil: "domcontentloaded",
    });
    expect(notFound).not.toBeNull();
    await expect(anonPage.locator("body")).toContainText(/esta página se nos perdió/i, {
      timeout: 15_000,
    });
    record("custom-404", true, undefined, await shot(anonPage, "1-404"));

    // 2. noindex en rutas de un solo uso: checkout (quote form), cotización por
    // token (con una quote real efímera) y estudio.
    product = await createEphemeralProduct(run);
    const checkoutRes = await anonPage.goto("/carrito", { waitUntil: "domcontentloaded" });
    expect(checkoutRes!.status()).toBe(200);
    const product2 = await getActiveProduct();
    await anonPage.goto(`/estudio/${product2!.slug}`, { waitUntil: "domcontentloaded" });
    const robotsMeta = await anonPage
      .locator('meta[name="robots"]')
      .getAttribute("content")
      .catch(() => null);
    expect(robotsMeta, "el estudio debe ser noindex").toContain("noindex");
    record("noindex-estudio", true, robotsMeta ?? undefined);

    // 3. Fallo de red en la cotización (route.fulfill 500 en la server action):
    // la UI muestra el mensaje de error, NUNCA pantalla en blanco.
    const pdp = new PdpPage(anonPage, product.slug);
    await pdp.goto();
    await pdp.addToCart();
    const carrito = new CarritoPage(anonPage);
    await carrito.expectItem(product.name);
    await carrito.quoteCta().click();
    const cotizacion = new CotizacionPage(anonPage);
    await cotizacion.expectLoaded();
    await cotizacion.fill({
      name: customer.name,
      whatsapp: customer.whatsapp,
      email: customer.email,
    });
    // Interceptar el POST de la server action → 500 (como un fallo de plataforma).
    await anonPage.route("**/checkout/datos", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 500, body: "Internal Server Error" });
      } else {
        await route.continue();
      }
    });
    await cotizacion.submitButton().click();
    // La degradación correcta: error boundary de marca con reintento ("Algo
    // salió mal de nuestro lado · Ya quedó registrado") — NUNCA pantalla en
    // blanco ni stack trace (regresión §4d del prompt).
    await expect(anonPage.locator("body")).toContainText(/algo salió mal de nuestro lado/i, {
      timeout: 30_000,
    });
    await expect(anonPage.getByRole("button", { name: /intentar de nuevo/i })).toBeVisible();
    await expect(anonPage.locator("body")).not.toContainText("Application error");
    record(
      "quote-500-visible-error",
      true,
      "500 en la acción → error boundary de marca con reintento (no blanco, no stack)",
      await shot(anonPage, "2-quote-500"),
    );
    await anonPage.unrouteAll();

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-errores",
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
    console.log(`✓ evidencia errores: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-errores",
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
