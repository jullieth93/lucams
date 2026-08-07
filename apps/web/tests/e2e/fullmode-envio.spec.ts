/*
 * FULL-MODE E2E §7.5.6 — Envíos: cotización multi-transportadora live
 * (Aveonline sandbox/test) + selección sellada HMAC anti-manipulación.
 *
 * Flujo: producto efímero con dims → PDP → carrito → /checkout/datos →
 * /checkout/envio (la RSC cotiza en vivo contra app.aveonline.co con las
 * credenciales test de .env.local) → se certifica:
 *   1. ≥1 transportadora con precio visible (COP o "Gratis") + días de
 *      tránsito + el set sellado `offersToken` presente en el DOM.
 *   2. Anti-tamper: adulterar el hidden `fleteCop` (eco visual) antes de
 *      continuar → selectShippingAction valida contra el set sellado HMAC →
 *      redirect /checkout/envio?error=… con mensaje visible, y NO se avanza
 *      a /checkout/pago.
 *   3. Recuperación: recargar, elegir la primera oferta sin manipular →
 *      /checkout/pago carga (la selección sellada legítima sí pasa).
 *
 * El `bloquegenerarguia="1"` (guía NO facturable fuera de prod) viaja en el
 * payload server→Aveonline (doble gate aveonline.ts:952): no es observable
 * desde el browser — la evidencia de modo es /api/health/aveonline (demo/test)
 * y la guía test creada en fullmode-cod.spec.ts (cuenta demo, sin costo).
 *
 * SOLO LOCAL: STG/PRD corren en modo catálogo por diseño. El server debe correr
 * en modo full (scripts/e2e-fullmode.sh lo gestiona). Limpieza: producto
 * efímero borrado (hijas→madres) en afterAll; la fila Consent del checkout
 * queda (ledger legal append-only, marcada con el email del RUN).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { strip } from "./_setup/env";
import { E2E_ENV, dismissCookieBanner, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";
import {
  createEphemeralProduct,
  deleteEphemeralProductsByTag,
  fakeCustomer,
  type EphemeralProduct,
} from "./fixtures/data-factory";
import { PdpPage } from "./pages/pdp";
import { CarritoPage } from "./pages/carrito";
import { CheckoutDatosPage } from "./pages/checkout-datos";
import { CheckoutEnvioPage } from "./pages/checkout-envio";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(
  E2E_ENV !== "local",
  "La suite full-mode (Etapa 2) solo corre en LOCAL: STG/PRD están en modo catálogo por diseño.",
);
test.skip(
  strip(process.env.NEXT_PUBLIC_STORE_MODE) !== "full",
  "Requiere el server en modo full: scripts/e2e-fullmode.sh (o NEXT_PUBLIC_STORE_MODE=full + PLAYWRIGHT_BASE_URL).",
);

const run = newRunId("fm-envio");
const RUN_STARTED = new Date();
let product: EphemeralProduct | null = null;

test.afterAll(async () => {
  // Clientes invitados creados por el checkout con el email del RUN (soft-delete,
  // patrón wompi-sandbox: el Consent queda — ledger legal append-only).
  await db()
    .customer.updateMany({
      where: { email: { contains: run }, deletedAt: null },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    })
    .catch(() => {});
  // Barrido por tag: cubre los retries (cada intento crea su producto y
  // el último proceso solo ve el suyo — fuga reproducida 2026-08-07).
  await deleteEphemeralProductsByTag("e2e-fm-envio");
  // Este spec nunca paga → su carrito anónimo queda sin cerrar. Se borra el
  // shell vacío creado durante la corrida (los CartItem ya los quitó el
  // deleteEphemeralProduct por variantId).
  await db()
    .cart.deleteMany({
      where: { customerId: null, items: { none: {} }, createdAt: { gte: RUN_STARTED } },
    })
    .catch(() => {});
  await disconnectDb();
});

test("§7.5.6 envío: cotización live + sello HMAC anti-tamper + recuperación", async ({
  anonPage,
}, testInfo) => {
  test.setTimeout(300_000);
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const customer = fakeCustomer(run);

  try {
    product = await createEphemeralProduct(run, { withShippingDims: true });
    const pdp = new PdpPage(anonPage, product.slug);
    await pdp.goto();
    await dismissCookieBanner(anonPage);
    await pdp.addToCart();
    const carrito = new CarritoPage(anonPage);
    await carrito.expectItem(product.name);
    await carrito.checkoutCta().click();
    const datos = new CheckoutDatosPage(anonPage);
    await datos.expectLoaded();
    await datos.fillAndContinue({
      fullName: customer.name,
      email: customer.email,
      phone: customer.whatsapp,
    });

    // ── 1. Cotización live multi-transportadora.
    const envio = new CheckoutEnvioPage(anonPage);
    const carriers = await envio.expectQuotes();
    expect(carriers, "≥1 transportadora cotizada por Aveonline (live)").toBeGreaterThanOrEqual(1);
    // Cada oferta muestra precio (COP o "Gratis") y tránsito estimado.
    const firstOffer = anonPage.locator('input[name="quoteId-radio"]').first().locator("..");
    await expect(firstOffer).toContainText(/día|despacho/i);
    await expect(firstOffer).toContainText(/\$|Gratis/i);
    // El set sellado HMAC viaja en el DOM (anti-manipulación de flete).
    const offersToken = await anonPage.locator('input[name="offersToken"]').inputValue();
    expect(offersToken.length, "offersToken sellado presente").toBeGreaterThan(20);
    const shot1 = resolve(
      EVIDENCE_DIR,
      "shots",
      `${E2E_ENV}-${testInfo.project.name}-${run}-1-cotizacion-live.png`,
    );
    mkdirSync(resolve(EVIDENCE_DIR, "shots"), { recursive: true });
    await anonPage.screenshot({ path: shot1, fullPage: true });

    // ── 2. Anti-tamper: flete adulterado en el cliente → rechazo sellado.
    await envio.tamperFleteCopAndSubmit();
    await expect(anonPage.locator("body")).toContainText(
      /no coincide|manipul|vuelve a elegir|cotiza/i,
      { timeout: 15_000 },
    );
    const shot2 = resolve(
      EVIDENCE_DIR,
      "shots",
      `${E2E_ENV}-${testInfo.project.name}-${run}-2-tamper-rechazado.png`,
    );
    await anonPage.screenshot({ path: shot2, fullPage: true });

    // ── 3. Recuperación: selección legítima → /checkout/pago.
    await anonPage.reload({ waitUntil: "domcontentloaded" });
    await envio.expectQuotes();
    await envio.selectFirstAndContinue();
    await expect(anonPage).toHaveURL(/\/checkout\/pago/);

    writeFileSync(
      resolve(EVIDENCE_DIR, `results-${E2E_ENV}-${testInfo.project.name}-${run}-envio.json`),
      JSON.stringify(
        {
          spec: "fullmode-envio",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          status: "pass",
          steps: [
            {
              step: "cotizacion-live",
              ok: true,
              detail: `${carriers} transportadora(s) con precio + tránsito · offersToken sellado (${offersToken.length} chars)`,
              screenshot: shot1,
            },
            {
              step: "tamper-flete-rechazado",
              ok: true,
              detail: "fleteCop=1 adulterado → redirect /checkout/envio?error=… (sello HMAC)",
              screenshot: shot2,
            },
            {
              step: "seleccion-legitima-pasa",
              ok: true,
              detail: "recargar + primera oferta → /checkout/pago",
            },
          ],
        },
        null,
        2,
      ),
    );
  } catch (err) {
    writeFileSync(
      resolve(EVIDENCE_DIR, `results-${E2E_ENV}-${testInfo.project.name}-${run}-envio.json`),
      JSON.stringify(
        {
          spec: "fullmode-envio",
          env: E2E_ENV,
          project: testInfo.project.name,
          run,
          status: "fail",
          error: String(err),
        },
        null,
        2,
      ),
    );
    throw err;
  }
});
