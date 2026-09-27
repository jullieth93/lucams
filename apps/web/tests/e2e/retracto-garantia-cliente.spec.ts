/*
 * E2E — retracto y garantía desde la UI del CLIENTE (F-10, remediación R4
 * 2026-09-26). Los servicios features/retract y features/warranty tienen
 * UNIT+INTEGRATION, pero la UI (mi-cuenta/pedidos/[number]/retract-control.tsx
 * y warranty-control.tsx) no tenía ningún E2E — el único existente es admin.
 *
 * Flujo: pedido DELIVERED propio → /mi-cuenta/pedidos/[number] → solicitar
 * retracto → acuse en UI + RetractRequest PENDING en DB (fuente de la cola
 * admin) → estado visible tras recargar. Ídem garantía (Ley 1480). Casos
 * negativos de ventana: entrega hace 30 días → SIN control de retracto (5 días
 * hábiles vencidos) pero CON garantía vigente; entrega hace 400 días → nota
 * "Fuera del periodo de garantía" y sin formulario.
 *
 * Autocontenido (patrón admin-login.spec): crea su propio cliente efímero vía
 * service role + fila Customer + catálogo/pedidos con RUN, y hace login por UI
 * real (loginAction — el form de cliente no tiene Turnstile). NO necesita
 * E2E_AUTH ni storageState. Emails: best-effort (retract/emails captura sus
 * errores; sin RESEND_API_KEY se skipean). En PRD PROHIBIDO (crea usuarios y
 * pedidos). Corre en el nightly (e2e-supabase-real) contra el localstack.
 *
 * Nota R4 (2026-09-26, ajustada en R6 2026-09-27): tras el submit, la action hace
 * revalidatePath y el control re-renderiza con existingStatus/activeClaimStatus —
 * el badge de estado ("Retracto en revisión" / "Garantía en revisión") reemplaza al
 * formulario en el mismo render. Antes el mensaje `state.success` quedaba tapado por
 * el badge (rama inalcanzable); desde R6 el control muestra el mensaje de éxito
 * JUNTO al badge. Los tests asertan el badge, que es el feedback persistente.
 */

import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@lucams/db";
import { createClient } from "@supabase/supabase-js";
import { dismissCookieBanner } from "./fixtures/auth";
import { newRunId } from "./fixtures/run";

