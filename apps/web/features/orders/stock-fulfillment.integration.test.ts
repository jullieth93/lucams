import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { addProductToCart } from "@/features/cart/service";
import {
  getStorefrontProductBySlug,
  listStorefrontProducts,
} from "@/features/products/public-service";
import { listVariantsAcrossProducts } from "@/features/products/inventory-service";
import { listCatalogProducts } from "@/lib/catalog";
import { buildGoogleMerchantFeed } from "@/lib/feeds/google-merchant";
import { assertStockAvailable, decrementStockForOrder, revertStockForOrder } from "./stock";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `itest-stock-${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

let categoryId = "";
let physicalProductId = "";
let physicalProductSlug = "";
let madeProductId = "";
let physicalVariantId = "";
let madeVariantId = "";
const CART_SESSION = `${RUN}-cart-sess`;

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
    physicalProductSlug = physical.slug;
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
    await prisma.cartItem.deleteMany({ where: { cart: { sessionId: CART_SESSION } } });
    await prisma.cart.deleteMany({ where: { sessionId: CART_SESSION } });
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

  it("paridad 1:1 de safetyStock con stock=5 y safetyStock=2 (máx. vendible = 3)", async () => {
    await prisma.productVariant.update({
      where: { id: physicalVariantId },
      data: { stock: 5, safetyStock: 2 },
    });
    await prisma.cartItem.deleteMany({ where: { cart: { sessionId: CART_SESSION } } });

    // PDP + listados storefront/catálogo
    const pdp = await getStorefrontProductBySlug(physicalProductSlug);
    expect(pdp?.inStock).toBe(true);
    expect(pdp?.variants[0]?.stock).toBe(5);
    expect(pdp?.variants[0]?.safetyStock).toBe(2);

    const storefrontCards = await listStorefrontProducts({ categorySlug: `${RUN}-cat` });
    expect(storefrontCards.find((p) => p.id === physicalProductId)?.inStock).toBe(true);

    const catalogCards = await listCatalogProducts({ categorySlug: `${RUN}-cat` });
    expect(catalogCards.find((p) => p.slug === physicalProductSlug)?.inStock).toBe(true);

    // Carrito: pedir 5 clampea al disponible neto = 3 y expone stock=3
    const cart = await addProductToCart({
      sessionId: CART_SESSION,
      customerId: null,
      productSlug: physicalProductSlug,
      variantId: physicalVariantId,
      qty: 5,
    });
    expect(cart.items[0]?.qty).toBe(3);
    expect(cart.items[0]?.maxQty).toBe(3);
    expect(cart.items[0]?.stock).toBe(3);

    // Checkout / assertStockAvailable: 3 pasa, 4 falla con available=3
    await prisma.$transaction((tx) =>
      assertStockAvailable(tx, [{ variantId: physicalVariantId, qty: 3 }]),
    );
    await expect(
      prisma.$transaction((tx) =>
        assertStockAvailable(tx, [{ variantId: physicalVariantId, qty: 4 }]),
      ),
    ).rejects.toMatchObject({ name: "InsufficientStockError", available: 3 });

    // Decremento atómico: 4 falla y deja stock intacto en 5; 3 pasa y deja stock=2 (= safetyStock)
    await expect(
      prisma.$transaction((tx) =>
        decrementStockForOrder(tx, {
          id: `${RUN}-ss-over`,
          number: "LCM-SS-OVER",
          items: [{ variantId: physicalVariantId, qty: 4 }],
        }),
      ),
    ).rejects.toMatchObject({ name: "InsufficientStockError", available: 3 });
    expect(
      (await prisma.productVariant.findUnique({ where: { id: physicalVariantId } }))?.stock,
    ).toBe(5);

    const decOrder = {
      id: `${RUN}-ss-exact`,
      number: "LCM-SS-EXACT",
      items: [{ variantId: physicalVariantId, qty: 3 }],
    };
    const dec = await prisma.$transaction((tx) => decrementStockForOrder(tx, decOrder));
    expect(dec.decrementedVariants).toEqual([physicalVariantId]);
    expect(
      (await prisma.productVariant.findUnique({ where: { id: physicalVariantId } }))?.stock,
    ).toBe(2);

    // Con stock=2 y safetyStock=2, el disponible neto es 0 → siguiente orden falla
    await expect(
      prisma.$transaction((tx) =>
        decrementStockForOrder(tx, {
          id: `${RUN}-ss-next`,
          number: "LCM-SS-NEXT",
          items: [{ variantId: physicalVariantId, qty: 1 }],
        }),
      ),
    ).rejects.toMatchObject({ name: "InsufficientStockError", available: 0 });

    // Revertir deja stock=5 nuevamente
    await prisma.$transaction((tx) => revertStockForOrder(tx, decOrder, "ORDER_CANCELLED"));
    expect(
      (await prisma.productVariant.findUnique({ where: { id: physicalVariantId } }))?.stock,
    ).toBe(5);

    // /admin/inventario + Google Merchant
    const inv = await listVariantsAcrossProducts({ q: `${RUN}-PHYSICAL-V`.toUpperCase() });
    const invRow = inv.rows.find((r) => r.variantId === physicalVariantId);
    expect(invRow?.availableStock).toBe(3);
    expect(invRow?.status).toBe("low");

    const xml = buildGoogleMerchantFeed(
      [
        {
          slug: physicalProductSlug,
          name: `Físico ${RUN}`,
          description: "Producto físico",
          basePrice: 10_000,
          fulfillmentMode: "PHYSICAL_STOCK",
          images: [],
          variants: [
            {
              id: physicalVariantId,
              sku: `${RUN}-PHYSICAL-V`.toUpperCase(),
              name: "Única",
              price: null,
              stock: 5,
              safetyStock: 2,
              images: [],
            },
          ],
        },
      ],
      { siteUrl: "https://lucamsshop.com" },
    );
    expect(xml).toContain("<g:availability>in stock</g:availability>");
  });

  it("paridad 1:1 de safetyStock con stock=5 y safetyStock=5 (agotado público en todos los canales)", async () => {
    await prisma.productVariant.update({
      where: { id: physicalVariantId },
      data: { stock: 5, safetyStock: 5 },
    });
    await prisma.cartItem.deleteMany({ where: { cart: { sessionId: CART_SESSION } } });

    const pdp = await getStorefrontProductBySlug(physicalProductSlug);
    expect(pdp?.inStock).toBe(false);

    const storefrontCards = await listStorefrontProducts({ categorySlug: `${RUN}-cat` });
    expect(storefrontCards.find((p) => p.id === physicalProductId)?.inStock).toBe(false);

    const catalogCards = await listCatalogProducts({ categorySlug: `${RUN}-cat` });
    expect(catalogCards.find((p) => p.slug === physicalProductSlug)?.inStock).toBe(false);

    await expect(
      addProductToCart({
        sessionId: CART_SESSION,
        customerId: null,
        productSlug: physicalProductSlug,
        variantId: physicalVariantId,
        qty: 1,
      }),
    ).rejects.toMatchObject({ name: "CartError", code: "STOCK_UNAVAILABLE" });

    await expect(
      prisma.$transaction((tx) =>
        assertStockAvailable(tx, [{ variantId: physicalVariantId, qty: 1 }]),
      ),
    ).rejects.toMatchObject({ name: "InsufficientStockError", available: 0 });

    await expect(
      prisma.$transaction((tx) =>
        decrementStockForOrder(tx, {
          id: `${RUN}-ss-zero`,
          number: "LCM-SS-ZERO",
          items: [{ variantId: physicalVariantId, qty: 1 }],
        }),
      ),
    ).rejects.toMatchObject({ name: "InsufficientStockError", available: 0 });
    expect(
      (await prisma.productVariant.findUnique({ where: { id: physicalVariantId } }))?.stock,
    ).toBe(5);

    const inv = await listVariantsAcrossProducts({ q: `${RUN}-PHYSICAL-V`.toUpperCase() });
    const invRow = inv.rows.find((r) => r.variantId === physicalVariantId);
    expect(invRow?.availableStock).toBe(0);
    expect(invRow?.status).toBe("out");

    const xml = buildGoogleMerchantFeed(
      [
        {
          slug: physicalProductSlug,
          name: `Físico ${RUN}`,
          description: "Producto físico",
          basePrice: 10_000,
          fulfillmentMode: "PHYSICAL_STOCK",
          images: [],
          variants: [
            {
              id: physicalVariantId,
              sku: `${RUN}-PHYSICAL-V`.toUpperCase(),
              name: "Única",
              price: null,
              stock: 5,
              safetyStock: 5,
              images: [],
            },
          ],
        },
      ],
      { siteUrl: "https://lucamsshop.com" },
    );
    expect(xml).toContain("<g:availability>out of stock</g:availability>");

    // MADE_TO_ORDER sigue sin control de stock incluso con safetyStock > 0
    await prisma.productVariant.update({
      where: { id: madeVariantId },
      data: { stock: 0, safetyStock: 5 },
    });
    await prisma.$transaction((tx) =>
      assertStockAvailable(tx, [{ variantId: madeVariantId, qty: 10 }]),
    );
  });
});
