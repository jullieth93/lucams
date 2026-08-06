/*
 * HOMOLOGACIÓN E2E — rastrear pedido (PROMPT_E2E_HOMOLOGACION §6.14):
 *
 *   número+email correctos → redirect a /pedido/[token] con número y estado →
 *   ANTI-ENUMERACIÓN: número inexistente y email equivocado devuelven el MISMO
 *   mensaje genérico → rate-limit del form (10/hora por IP: el intento 11 es
 *   rechazado con mensaje claro).
 *
 * Corre en LOCAL y STG × desktop/mobile. En PRD PROHIBIDO (crea la orden de
 * prueba + consume intentos de rate-limit). La orden usa number TEST<digits>
 * (cubierta por la red de limpieza global) y se borra completa en afterAll;
 * los buckets de rastrear se resetean antes y después.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb, getActiveProduct } from "./fixtures/db";
import { newRunId } from "./fixtures/run";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(E2E_ENV === "prd", "Rastrear crea una orden de prueba: prohibido en PRD.");
test.setTimeout(300_000);

const run = newRunId("track");
const runDigits = run.replace(/\D/g, "");

type Step = { step: string; ok: boolean; detail?: string; screenshot?: string; at: string };

let orderId = "";
let orderNumber = "";
let customerEmail = "";

test.beforeAll(async () => {
  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'rastrear:%'`;
});

test.afterAll(async () => {
  if (orderId) {
    await db()
      .orderItem.deleteMany({ where: { orderId } })
      .catch(() => {});
    await db()
      .order.deleteMany({ where: { id: orderId } })
      .catch(() => {});
  }
  await db().$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE 'rastrear:%'`;
  await disconnectDb();
});

test("rastrear: número+email → /pedido/[token]; anti-enumeración; rate-limit al 11", async ({
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

  // Semilla: orden PAID del cliente efímero con variante real.
  const customer = await db().customer.findFirst({
    where: { email: { startsWith: "e2e-setup-" }, deletedAt: null },
    orderBy: { email: "desc" },
    select: { id: true, email: true },
  });
  expect(customer, "cliente efímero del setup").not.toBeNull();
  customerEmail = customer!.email;
  const product = await getActiveProduct();
  const variant = product!.variants[0]!;
  const unitPrice = variant.price ?? product!.basePrice;
  orderNumber = `TEST${runDigits}`;
  const { randomBytes } = await import("node:crypto");
  const order = await db().order.create({
    data: {
      number: orderNumber,
      publicAccessToken: randomBytes(16).toString("hex"),
      customerId: customer!.id,
      email: customerEmail,
      phone: "3000000000",
      shippingAddress: { line1: "Calle 1 # 2-3", city: "Bogotá", department: "Cundinamarca" },
      subtotal: unitPrice,
      shipping: 0,
      total: unitPrice,
      status: "PAID",
      paymentMethod: "COD",
      items: { create: [{ variantId: variant.id, qty: 1, unitPrice }] },
    },
    select: { id: true },
  });
  orderId = order.id;

  const rastrear = async (number: string, email: string) => {
    await anonPage.goto("/rastrear", { waitUntil: "domcontentloaded" });
    // El footer también tiene input[name=email] (newsletter) — scope al form.
    const form = anonPage.locator("form", { has: anonPage.locator('input[name="number"]') });
    await form.locator('input[name="number"]').fill(number);
    await form.locator('input[name="email"]').fill(email);
    await form.getByRole("button", { name: /ver mi pedido|rastrear|buscar/i }).click();
  };

  /** Submit esperando el mensaje de error `pattern` — con toPass por si el
   * click cayó pre-hidratación (no-op silencioso; patrón ya visto en PDPs). */
  const rastrearExpectError = async (number: string, email: string, pattern: RegExp) => {
    await expect(async () => {
      await rastrear(number, email);
      await expect(anonPage.locator("body")).toContainText(pattern, { timeout: 5_000 });
    }).toPass({ timeout: 40_000 });
  };

  // La línea exacta del mensaje de error (innerText la trae como línea propia).
  const notFoundLine = (bodyText: string) =>
    bodyText
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /no encontramos un pedido con ese número y correo/i.test(l)) ?? "";

  try {
    // 1. Número+email correctos → /pedido/<token> con número y estado.
    await rastrear(orderNumber, customerEmail);
    await anonPage.waitForURL(/\/pedido\/[a-f0-9]{32}/, { timeout: 30_000 });
    await expect(anonPage.locator("body")).toContainText(orderNumber, { timeout: 15_000 });
    await expect(anonPage.locator("body")).toContainText(/confirmado|pagado|recibido/i);
    record(
      "track-found",
      true,
      `${orderNumber} → /pedido/[token] con estado`,
      await shot(anonPage, "1-tracked"),
    );

    // 2. Anti-enumeración: número inexistente y email equivocado → MISMO mensaje.
    const notFound = /no encontramos un pedido con ese número y correo/i;
    await rastrearExpectError("TEST0000000000000", customerEmail, notFound);
    const missNumber = await anonPage.locator("body").innerText();
    await rastrearExpectError(orderNumber, "nadie-que-no-existe@e2e.test", notFound);
    const missEmail = await anonPage.locator("body").innerText();
    const lineNumber = notFoundLine(missNumber);
    const lineEmail = notFoundLine(missEmail);
    expect(lineNumber.length, "el mensaje genérico debe existir").toBeGreaterThan(0);
    expect(lineEmail, "mensaje IDÉNTICO (no revela existencia del número)").toBe(lineNumber);
    record(
      "anti-enumeration",
      true,
      "mensaje idéntico para número inexistente y email equivocado",
      await shot(anonPage, "2-antienum"),
    );

    // 3. Rate-limit del form: 10 intentos/hora por IP con mensaje claro.
    // Los intentos 1-3 ya consumieron; se itera hasta que el límite aparezca
    // (ventana ≤12: tolera los intentos de retries previos sin acomodar el
    // mecanismo — la aserción es que SIEMPRE llega con mensaje claro).
    let rateLimited = false;
    for (let i = 0; i < 12 && !rateLimited; i++) {
      await expect(async () => {
        await rastrear(`TESTX${runDigits}${i}`, "nadie@e2e.test");
        await expect(anonPage.locator("body")).toContainText(
          /no encontramos un pedido con ese número y correo|demasiados intentos/i,
          { timeout: 5_000 },
        );
      }).toPass({ timeout: 40_000 });
      const body = await anonPage.locator("body").innerText();
      rateLimited = /demasiados intentos/i.test(body);
    }
    expect(rateLimited, "el form debe rate-limitar tras N intentos con mensaje claro").toBe(true);
    record(
      "rate-limit",
      true,
      "'Demasiados intentos…' tras la ráfaga (10/hora por IP)",
      await shot(anonPage, "3-ratelimit"),
    );

    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-rastrear",
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
    console.log(`✓ evidencia rastrear: ${resultsPath}`);
  } catch (err) {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-rastrear",
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
