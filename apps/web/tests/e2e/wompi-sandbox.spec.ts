/*
 * E2E LIVE — Checkout transaccional completo contra SANDBOX (Etapa 2 / develop).
 *
 * Recorre el camino REAL del cliente y de las integraciones, sin mocks:
 *
 *   PDP → carrito → /checkout/datos (form completo) → /checkout/envio
 *   (cotización Aveonline SANDBOX en vivo) → /checkout/pago → redirect al
 *   checkout hospedado de Wompi (checkout.wompi.co, sandbox) → pago con
 *   tarjeta de prueba 4242 (APPROVED) → regreso a /checkout/gracias →
 *   verificación de la transacción vía API Wompi → webhook firmado
 *   (mismo esquema HMAC que Wompi, secreto sandbox real) contra
 *   /api/webhooks/wompi → saga: orden PAID + guía Aveonline creada.
 *
 * Cubre en una sola corrida: UI checkout, Aveonline (cotización + guía),
 * Wompi (checkout + API + webhook + saga). Requiere, vía .env.local:
 *   - WOMPI_* sandbox (WOMPI_ENV=sandbox)
 *   - AVEONLINE_USUARIO/CLAVE sandbox
 *   - DATABASE_URL (crea y limpia sus fixtures)
 * Turnstile en bypass (llaves vacías en el entorno de la corrida).
 *
 * La tarjeta 4242 4242 4242 4242 → APPROVED en sandbox (doc oficial Wompi,
 * "Datos de prueba en Sandbox"). La guía se crea en Aveonline SANDBOX.
 */

import { test, expect, type Page } from "@playwright/test";
import "../setup-env";
import crypto from "node:crypto";
import { PrismaClient } from "@lucams/db";

const prisma = new PrismaClient();
const RUN = `wompi-e2e-${Date.now()}`;
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4000";

let categoryId = "";
let productId = "";
let slug = "";
let orderId = "";
let orderNumber = "";

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const WOMPI_EVENTS_SECRET = strip(process.env.WOMPI_EVENTS_SECRET) ?? "";
const WOMPI_PRIVATE_KEY = strip(process.env.WOMPI_PRIVATE_KEY) ?? "";
const WOMPI_API = "https://sandbox.wompi.co/v1";

test.setTimeout(600_000);

test.beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
  });
  categoryId = category.id;
  // Producto efímero NO personalizable CON dims de empaque (sin ellas la
  // cotización Aveonline falla por diseño — SHIPPING_QUOTE_FAILED).
  const product = await prisma.product.create({
    data: {
      slug: `${RUN}-simple`,
      name: `Imán E2E Wompi ${RUN}`,
      description: "Producto efímero para el E2E transaccional sandbox.",
      basePrice: 4_000_000,
      sku: `${RUN}-SIMPLE`.toUpperCase(),
      categoryId,
      physicalSpecs: { weightGrams: 100, widthCm: 10, heightCm: 2, depthCm: 10 },
      variants: {
        create: [
          {
            name: "Default",
            sku: `${RUN}-SIMPLE-DEFAULT`.toUpperCase(),
            price: 4_000_000,
            stock: 100,
            attributes: {},
          },
        ],
      },
    },
  });
  productId = product.id;
  slug = product.slug;
});

test.afterAll(async () => {
  // Limpieza: orden de prueba fuera del tablero (soft delete), fixtures fuera (hard).
  if (orderId) {
    await prisma.order
      .update({ where: { id: orderId }, data: { deletedAt: new Date() } })
      .catch(() => {});
  }
  if (productId) await prisma.product.deleteMany({ where: { id: productId } }).catch(() => {});
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } }).catch(() => {});
  await prisma.$disconnect();
});