const strip = (v: string | undefined) => v?.replace(/^["']|["']$/g, "");
const SB_URL = strip(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SERVICE_KEY = strip(process.env.SUPABASE_SECRET_KEY);
const canRun = Boolean(process.env.DATABASE_URL && SB_URL && SERVICE_KEY);

test.skip(!canRun, "Requiere DATABASE_URL + llaves Supabase (stack local / nightly).");
test.skip(process.env.E2E_ENV === "prd", "Crea usuarios y pedidos: prohibido en PRD.");
test.setTimeout(180_000);

const prisma = new PrismaClient();
const service = createClient(SB_URL ?? "", SERVICE_KEY ?? "", {
  auth: { persistSession: false },
});

const run = newRunId("retracto");
const EMAIL = `${run}@e2e.test`;
const PASSWORD = `E2E-Retracto-${Date.now().toString(36)}Xk!`;

const DAY_MS = 24 * 60 * 60 * 1000;
let supabaseUserId = "";
let customerId = "";
let variantId = "";
let productId = "";
let categoryId = "";
// Pedidos: dentro de ventana de retracto (1 día), fuera de retracto pero con
// garantía vigente (30 días), y fuera de garantía (400 días > 12 meses).
let orderInWindow = { id: "", number: "", itemId: "" };
let orderOutOfRetract = { id: "", number: "" };
let orderOutOfWarranty = { id: "", number: "" };

async function makeDeliveredOrder(tag: string, deliveredAt: Date) {
  const number = `${run}-${tag}`.toUpperCase();
  const order = await prisma.order.create({
    data: {
      number,
      email: EMAIL,
      phone: "+573001112233",
      shippingAddress: { fullName: "Cliente E2E", city: "Bogotá", department: "Cundinamarca" },
      subtotal: 20_000,
      shipping: 0,
      discount: 0,
      total: 20_000,
      currency: "COP",
      paymentMethod: "WOMPI",
      status: "DELIVERED",
      deliveredAt,
      customerId,
      items: { create: [{ variantId, qty: 1, unitPrice: 20_000 }] },
    },
    select: { id: true, items: { select: { id: true } } },
  });
  return { id: order.id, number, itemId: order.items[0]!.id };
}

test.beforeAll(async () => {
  const { data, error } = await service.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`fixture auth user: ${error?.message}`);
  supabaseUserId = data.user.id;

  const customer = await prisma.customer.create({
    data: {
      email: EMAIL,
      supabaseUserId,
      firstName: "Cliente",
      lastName: "Retracto E2E",
      referralCode: `R4${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
    },
    select: { id: true },
  });
  customerId = customer.id;

  const category = await prisma.category.create({
    data: { slug: `${run}-cat`, name: `Cat ${run}` },
    select: { id: true },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: {
      slug: `${run}-prod`,
      name: `Imán Retracto ${run}`,
      description: "fixture retracto/garantía e2e",
      basePrice: 20_000,
      sku: `${run}-PROD`.toUpperCase(),
      categoryId,
      warrantyMonths: 12,
      isActive: true,
      variants: {
        create: [
          {
            name: "Default",
            sku: `${run}-V`.toUpperCase(),
            price: 20_000,
            stock: 100,
            attributes: {},
          },
        ],
      },
    },
    select: { id: true, variants: { select: { id: true } } },
  });
  productId = product.id;
  variantId = product.variants[0]!.id;

  const now = Date.now();
  orderInWindow = await makeDeliveredOrder("in", new Date(now - DAY_MS));
  orderOutOfRetract = await makeDeliveredOrder("out", new Date(now - 30 * DAY_MS));
  orderOutOfWarranty = await makeDeliveredOrder("old", new Date(now - 400 * DAY_MS));
});

test.afterAll(async () => {
  // Order → OrderItem → RetractRequest/WarrantyClaim en cascada (onDelete).
  const orderIds = [orderInWindow.id, orderOutOfRetract.id, orderOutOfWarranty.id].filter(Boolean);
  if (orderIds.length)
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } }).catch(() => {});
  if (productId) await prisma.productVariant.deleteMany({ where: { productId } }).catch(() => {});
  if (productId) await prisma.product.deleteMany({ where: { id: productId } }).catch(() => {});
  if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } }).catch(() => {});
  if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } }).catch(() => {});
  if (supabaseUserId) await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
  await prisma.$disconnect();
});

/** Login real por UI del cliente efímero (ejerce loginAction de paso). */
async function loginClient(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión|entrar|ingresar/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  // El banner de cookies (fixed, z-9000) puede tapar el submit de los forms.
  await dismissCookieBanner(page);
}

test("retracto: cliente solicita desde mi-cuenta → acuse + RetractRequest PENDING + estado visible", async ({
  page,
}) => {
  await loginClient(page);
  await page.goto(`/mi-cuenta/pedidos/${orderInWindow.number}`, {
    waitUntil: "domcontentloaded",
  });

  // El control es un <details>: abrirlo, llenar el motivo y enviar.
  await page.locator("summary", { hasText: /solicitar retracto/i }).click();
  await page.locator(`#retract-reason-${orderInWindow.itemId}`).fill("No era lo que esperaba");
  await page.getByRole("button", { name: /enviar solicitud/i }).click();

  // Confirmación visible: la action hace revalidatePath y el control pasa a
  // mostrar el ESTADO de la solicitud (el badge "Retracto en revisión"
  // reemplaza al formulario en el mismo render — desde R6 el mensaje de éxito
  // se muestra junto al badge; ver nota R4 en el header del spec).
  await expect(page.locator("body")).toContainText(/retracto en revisión/i, { timeout: 20_000 });
  await expect(page.locator("summary", { hasText: /solicitar retracto/i })).toHaveCount(0);

  // Lado admin vía DB: la solicitud queda PENDING (fuente de la cola admin).
  await expect(async () => {
    const rr = await prisma.retractRequest.findUnique({
      where: { orderItemId: orderInWindow.itemId },
      select: { status: true, refundAmount: true },
    });
    expect(rr, "RetractRequest en DB").not.toBeNull();
    expect(rr!.status).toBe("PENDING");
    expect(rr!.refundAmount).toBe(20_000);
  }).toPass({ timeout: 20_000 });

  // El estado sobrevive a la recarga (viene del servidor, no del action state).
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText(/retracto en revisión/i, { timeout: 20_000 });
});

test("garantía: cliente reporta defecto dentro del periodo → acuse + WarrantyClaim PENDING + estado visible", async ({
  page,
}) => {
  await loginClient(page);
  await page.goto(`/mi-cuenta/pedidos/${orderInWindow.number}`, {
    waitUntil: "domcontentloaded",
  });

  await page.locator("summary", { hasText: /reportar garantía/i }).click();
  await page
    .locator(`#warranty-desc-${orderInWindow.itemId}`)
    .fill("El imán llegó despegado del respaldo, se cae.");
  await page.getByRole("button", { name: /enviar reclamo/i }).click();

  // Mismo comportamiento que retracto: el badge de estado reemplaza al form.
  await expect(page.locator("body")).toContainText(/garantía en revisión/i, { timeout: 20_000 });
  await expect(page.locator("summary", { hasText: /reportar garantía/i })).toHaveCount(0);

  await expect(async () => {
    const claim = await prisma.warrantyClaim.findFirst({
      where: { orderItemId: orderInWindow.itemId },
      select: { status: true, customerId: true },
    });
    expect(claim, "WarrantyClaim en DB").not.toBeNull();
    expect(claim!.status).toBe("PENDING");
    expect(claim!.customerId).toBe(customerId);
  }).toPass({ timeout: 20_000 });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toContainText(/garantía en revisión/i, { timeout: 20_000 });
});

test("ventana de retracto vencida (30 días) → SIN control de retracto; garantía de 12 meses sigue ofrecida", async ({
  page,
}) => {
  await loginClient(page);
  await page.goto(`/mi-cuenta/pedidos/${orderOutOfRetract.number}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("body")).toContainText(orderOutOfRetract.number, { timeout: 20_000 });

  // Fuera de los 5 días hábiles: el control no renderiza nada (ni CTA ni nota).
  await expect(page.locator("summary", { hasText: /solicitar retracto/i })).toHaveCount(0);
  // Garantía de 12 meses sigue vigente a los 30 días → el CTA sí aparece.
  await expect(page.locator("summary", { hasText: /reportar garantía/i })).toBeVisible();
});

test("fuera de garantía (400 días > 12 meses) → nota explícita y sin formulario", async ({
  page,
}) => {
  await loginClient(page);
  await page.goto(`/mi-cuenta/pedidos/${orderOutOfWarranty.number}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("body")).toContainText(orderOutOfWarranty.number, { timeout: 20_000 });

  await expect(page.locator("body")).toContainText(/fuera del periodo de garantía/i, {
    timeout: 20_000,
  });
  await expect(page.locator("summary", { hasText: /reportar garantía/i })).toHaveCount(0);
  await expect(page.locator("summary", { hasText: /solicitar retracto/i })).toHaveCount(0);
});
