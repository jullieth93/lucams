import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { assertStockAvailable, decrementStockForOrder, revertStockForOrder } from "./stock";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `itest-stock-${Date.now()}${Math.floor(Math.random() * 1e6)}`;

let categoryId = "";
let physicalProductId = "";
let madeProductId = "";
let physicalVariantId = "";
let madeVariantId = "";

describe.skipIf(!hasDb)("stock por fulfillmentMode — PostgreSQL real", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Categoría ${RUN}` },
    });
    categoryId = category.id;
    const physical = await prisma.product.create({
      data: {
        slug: `${RUN}-physical`,
        name: `Físico ${RUN}`,
        description: "Producto físico de prueba",
        basePrice: 10_000,
        sku: `${RUN}-PHYSICAL`.toUpperCase(),
        categoryId,
        fulfillmentMode: "PHYSICAL_STOCK",
      },
    });
    physicalProductId = physical.id;
    const made = await prisma.product.create({
      data: {
        slug: `${RUN}-made`,
        name: `Bajo pedido ${RUN}`,
        description: "Producto bajo pedido de prueba",
        basePrice: 10_000,
        sku: `${RUN}-MADE`.toUpperCase(),
        categoryId,
        fulfillmentMode: "MADE_TO_ORDER",
      },
    });
    madeProductId = made.id;
    physicalVariantId = (
      await prisma.productVariant.create({
        data: {
          productId: physicalProductId,
          name: "Única",
          sku: `${RUN}-PHYSICAL-V`.toUpperCase(),
          stock: 5,
          safetyStock: 1,
          attributes: {},
        },
      })
    ).id;
    madeVariantId = (
      await prisma.productVariant.create({
        data: {
          productId: madeProductId,
          name: "Única",
          sku: `${RUN}-MADE-V`.toUpperCase(),
          stock: 0,
          attributes: {},
        },
      })
    ).id;
  });

  afterAll(async () => {
    const variantIds = [physicalVariantId, madeVariantId].filter(Boolean);
    if (variantIds.length > 0) {
      await prisma.inventoryLog.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    }
    const productIds = [physicalProductId, madeProductId].filter(Boolean);
    if (productIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it("MADE_TO_ORDER no exige stock; PHYSICAL_STOCK conserva el rechazo", async () => {
    await prisma.$transaction(async (tx) => {
      await assertStockAvailable(tx, [{ variantId: madeVariantId, qty: 50 }]);
    });
    await expect(
      prisma.$transaction(async (tx) => {
        await assertStockAvailable(tx, [{ variantId: physicalVariantId, qty: 6 }]);
      }),
    ).rejects.toMatchObject({ name: "InsufficientStockError" });
  });

  it("una orden mixta solo descuenta y revierte la variante física", async () => {
    const order = {
      id: `${RUN}-mixed`,
      number: "LCM-TEST-MIXED",
      items: [
        { variantId: physicalVariantId, qty: 2 },
        { variantId: madeVariantId, qty: 4 },
      ],
    };
    const decrement = await prisma.$transaction((tx) => decrementStockForOrder(tx, order));
    expect(decrement.decrementedVariants).toEqual([physicalVariantId]);

    let variants = await prisma.productVariant.findMany({
      where: { id: { in: [physicalVariantId, madeVariantId] } },
      select: { id: true, stock: true },
    });
    expect(variants.find((v) => v.id === physicalVariantId)?.stock).toBe(3);
    expect(variants.find((v) => v.id === madeVariantId)?.stock).toBe(0);

    const revert = await prisma.$transaction((tx) =>
      revertStockForOrder(tx, order, "ORDER_CANCELLED"),
    );
    expect(revert.revertedVariants).toEqual([physicalVariantId]);
    variants = await prisma.productVariant.findMany({
      where: { id: { in: [physicalVariantId, madeVariantId] } },
      select: { id: true, stock: true },
    });
    expect(variants.find((v) => v.id === physicalVariantId)?.stock).toBe(5);
    expect(variants.find((v) => v.id === madeVariantId)?.stock).toBe(0);
    expect(await prisma.inventoryLog.count({ where: { orderId: order.id } })).toBe(2);
  });

  it("una orden solo bajo pedido no crea movimientos ni cambia el stock", async () => {
    const order = {
      id: `${RUN}-made-only`,
      number: "LCM-TEST-MADE",
      items: [{ variantId: madeVariantId, qty: 3 }],
    };
    const result = await prisma.$transaction((tx) => decrementStockForOrder(tx, order));
    expect(result).toEqual({ decrementedVariants: [], alreadyApplied: false });
    const revert = await prisma.$transaction((tx) =>
      revertStockForOrder(tx, order, "ORDER_CANCELLED"),
    );
    expect(revert.skipped).toBe(true);
    expect(await prisma.inventoryLog.count({ where: { orderId: order.id } })).toBe(0);
    expect((await prisma.productVariant.findUnique({ where: { id: madeVariantId } }))?.stock).toBe(
      0,
    );
  });

  it("idempotencyKey es único y channel conserva el canal de la venta", async () => {
    const key = `${RUN}-external-1`;
    const log = await prisma.inventoryLog.create({
      data: {
        variantId: physicalVariantId,
        delta: -1,
        reason: "ORDER_PAID",
        channel: "MERCADOLIBRE",
        channelOrderId: "external-order-1",
        idempotencyKey: key,
      },
    });
    expect(log.channel).toBe("MERCADOLIBRE");
    await expect(
      prisma.inventoryLog.create({
        data: {
          variantId: physicalVariantId,
          delta: -1,
          reason: "ADMIN_ADJUSTMENT",
          idempotencyKey: key,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("PostgreSQL rechaza safetyStock negativo", async () => {
    await expect(
      prisma.productVariant.update({
        where: { id: physicalVariantId },
        data: { safetyStock: -1 },
      }),
    ).rejects.toThrow();
  });
});