/** Checkout hospedado de Wompi (sandbox): paga con la 4242 de prueba. */
async function payInWompiHostedCheckout(page: Page) {
  // Sondas: el checkout es una caja negra de terceros; si el botón queda
  // bloqueado (pasa a veces — ver § intentos 15-17) hay que ver qué call
  // de Wompi falló. Solo errores, solo dominios wompi/bancolombia.
  const isWompi = (u: string) => /wompi|bancolombia|cibest/i.test(u);
  page.on("console", (m) => {
    if (m.type() === "error") console.log("[wompi console.error]", m.text().slice(0, 200));
  });
  page.on("requestfailed", (r) => {
    if (isWompi(r.url()))
      console.log("[wompi requestfailed]", r.url().slice(0, 140), r.failure()?.errorText ?? "");
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && isWompi(r.url()))
      console.log(`[wompi http ${r.status()}]`, r.url().slice(0, 140));
  });

  // 1. Picker "¿Cómo quieres pagar?" → Tarjeta (clic en el elemento CLICABLE
  // ancestro — el texto puede venir partido en spans).
  const change = page.getByText(/cambiar método de pago/i).first();
  if (await change.isVisible().catch(() => false)) await change.click();
  const cardOption = page
    .locator("button, a, [role='button'], li, div", { hasText: /débito o crédito/i })
    .last();
  await expect(cardOption).toBeVisible({ timeout: 15_000 });
  await cardOption.click();

  // 2. Datos del comprador (aparecen tras elegir el método, misma pantalla).
  const nameField = page.getByPlaceholder(/nombres y apellidos/i);
  await expect(nameField).toBeVisible({ timeout: 10_000 });
  // El celular es requerido para habilitar "Continuar": esperarlo de verdad
  // (un isVisible() sin timeout lo salta si aún no renderiza → botón muerto).
  const phone = page.getByPlaceholder(/número de celular|celular/i).last();
  if (await phone.isVisible({ timeout: 8_000 }).catch(() => false)) await phone.fill("3001234567");

  // 3. Continuar a la pantalla de captura de tarjeta.
  // OJO: Wompi pre-llena email/celular por fetch de sesión DESPUÉS del primer
  // render, y ese re-render PISA el nombre si se llenó muy temprano (verificado:
  // nombre vacío + botón deshabilitado 10 min). Llenar y esperar el botón
  // habilitado dentro del mismo bucle de reintento.
  const contBtn = page.getByRole("button", { name: /continuar con tu pago/i }).last();
  await expect(async () => {
    if ((await nameField.inputValue()) !== "Valentina Wompi") {
      await nameField.fill("Valentina Wompi");
    }
    // La validación de Wompi corre en BLUR: si el foco queda dentro del campo
    // el botón nunca habilita (verificado en vivo).
    await nameField.blur();
    await expect(contBtn).toBeEnabled({ timeout: 3_000 });
  }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 3_000] });
  await contBtn.click();

  // 4. Formulario de tarjeta (pantalla nueva; placeholders exactos,
  //    NADA de selectores genéricos — input[name=number] es el celular).
  const fillCard = async (selectors: string[], value: string) => {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await loc.scrollIntoViewIfNeeded();
        await loc.fill(value);
        return true;
      }
    }
    return false;
  };
  await fillCard(
    [
      'input[placeholder*="número de tarjeta" i]',
      'input[autocomplete="cc-number"]',
      'input[placeholder*="card number" i]',
      'input[name="cardNumber"]',
    ],
    "4242424242424242",
  );
  // Fecha de expiración: SELECTS Mes/Año (no input de texto).
  const mesSelect = page.locator('select:has(option:text-is("12"))').first();
  await mesSelect.selectOption("12");
  // Año: las opciones NO son text-is("2028") (formato distinto: "28", espacios
  // raros o labels con relleno — verificado en vivo, quemó 600s esperando).
  // Anclar el select por su placeholder "Año" y elegir leyendo sus options reales.
  const anoSelect = page.locator('select:has(option:text-is("Año"))').first();
  await expect(anoSelect).toBeVisible({ timeout: 10_000 });
  const anoOpts = await anoSelect
    .locator("option")
    .evaluateAll((os) =>
      os.map((o) => ({
        label: o.textContent?.trim() ?? "",
        value: (o as HTMLOptionElement).value,
      })),
    );
  const yearLike = anoOpts.filter((o) => /^\d{2}(\d{2})?$/.test(o.label));
  const anoTarget = yearLike.find((o) => o.label === "2028" || o.label === "28") ?? yearLike.at(-1);
  if (!anoTarget) throw new Error(`Año: sin opciones año-like: ${JSON.stringify(anoOpts)}`);
  await anoSelect.selectOption(
    anoTarget.value ? { value: anoTarget.value } : { label: anoTarget.label },
  );
  // CVC: el label visible es "Código de seguridad (CVC o CVV)".
  const cvc = page.getByLabel(/código de seguridad|CVC|CVV/i).first();
  if (await cvc.isVisible().catch(() => false)) {
    await cvc.fill("123");
  } else {
    await page.locator('xpath=//label[contains(.,"seguridad")]/following::input[1]').fill("123");
  }
  await fillCard(
    [
      'input[placeholder*="nombre en la tarjeta" i]',
      'input[placeholder*="nombre del titular" i]',
      'input[placeholder*="titular" i]',
      'input[autocomplete="cc-name"]',
      'input[name="cardHolder"]',
    ],
    "Valentina Wompi",
  );
  // Documento del titular + cuotas (default 1) + los 2 consentimientos.
  const doc = page.getByPlaceholder(/número de documento/i).first();
  if (await doc.isVisible().catch(() => false)) await doc.fill("1040032100");
  for (const cb of await page.getByRole("checkbox").all()) {
    // El clic puede caer mientras Wompi aún carga el token de aceptación y un
    // re-render se lo traga ("did not change state"). Reintentar hasta que pegue.
    await expect(async () => {
      if (!(await cb.isChecked())) await cb.check({ timeout: 3_000 });
      await expect(cb).toBeChecked({ timeout: 3_000 });
    }).toPass({ timeout: 30_000, intervals: [1_000, 2_000, 3_000] });
  }
  await page.screenshot({ path: "/tmp/wompi-hosted-filled.png", fullPage: true });

  // 5. Pagar. El botón final dice "Continuar con tu pago" (NO "Pagar" —
  // verificado en vivo con el formulario lleno y los 2 consentimientos).
  await page
    .getByRole("button", { name: /continuar con tu pago|pagar|pay|confirmar/i })
    .last()
    .click();

  // 6. Sandbox: si aparece pantalla de estado directo, aprobar.
  const approve = page.getByRole("button", { name: /aprobar|aprobada|approved/i }).first();
  if (await approve.isVisible({ timeout: 10_000 }).catch(() => false)) await approve.click();
}

