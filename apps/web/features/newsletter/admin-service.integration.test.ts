/*
 * Integración Postgres — listNewsletterSubscribers (CTE DISTINCT ON) y getCartRecoveryMetrics (SUM SQL).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { listNewsletterSubscribers } from "./admin-service";
import { getCartRecoveryMetrics } from "@/features/cart/admin-service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `newsadm${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

let categoryId = "";
let productId = "";
let variantId = "";
const cartIds: string[] = [];

describe.skipIf(!hasDb)("newsletter/cart admin SQL pagination & aggregates (S11)", () => {
  beforeAll(async () => {
    const cat = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
      select: { id: true },
    });
    categoryId = cat.id;
    const prod = await prisma.product.create({
      data: {
        slug: `${RUN}-prod`,
        name: `Prod ${RUN}`,
        description: "fixture",
        basePrice: 25_000,
        sku: `${RUN}-SKU`.toUpperCase(),
        categoryId,
      },
      select: { id: true },
    });
    productId = prod.id;
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        name: "Único",
        sku: `${RUN}-V1`.toUpperCase(),
        price: 25_000,
        stock: 10,
        attributes: {},
      },
      select: { id: true },
    });
    variantId = variant.id;
  });

  afterAll(async () => {
    await prisma.consent.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.abandonedCart.deleteMany({ where: { email: { startsWith: RUN } } });
    if (cartIds.length > 0) {
      await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
    }
    if (variantId) await prisma.productVariant.deleteMany({ where: { id: variantId } });
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it("listNewsletterSubscribers deduplica por LOWER(email), conserva último alta y pagina en SQL", async () => {
    const t0 = new Date("2026-09-01T10:00:00Z");
    const t1 = new Date("2026-09-05T10:00:00Z");
    const t2 = new Date("2026-09-10T10:00:00Z");

    await prisma.consent.createMany({
      data: [
        // Ana: alta en mayúsculas, baja en minúsculas → queda "unsubscribed" pero conserva fecha de alta
        {
          scope: "NEWSLETTER",
          email: `${RUN}-ANA@example.com`,
          accepted: true,
          acceptedAt: t0,
          version: "v1.2",
        },
        {
          scope: "NEWSLETTER",
          email: `${RUN}-ana@example.com`,
          accepted: false,
          acceptedAt: t1,
          version: "v1.2",
        },
        // Bea: alta vigente
        {
          scope: "NEWSLETTER",
          email: `${RUN}-bea@example.com`,
          accepted: true,
          acceptedAt: t2,
          version: "v2.0",
        },
      ],
    });

    const allRun = await listNewsletterSubscribers({ q: RUN, pageSize: 10 });
    expect(allRun.total).toBe(2);
    expect(allRun.items.map((s) => [s.email, s.status, s.version])).toEqual([
      [`${RUN}-bea@example.com`, "active", "v2.0"],
      [`${RUN}-ana@example.com`, "unsubscribed", "v1.2"],
    ]);
    expect(allRun.items[1]?.subscribedAt).toEqual(t0);
    expect(allRun.items[1]?.unsubscribedAt).toEqual(t1);

    const activeRun = await listNewsletterSubscribers({ q: RUN, status: "active", pageSize: 10 });
    expect(activeRun.total).toBe(1);
    expect(activeRun.items[0]?.email).toBe(`${RUN}-bea@example.com`);
  });

  it("getCartRecoveryMetrics suma valores pendientes y recuperados en SQL sin desbordar memoria", async () => {
    const before = await getCartRecoveryMetrics();

    const pendingCart = await prisma.cart.create({
      data: {
        sessionId: `${RUN}-pending`,
        items: { create: { variantId, qty: 2, unitPrice: 25_000 } }, // 50_000
      },
      select: { id: true },
    });
    cartIds.push(pendingCart.id);
    await prisma.abandonedCart.create({
      data: {
        cartId: pendingCart.id,
        email: `${RUN}-p@example.com`,
      },
    });

    const recoveredCart = await prisma.cart.create({
      data: {
        sessionId: `${RUN}-rec`,
        deletedAt: new Date(),
        items: { create: { variantId, qty: 3, unitPrice: 20_000 } }, // 60_000
      },
      select: { id: true },
    });
    cartIds.push(recoveredCart.id);
    await prisma.abandonedCart.create({
      data: {
        cartId: recoveredCart.id,
        email: `${RUN}-r@example.com`,
        recoveredAt: new Date(),
      },
    });

    const after = await getCartRecoveryMetrics();
    expect(after.pendingCount - before.pendingCount).toBe(1);
    expect(after.pendingValueCents - before.pendingValueCents).toBe(50_000);
    expect(after.recoveredCount - before.recoveredCount).toBe(1);
    expect(after.recoveredValueCents - before.recoveredValueCents).toBe(60_000);
  });
});
