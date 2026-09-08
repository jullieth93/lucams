/*
 * Tests de integración — addPersonalizedToCart resuelve la variante del pack
 * SERVER-SIDE desde el canvasData del diseño (Lucy 2026-09-05).
 *
 * Contrato nuevo: el flujo packs NO manda variantId; el service lee
 * photoSlots/sizeCm del canvasData guardado y resuelve la variante exacta del
 * catálogo (precio + stock SIEMPRE server-side — la ruta del dinero no confía
 * en el cliente). Cobertura:
 *   - resolución exacta por (photoSlots, sizeCm) → variantId + unitPrice correctos
 *   - diseño legacy sin photoSlots → fallback histórico (primera variante)
 *   - combinación que ya no existe en el catálogo → CartError NO_DEFAULT_VARIANT
 *   - variante resuelta agotada → CartError STOCK_UNAVAILABLE
 *   - variantId explícito (otros flujos) sigue validándose: tamper → error
 *
 * Mismo patrón que service.integration.test.ts: DB real (skipIf sin DATABASE_URL),
 * fixtures RUN-prefijados, limpieza scoped.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma, Prisma } from "@/lib/db";
import { CartError, addPersonalizedToCart } from "./service";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `pack${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const T = 30_000;

let categoryId = "";
let packProductId = "";
let vS66N1 = ""; // 6×6 · 1 foto · $10.000 · stock 5
let vS66N2 = ""; // 6×6 · 2 fotos · $18.000 · stock 5
let _vS1010N1 = ""; // 10×10 · 1 foto · $15.000 · stock 5
let _vS1010N2 = ""; // 10×10 · 2 fotos · $25.000 · stock 0 (agotada)
let designN2S66 = ""; // canvasData con photoSlots:2, sizeCm:"6×6"
let designLegacy = ""; // canvasData V2 SIN photoSlots (pre-feature)
let designImpossible = ""; // canvasData con photoSlots:9 (no existe en catálogo)
let designSoldOut = ""; // canvasData con photoSlots:2, sizeCm:"10×10" (variante agotada)

function sid(label: string): string {
  return `${RUN}-${label}-${Math.floor(Math.random() * 1e9)}`;
}

describe.skipIf(!hasDb)("cart/service — resolución pack server-side (Lucy 2026-09-05)", () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Pack ${RUN}` },
    });
    categoryId = category.id;

    const pack = await prisma.product.create({
      data: {
        slug: `${RUN}-pack`,
        name: `Pack ${RUN}`,
        description: "fixture pack fotoimanes",
        basePrice: 50_000,
        sku: `${RUN}-PACK`.toUpperCase(),
        categoryId,
        personalizationKind: "PHOTO_PACK",
        variants: {
          create: [
            {
              name: "6x6 · 1",
              sku: `${RUN}-PACK-S66-N1`.toUpperCase(),
              price: 10_000,
              stock: 5,
              attributes: { photoSlots: 1, sizeCm: "6×6" },
            },
            {
              name: "6x6 · 2",
              sku: `${RUN}-PACK-S66-N2`.toUpperCase(),
              price: 18_000,
              stock: 5,
              attributes: { photoSlots: 2, sizeCm: "6×6" },
            },
            {
              name: "10x10 · 1",
              sku: `${RUN}-PACK-S1010-N1`.toUpperCase(),
              price: 15_000,
              stock: 5,
              attributes: { photoSlots: 1, sizeCm: "10×10" },
            },
            {
              name: "10x10 · 2",
              sku: `${RUN}-PACK-S1010-N2`.toUpperCase(),
              price: 25_000,
              stock: 0,
              attributes: { photoSlots: 2, sizeCm: "10×10" },
            },
          ],
        },
      },
      select: { id: true, variants: { select: { id: true, sku: true } } },
    });
    packProductId = pack.id;
    vS66N1 = pack.variants.find((v) => v.sku.includes("S66-N1"))!.id;
    vS66N2 = pack.variants.find((v) => v.sku.includes("S66-N2"))!.id;
    _vS1010N1 = pack.variants.find((v) => v.sku.includes("S1010-N1"))!.id;
    _vS1010N2 = pack.variants.find((v) => v.sku.includes("S1010-N2"))!.id;

    const unitTemplate = {
      version: 1,
      stage: { width: 1080, height: 1080 },
      layers: [{ id: "bg", type: "background", color: "#FFFFFF" }],
    };
    const mkCanvas = (photoSlots: number, sizeCm: string) => ({
      version: 2,
      unitTemplate,
      photoSlots,
      sizeCm,
      slotCount: photoSlots,
      slots: Array.from({ length: photoSlots }, (_, i) => ({
        slotIndex: i,
        assetId: `asset-${i}`,
        assetUrl: `https://cdn.lucams.test/${i}.jpg`,
      })),
      gridLayout: { cols: photoSlots, rows: 1, gap: 24 },
    });

    const mkDesign = (canvasData: unknown) =>
      prisma.design.create({
        data: {
          sessionId: sid("design"),
          productId: packProductId,
          status: "READY",
          canvasData: canvasData as Prisma.InputJsonValue,
          previewUrl: "https://cdn.lucams.test/preview-pack.png",
        },
        select: { id: true },
      });

    designN2S66 = (await mkDesign(mkCanvas(2, "6×6"))).id;
    designLegacy = (
      await mkDesign({ version: 2, slotCount: 1, marca: "pre-feature-sin-photoslots" })
    ).id;
    designImpossible = (await mkDesign(mkCanvas(9, "6×6"))).id;
    designSoldOut = (await mkDesign(mkCanvas(2, "10×10"))).id;
  }, T);

  afterEach(async () => {
    await prisma.cartItem.deleteMany({ where: { cart: { sessionId: { startsWith: RUN } } } });
    await prisma.cart.deleteMany({ where: { sessionId: { startsWith: RUN } } });
  });

  afterAll(async () => {
    await prisma.cartItem.deleteMany({ where: { cart: { sessionId: { startsWith: RUN } } } });
    await prisma.cart.deleteMany({ where: { sessionId: { startsWith: RUN } } });
    await prisma.design.deleteMany({ where: { productId: packProductId } });
    await prisma.design.deleteMany({ where: { sessionId: { startsWith: RUN } } });
    await prisma.productVariant.deleteMany({ where: { productId: packProductId } });
    await prisma.product.deleteMany({ where: { id: packProductId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
  });

  it(
    "sin variantId resuelve la variante exacta desde el canvasData (photoSlots + sizeCm) y snapshot de precio",
    { timeout: T },
    async () => {
      const detail = await addPersonalizedToCart({
        sessionId: sid("cart"),
        customerId: null,
        designId: designN2S66,
        qty: 2,
      });
      expect(detail.items).toHaveLength(1);
      const item = detail.items[0];
      expect(item.variantId).toBe(vS66N2); // 6×6 · 2 fotos — NO la primera variante
      expect(item.unitPrice).toBe(18_000); // precio de ESA variante (server-side)
      expect(item.qty).toBe(2);
      expect(item.lineTotal).toBe(36_000);
    },
  );

  it("diseño legacy sin photoSlots mantiene el fallback histórico (primera variante)", async () => {
    const detail = await addPersonalizedToCart({
      sessionId: sid("cart"),
      customerId: null,
      designId: designLegacy,
      qty: 1,
    });
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0].variantId).toBe(vS66N1); // primera por createdAt
    expect(detail.items[0].unitPrice).toBe(10_000);
  });

  it("combinación que ya no existe en el catálogo → NO_DEFAULT_VARIANT (error claro, sin precio inventado)", async () => {
    await expect(
      addPersonalizedToCart({
        sessionId: sid("cart"),
        customerId: null,
        designId: designImpossible,
        qty: 1,
      }),
    ).rejects.toThrow(CartError);
    await expect(
      addPersonalizedToCart({
        sessionId: sid("cart"),
        customerId: null,
        designId: designImpossible,
        qty: 1,
      }),
    ).rejects.toMatchObject({ code: "NO_DEFAULT_VARIANT" });
  });

  it("la variante resuelta agotada bloquea la línea (STOCK_UNAVAILABLE), igual que el resto del carrito", async () => {
    await expect(
      addPersonalizedToCart({
        sessionId: sid("cart"),
        customerId: null,
        designId: designSoldOut,
        qty: 1,
      }),
    ).rejects.toMatchObject({ code: "STOCK_UNAVAILABLE" });
  });

  it("variantId explícito de OTRO producto sigue detectándose como tamper", async () => {
    const otra = await prisma.product.create({
      data: {
        slug: `${RUN}-otra-${Math.floor(Math.random() * 1e6)}`,
        name: `Otra ${RUN}`,
        description: "fixture ajeno",
        basePrice: 1,
        sku: `${RUN}-OTRA${Date.now().toString(36)}`.toUpperCase(),
        categoryId,
      },
      select: { id: true },
    });
    try {
      await expect(
        addPersonalizedToCart({
          sessionId: sid("cart"),
          customerId: null,
          designId: designN2S66,
          variantId: otra.id, // un productId, no un variantId válido → no matchea ninguna variante
          qty: 1,
        }),
      ).rejects.toMatchObject({ code: "NO_DEFAULT_VARIANT" });
    } finally {
      await prisma.product.delete({ where: { id: otra.id } });
    }
  });
});
