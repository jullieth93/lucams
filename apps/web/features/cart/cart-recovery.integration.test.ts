/*
 * Integración — recuperación de carrito abandonado (cron sendCartRecoveryReminders).
 * Verifica: (1) recordatorio a carritos elegibles (con email, inactivos, no recordados),
 * (2) detección de conversión (cart soft-deleted → recoveredAt), (3) el gate de "un solo
 * recordatorio" y "esperar 4h". Comparte la Supabase de dev; fixtures RUN-prefijados.
 * Ver project_integration_tests_share_dev_db.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Este test verifica la LÓGICA del cron (qué carritos se procesan, detección de conversión), NO el
// render del email (que se testea en refund-retract-templates.test.ts) ni la entrega. Mockeamos el
// envío y el template → determinista, sin depender de RESEND ni de getSettingValue/unstable_cache.
vi.mock("@/lib/resend", () => ({
  sendEmail: vi.fn(async () => ({ sent: true, id: "test-email-id" })),
}));
vi.mock("@/features/emails/templates/cart-recovery", () => ({
  cartRecoveryEmail: vi.fn(async () => ({ subject: "s", html: "h", text: "t" })),
}));

import { prisma } from "@/lib/db";
import { sendCartRecoveryReminders } from "./recovery-service";

const RUN = `cartrec${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const HOUR = 60 * 60 * 1000;

let categoryId = "";
let productId = "";
let variantId = "";
const cartIds: string[] = [];
const abIds: Record<string, string> = {};

async function makeCartWithItem(tag: string, opts: { deleted?: boolean } = {}): Promise<string> {
  const cart = await prisma.cart.create({
    data: {
      sessionId: `${RUN}-${tag}`,
      deletedAt: opts.deleted ? new Date() : null,
      items: { create: { variantId, qty: 2, unitPrice: 10_000 } },
    },
    select: { id: true },
  });
  cartIds.push(cart.id);
  return cart.id;
}

async function makeAbandoned(
  tag: string,
  cartId: string,
  opts: { createdAt: Date; lastReminderSentAt?: Date | null; recoveredAt?: Date | null },
): Promise<void> {
  // F-11 — sin token semilla: el recoverToken se genera al ENVIAR el recordatorio
  // (en DB solo queda su hash).
  const ab = await prisma.abandonedCart.create({
    data: {
      cartId,
      email: `${RUN}-${tag}@lucams.test`,
      createdAt: opts.createdAt,
      lastReminderSentAt: opts.lastReminderSentAt ?? null,
      recoveredAt: opts.recoveredAt ?? null,
    },
    select: { id: true },
  });
  abIds[tag] = ab.id;
}

const NOW = new Date("2026-07-14T12:00:00Z");
const FIVE_H_AGO = new Date(NOW.getTime() - 5 * HOUR);
const ONE_H_AGO = new Date(NOW.getTime() - 1 * HOUR);

beforeAll(async () => {
  categoryId = (
    await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
      select: { id: true },
    })
  ).id;
  productId = (
    await prisma.product.create({
      data: {
        slug: `${RUN}-prod`,
        name: `Imán ${RUN}`,
        description: "fixture",
        basePrice: 10_000,
        sku: `${RUN}-P`.toUpperCase(),
        categoryId,
        personalizationKind: "PHOTO_PACK",
      },
      select: { id: true },
    })
  ).id;
  variantId = (
    await prisma.productVariant.create({
      data: {
        productId,
        name: "Único",
        sku: `${RUN}-V`.toUpperCase(),
        price: 10_000,
        stock: 10,
        attributes: {},
      },
      select: { id: true },
    })
  ).id;

  // Elegible: activo + item + abandonado hace 5h, sin recordatorio.
  await makeAbandoned("eligible", await makeCartWithItem("eligible"), { createdAt: FIVE_H_AGO });
  // Convertido: cart soft-deleted (el saga lo borra tras PAID).
  await makeAbandoned("converted", await makeCartWithItem("converted", { deleted: true }), {
    createdAt: FIVE_H_AGO,
  });
  // Ya recordado: no debe reprocesarse.
  await makeAbandoned("reminded", await makeCartWithItem("reminded"), {
    createdAt: FIVE_H_AGO,
    lastReminderSentAt: FIVE_H_AGO,
  });
  // Muy nuevo (< 4h): aún no molestar.
  await makeAbandoned("fresh", await makeCartWithItem("fresh"), { createdAt: ONE_H_AGO });
});

afterAll(async () => {
  const safe = (p: Promise<unknown>) => p.catch(() => {});
  await safe(prisma.abandonedCart.deleteMany({ where: { email: { contains: RUN } } }));
  await safe(prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } }));
  await safe(prisma.cart.deleteMany({ where: { id: { in: cartIds } } }));
  await safe(prisma.productVariant.deleteMany({ where: { productId } }));
  await safe(prisma.product.deleteMany({ where: { id: productId } }));
  await safe(prisma.category.deleteMany({ where: { id: categoryId } }));
});

describe("sendCartRecoveryReminders", () => {
  it("considera solo elegibles + convertidos, recuerda 1 vez y marca conversión", async () => {
    const res = await sendCartRecoveryReminders(NOW);

    // Solo 'eligible' + 'converted' entran a la query (reminded ya tiene lastReminderSentAt; fresh es <4h).
    // (Puede haber otros RUN corriendo en paralelo, así que verificamos POR FILA, no el total.)
    const eligible = await prisma.abandonedCart.findUnique({
      where: { id: abIds.eligible },
      select: { lastReminderSentAt: true, recoveredAt: true, recoverTokenHash: true },
    });
    // Sin RESEND_API_KEY el envío se "salta" pero igual se marca lastReminderSentAt (no reintentar en loop).
    expect(eligible!.lastReminderSentAt).not.toBeNull();
    expect(eligible!.recoveredAt).toBeNull();
    // F-11 — el token se generó al enviar: la fila tiene SOLO su hash sha256.
    expect(eligible!.recoverTokenHash).toMatch(/^[0-9a-f]{64}$/);

    const converted = await prisma.abandonedCart.findUnique({
      where: { id: abIds.converted },
      select: { recoveredAt: true, lastReminderSentAt: true },
    });
    expect(converted!.recoveredAt).not.toBeNull(); // cart soft-deleted → recuperado
    expect(converted!.lastReminderSentAt).toBeNull(); // no se le manda recordatorio

    // 'reminded' y 'fresh' quedan intactos (no entran a la query).
    const reminded = await prisma.abandonedCart.findUnique({
      where: { id: abIds.reminded },
      select: { lastReminderSentAt: true },
    });
    expect(reminded!.lastReminderSentAt!.getTime()).toBe(FIVE_H_AGO.getTime());
    const fresh = await prisma.abandonedCart.findUnique({
      where: { id: abIds.fresh },
      select: { lastReminderSentAt: true, recoveredAt: true },
    });
    expect(fresh!.lastReminderSentAt).toBeNull();
    expect(fresh!.recoveredAt).toBeNull();

    expect(res.recovered).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