test("checkout transaccional E2E sandbox: datos → envío Aveonline → pago Wompi → webhook → PAID", async ({
  page,
}) => {
  // 1. PDP → add to cart
  await page.goto(`/producto/${slug}`);
  // Higiene e2e: el banner de cookies (bottom-fixed) tapa los CTAs inferiores.
  const cookieBtn = page.getByRole("button", { name: /solo necesarias/i }).first();
  if (await cookieBtn.isVisible().catch(() => false)) await cookieBtn.click();
  await page.getByRole("button", { name: /añadir al carrito/i }).click();
  await page.waitForURL(/[?&]added=1/, { timeout: 20_000 });

  // 2. Carrito → checkout
  await expect(async () => {
    await page.goto("/carrito");
    await expect(page.getByText(`Imán E2E Wompi ${RUN}`).first()).toBeVisible();
  }).toPass({ timeout: 30_000 });
  await page.getByRole("link", { name: /ir a pagar/i }).click();
  await page.waitForURL(/\/checkout\/datos/, { timeout: 20_000 });

  // 3. Datos del cliente (form completo modo full)
  // Nombre SOLO letras (el form rechaza números — "sin números" en el hint).
  await page.locator("#fullName").fill("Valentina Wompi");
  await page.locator("#email").fill(`${RUN}@example.com`);
  await page.locator("#phone-display").fill("3001234567");
  await page.locator("#deptCode").selectOption({ index: 1 });
  // Las ciudades cargan tras elegir departamento (dependiente).
  await expect(page.locator("#cityCode option").nth(1)).toBeAttached({ timeout: 15_000 });
  await page.locator("#cityCode").selectOption({ index: 1 });
  // Tipo de dirección (requerido): Urbana.
  await page.getByText("Urbana", { exact: false }).first().click();
  await page.locator('input[name="viaNumber"]').fill("10");
  await page.locator('input[name="cruceNumber"]').fill("15-20");
  const zip = page.locator("#zip");
  if (await zip.isVisible().catch(() => false)) await zip.fill("050001");
  await page.locator('input[name="dataConsent"]').check();
  await page.screenshot({ path: "/tmp/e2e-tx-01-datos.png", fullPage: true });
  await page.getByRole("button", { name: /continuar al envío/i }).click();

  // 4. Envío: cotización Aveonline SANDBOX en vivo (puede tardar ~20s; hay retry)
  await page.waitForURL(/\/checkout\/envio/, { timeout: 30_000 });
  const quoteOption = page
    .locator("label, button", { hasText: /estándar|express|días|envío/i })
    .first();
  if (!(await quoteOption.isVisible({ timeout: 45_000 }).catch(() => false))) {
    const retry = page.getByRole("button", { name: /reintentar|retry/i }).first();
    if (await retry.isVisible().catch(() => false)) await retry.click();
  }
  await expect(quoteOption).toBeVisible({ timeout: 45_000 });
  await quoteOption.click();
  await page.screenshot({ path: "/tmp/e2e-tx-02-envio.png", fullPage: true });
  await page.getByRole("button", { name: /continuar al pago|continuar/i }).click();

  // 5. Pago: método Wompi → redirect al checkout hospedado
  await page.waitForURL(/\/checkout\/pago/, { timeout: 30_000 });
  const wompiCard = page.getByText(/wompi|tarjeta|en línea/i).first();
  if (await wompiCard.isVisible().catch(() => false)) await wompiCard.click().catch(() => {});
  await page.screenshot({ path: "/tmp/e2e-tx-03-pago.png", fullPage: true });
  await page.getByRole("button", { name: /pagar con wompi/i }).click();
  await page.waitForURL(/checkout\.wompi\.co/, { timeout: 45_000 });
  await page.screenshot({ path: "/tmp/e2e-tx-04-wompi-hosted.png", fullPage: true });

  // 6. Pagar en Wompi sandbox (4242 → APPROVED) y regresar a /checkout/gracias
  await payInWompiHostedCheckout(page);
  // En localhost la app OMITE redirect-url (WAF Wompi 403 a URLs con localhost)
  // → Wompi no puede devolver al comprador solo. Esperar el redirect natural
  // un rato; si no viene, reconstruir la misma URL que arma Wompi
  // (/checkout/gracias?id=<txId>&env=test) con la tx consultada por API.
  // En preview/prod el redirect-url sí se envía y este fallback no corre.
  const landed = await page
    .waitForURL(/\/checkout\/gracias/, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!landed) {
    const ord = await prisma.order.findFirstOrThrow({
      where: { email: `${RUN}@example.com`, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { number: true },
    });
    const r = await fetch(`${WOMPI_API}/transactions?reference=${encodeURIComponent(ord.number)}`, {
      headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
      cache: "no-store",
    });
    const b = (await r.json()) as { data?: { id: string }[] };
    if (!b.data?.[0]) throw new Error(`sin transacción Wompi para ${ord.number}`);
    await page.goto(`${BASE}/checkout/gracias?id=${b.data[0].id}&env=test`);
  }
  await page.waitForURL(/\/checkout\/gracias/, { timeout: 30_000 });
  await page.screenshot({ path: "/tmp/e2e-tx-05-gracias.png", fullPage: true });

  // 7. La orden existe en DB (la crea finalizeCheckout antes del redirect)
  await expect(async () => {
    const order = await prisma.order.findFirst({
      where: { email: `${RUN}@example.com`, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, status: true, total: true },
    });
    expect(order, "orden creada por finalizeCheckout").toBeTruthy();
    orderId = order!.id;
    orderNumber = order!.number;
  }).toPass({ timeout: 30_000, intervals: [1_000, 2_000, 3_000] });

  // 8. La transacción quedó APPROVED en Wompi (API oficial, llave privada sandbox)
  const txRes = await fetch(
    `${WOMPI_API}/transactions?reference=${encodeURIComponent(orderNumber)}`,
    { headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` }, cache: "no-store" },
  );
  expect(txRes.status).toBe(200);
  const txBody = (await txRes.json()) as {
    data?: { id: string; status: string; amount_in_cents: number }[];
  };
  const tx = txBody.data?.[0];
  expect(tx, `transacción Wompi para ${orderNumber}`).toBeTruthy();
  expect(tx!.status).toBe("APPROVED");

  // 9. Webhook firmado (mismo esquema que Wompi: properties+timestamp+secret → SHA256)
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { total: true, status: true },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const concat = `${tx!.id}APPROVED${order.total}` + String(timestamp) + WOMPI_EVENTS_SECRET;
  const checksum = crypto.createHash("sha256").update(concat).digest("hex");
  const event = {
    event: "transaction.updated",
    data: {
      transaction: {
        id: tx!.id,
        reference: orderNumber,
        amount_in_cents: order.total,
        currency: "COP",
        customer_email: `${RUN}@example.com`,
        payment_method_type: "CARD",
        status: "APPROVED",
        status_message: null,
      },
    },
    environment: "test",
    signature: { properties, checksum },
    timestamp,
    sent_at: new Date().toISOString(),
  };
  const whRes = await fetch(`${BASE}/api/webhooks/wompi`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  expect(whRes.status, `webhook aceptó la firma sandbox (${await whRes.text()})`).toBe(200);

  // 10. Saga: orden PAID (o más allá — con guía creada avanza a FULFILLING) +
  //     trackingNumber Aveonline. Puede tardar unos segundos (auth Aveonline +
  //     createShipment ~20s no-idempotente).
  await expect(async () => {
    const final = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, trackingNumber: true, shippingCarrier: true },
    });
    expect(final.status).toMatch(/^(PAID|FULFILLING|SHIPPED|DELIVERED)$/);
    expect(final.trackingNumber, "guía Aveonline sandbox creada").toBeTruthy();
  }).toPass({ timeout: 60_000, intervals: [2_000, 3_000, 5_000] });
});
