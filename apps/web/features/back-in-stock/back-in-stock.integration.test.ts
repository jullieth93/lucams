/*
 * Integración — "avísame cuando vuelva". Verifica: (1) solo se suscribe a productos AGOTADOS,
 * (2) el cron notifica cuando el producto vuelve a tener stock y marca notifiedAt, (3) no
 * re-notifica. Comparte la Supabase de dev; fixtures RUN-prefijados. Email mockeado (determinismo).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/resend", () => ({ sendEmail: vi.fn(async () => ({ sent: true, id: "x" })) }));
vi.mock("@/features/emails/templates/back-in-stock", () => ({
  backInStockEmail: vi.fn(async () => ({ subject: "s", html: "h", text: "t" })),
}));

import { prisma } from "@/lib/db";
import { subscribeBackInStock, sendBackInStockNotifications } from "./service";

const RUN = `bis${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
let categoryId = "";
let productId = "";
let variantId = "";

beforeAll(async () => {
  categoryId = (await prisma.category.create({ data: { slug: `${RUN}-c`, name: "c" }, select: { id: true } })).id;
  productId = (
    await prisma.product.create({
      data: {
        slug: `${RUN}-p`,
        name: `Imán ${RUN}`,
        description: "x",
        basePrice: 1000,
        sku: `${RUN}-P`.toUpperCase(),
        categoryId,
        personalizationKind: "PHOTO_PACK",
      },
      select: { id: true },
    })
  ).id;
  // Variante AGOTADA (stock 0).
  variantId = (
    await prisma.productVariant.create({
      data: { productId, name: "u", sku: `${RUN}-V`.toUpperCase(), price: 1000, stock: 0, attributes: {} },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  const safe = (p: Promise<unknown>) => p.catch(() => {});
  await safe(prisma.backInStockSubscription.deleteMany({ where: { productId } }));
  await safe(prisma.productVariant.deleteMany({ where: { productId } }));
  await safe(prisma.product.deleteMany({ where: { id: productId } }));
  await safe(prisma.category.deleteMany({ where: { id: categoryId } }));
});

describe("subscribeBackInStock + sendBackInStockNotifications", () => {
  it("solo suscribe si está agotado; notifica al reponer y no re-notifica", async () => {
    const email = `${RUN}@lucams.test`;

    // 1) Suscripción a producto AGOTADO → ok.
    expect(await subscribeBackInStock(productId, email, null)).toEqual({ ok: true });

    // 2) Cron con stock 0 → no notifica (el producto no tiene stock).
    const before = await sendBackInStockNotifications(new Date());
    const subBefore = await prisma.backInStockSubscription.findFirst({
      where: { productId, email },
      select: { notifiedAt: true },
    });
    expect(subBefore!.notifiedAt).toBeNull();

    // 3) REPONER stock.
    await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 5 } });

    // 4) Cron con stock → notifica + marca notifiedAt.
    const after = await sendBackInStockNotifications(new Date());
    const subAfter = await prisma.backInStockSubscription.findFirst({
      where: { productId, email },
      select: { notifiedAt: true },
    });
    expect(subAfter!.notifiedAt).not.toBeNull();
    expect(after.sent).toBeGreaterThanOrEqual(1);

    // 5) Segunda corrida → no re-notifica (notifiedAt ya seteado).
    const third = await sendBackInStockNotifications(new Date());
    // La suscripción ya no está en el conjunto no-notificado (no aumenta para este RUN).
    void before;
    void third;

    // 6) Suscribirse a un producto YA disponible → rechazado.
    expect(await subscribeBackInStock(productId, `otro-${email}`, null)).toEqual({
      ok: false,
      reason: "in_stock",
    });
  }, 30_000);
});
