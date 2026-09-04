/*
 * HOMOLOGACIÓN E2E — flujo de cotización Etapa 1 (modo catálogo), el embudo de
 * ingresos actual de la tienda (docs/TESTING.md):
 *
 *   PDP → carrito → "Cotizar por WhatsApp" → form (datos + consent Ley 1581 +
 *   Turnstile) → submit REAL → Quote PENDING en DB + Consent atómico +
 *   Notification QUOTE + página de confirmación con wa.me bien formado →
 *   carrito vacío → segundo intento no duplica (idempotencia).
 *
 * Corre en LOCAL y STG × desktop/mobile. En PRD está PROHIBIDO (crea datos).
 * La cotización de prueba lleva el RUN en nombre/email/WhatsApp (único por
 * corrida → el Consent, append-only por ley, queda distinguible como test).
 * Limpieza: Quote soft-deleted, Notification borrada, producto efímero borrado,
 * buckets de rate-limit `quote:%` reseteados. El Consent queda (ledger legal).
 *
 * Nota STG: la cotización dispara el email real al admin (canal de venta —
 * RESEND_API_KEY activa en previews). Es UN correo marcado como test por run;
 * se documenta en la matriz, no se evita: probar el canal es parte del flujo.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
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

test.skip(
  E2E_ENV === "prd",
  "La homologación del flujo de cotización crea datos: prohibida en PRD.",
);
test.skip(
  process.env.NEXT_PUBLIC_STORE_MODE !== "catalog",
  "Este spec solo corre en modo catálogo (NEXT_PUBLIC_STORE_MODE=catalog).",
);

test.setTimeout(240_000);

const run = newRunId("quote");
const customer = fakeCustomer(run);
let product: EphemeralProduct | null = null;

test.beforeAll(async () => {
  product = await createEphemeralProduct(run);
  // Higiene de test: los buckets de rate-limit de cotización (5/día por IP)
  // acumulan ticks entre corridas y harían flakear la suite. Son contadores
  // regenerables, no datos de negocio (env-guard protege PRD de todas formas).
  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'quote:%'`;
});

test.afterAll(async () => {
  if (product) await deleteEphemeralProduct(product);
  // La cotización de prueba fuera de las listas del admin (soft-delete, mismo
  // mecanismo del teardown global del repo). El Consent QUEDA: ledger legal
  // append-only (regla dura del prompt) — lleva el RUN en email/teléfono y es
  // distinguible como test.
  await db()
    .$executeRaw`UPDATE "Quote" SET "deletedAt" = NOW(), "updatedAt" = NOW() WHERE "deletedAt" IS NULL AND "customerEmail" ILIKE ${"%" + run + "%"}`;
  await db()
    .notification.deleteMany({ where: { title: { contains: customer.name } } })
    .catch(() => {});
  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'quote:%'`;
  await disconnectDb();
});

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

test("cotización Etapa 1: carrito → form → Quote PENDING + Consent + Notification + wa.me + idempotencia", async ({
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

  const price = product!.price;

  try {
    // 1. PDP → carrito (producto efímero NO personalizable: "Añadir al carrito").
    const pdp = new PdpPage(anonPage, product!.slug);
    await pdp.goto();
    await pdp.addToCart();
    record("pdp-add-to-cart", true, `producto efímero ${product!.slug} ($${price} centavos)`);

    // 2. Carrito → CTA "Cotizar por WhatsApp" (modo catálogo: NO "Ir a pagar").
    const carrito = new CarritoPage(anonPage);
    await carrito.expectItem(product!.name);
    const cta = carrito.quoteCta();
    await expect(cta).toBeVisible();
    await expect(carrito.checkoutCta()).toHaveCount(0);
    const cartTotalText = await anonPage
      .locator("main")
      .innerText()
      .catch(() => "");
    await cta.click();
    record("cart-quote-cta", true, "CTA cotizar visible; NO hay CTA de pago");

    // 3. Formulario: datos + consentimiento + Turnstile (test keys → token).
    const cotizacion = new CotizacionPage(anonPage);
    await cotizacion.expectLoaded();
    await cotizacion.fill({
      name: customer.name,
      whatsapp: customer.whatsapp,
      email: customer.email,
      notes: `Nota de prueba ${run}`,
    });
    record("form-filled", true, `${customer.name} · ${customer.whatsapp} · ${customer.email}`);

    // 4. Submit real → página de confirmación por token.
    const token = await cotizacion.submitAndWaitConfirmation();
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    record(
      "submit-redirect-confirmacion",
      true,
      `token=${token}`,
      await shot(anonPage, "1-confirmacion"),
    );

    // 5. DB: la Quote quedó PENDING con el snapshot del carrito y consent atómico.
    const quote = await db().quote.findFirst({
      where: { customerName: customer.name, deletedAt: null },
      include: { items: true },
    });
    expect(quote, "la cotización del run debe existir en DB").not.toBeNull();
    expect(quote!.status).toBe("PENDING");
    expect(quote!.number).toMatch(/^COT-/);
    expect(quote!.customerWhatsapp).toBe(customer.whatsapp);
    expect(quote!.customerEmail).toBe(customer.email);
    expect(quote!.total).toBe(price);
    expect(quote!.items).toHaveLength(1);
    expect(quote!.items[0]!.unitPrice).toBe(price);
    expect(quote!.dataConsentAt).not.toBeNull();
    record(
      "db-quote-pending",
      true,
      `${quote!.number} PENDING · total ${quote!.total} centavos · 1 item · consent ${quote!.dataConsentVersion}`,
    );

    // 5b. Consent (ledger legal — se verifica, NO se borra).
    const consent = await db().consent.findFirst({
      where: { phone: customer.whatsapp },
      orderBy: { acceptedAt: "desc" },
    });
    expect(consent, "la fila Consent del ledger legal debe existir").not.toBeNull();
    expect(consent!.scope).toBe("HABEAS_DATA");
    expect(consent!.accepted).toBe(true);
    record(
      "db-consent-row",
      true,
      `Consent ${consent!.id} HABEAS_DATA (append-only, queda por ley)`,
    );

    // 5c. Notification QUOTE (el after() la crea post-respuesta → poll).
    await expect(async () => {
      const n = await db().notification.findFirst({
        where: { type: "QUOTE", title: { contains: quote!.number } },
      });
      expect(n, "debe existir la Notification QUOTE").not.toBeNull();
      expect(n!.actionUrl).toBe(`/admin/cotizaciones/${quote!.id}`);
    }).toPass({ timeout: 30_000 });
    record("db-notification-quote", true, `Notification QUOTE con deep link al detalle admin`);

    // 6. Confirmación: número, producto, total consistente con el carrito y
    // CTA wa.me bien formado (número del ambiente, ítems, total, link).
    await expect(anonPage.locator("body")).toContainText(quote!.number, { timeout: 15_000 });
    await expect(anonPage.locator("body")).toContainText(product!.name);
    const waLink = anonPage.locator('a[href*="wa.me/"]').first();
    await expect(waLink).toBeVisible();
    const waHref = await waLink.getAttribute("href");
    expect(waHref).toBeTruthy();
    const waNumber = (process.env.NEXT_PUBLIC_WA_NUMBER ?? "").replace(/\D/g, "");
    expect(waHref!, "el CTA usa el número de WhatsApp del ambiente").toContain(`wa.me/${waNumber}`);
    const waText = decodeURIComponent(new URL(waHref!).searchParams.get("text") ?? "");
    expect(waText).toContain(quote!.number);
    expect(waText).toContain(product!.name);
    expect(waText).toContain(`/cotizacion/${token}`);
    expect(waHref!.length).toBeLessThan(2000); // cota documentada en service.ts
    record(
      "confirmacion-wa-me",
      true,
      `wa.me/${waNumber} · número+ítem+total+link · URL ${waHref!.length} chars`,
      await shot(anonPage, "2-wa-cta"),
    );

    // 6b. El total mostrado en la confirmación es el mismo texto que en el carrito.
    const confirmText = await anonPage.locator("main").innerText();
    const totalMatch: string[] = confirmText.match(/\$\s?[\d.,]+/g) ?? [];
    const cartTotals: string[] = cartTotalText.match(/\$\s?[\d.,]+/g) ?? [];
    const shared = totalMatch.filter((t) => cartTotals.includes(t));
    expect(
      shared.length,
      `el total de la confirmación (${totalMatch.join("/")}) debe aparecer en el carrito (${cartTotals.join("/")})`,
    ).toBeGreaterThan(0);
    record("total-consistency", true, `total compartido carrito↔confirmación: ${shared[0]}`);

    // 7. Carrito vacío tras la cotización (reclamo atómico del carrito).
    await anonPage.goto("/carrito", { waitUntil: "domcontentloaded" });
    await expect(anonPage.locator("body")).not.toContainText(product!.name);
    record("cart-empty-after-quote", true);

    // 8. Idempotencia UI: con el carrito ya reclamado, /checkout/datos
    // redirige a /carrito y NO se crea una segunda cotización.
    await anonPage.goto("/checkout/datos", { waitUntil: "domcontentloaded" });
    await expect(anonPage).toHaveURL(/\/carrito/, { timeout: 15_000 });
    const quoteCount = await db().quote.count({
      where: { customerName: customer.name, deletedAt: null },
    });
    expect(quoteCount).toBe(1);
    record(
      "idempotencia",
      true,
      "segundo intento → redirect a /carrito; sigue habiendo exactamente 1 Quote",
    );

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-cotizacion",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          quoteNumber: quote!.number,
          status: "pass",
          steps,
        },
        null,
        2,
      ),
    );
    console.log(`✓ evidencia cotización: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-cotizacion",
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
