/*
 * Integración — editar diseño desde el carrito (clonar READY→DRAFT + reemplazo del item).
 * Camino CRÍTICO del carrito: verifica que (1) clonar copia canvas+assets con ids nuevos y remapea
 * el canvas, (2) el original queda intacto, (3) el ownership se respeta, y (4) addPersonalizedToCart
 * con replaceDesignId reemplaza el item EN SITIO (no duplica).
 *
 * Comparte la Supabase de dev (DIRECT_URL). Fixtures con prefijo RUN, borrados en afterAll.
 * Ver project_integration_tests_share_dev_db.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cloneDesignForEdit } from "./service";
import { addPersonalizedToCart } from "@/features/cart/service";

const RUN = `clone${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

let categoryId = "";
let productId = "";
let variantId = "";
let ownerId = "";
let strangerId = "";
let readyId = "";
let asset1 = "";
let asset2 = "";

async function makeCustomer(tag: string): Promise<string> {
  const c = await prisma.customer.create({
    data: {
      email: `${RUN}-${tag}@lucams.test`,
      supabaseUserId: `${RUN}-${tag}-sub`,
      referralCode: `${RUN}-${tag}-ref`,
    },
    select: { id: true },
  });
  return c.id;
}

async function makeAsset(designId: string, customerId: string): Promise<string> {
  const a = await prisma.designAsset.create({
    data: {
      designId,
      customerId,
      storageUrl: `customer-uploads/${RUN}/${Math.random().toString(36).slice(2)}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 1234,
      width: 800,
      height: 600,
    },
    select: { id: true },
  });
  return a.id;
}

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
        name: `Fotoimán ${RUN}`,
        description: "fixture clone",
        basePrice: 10_000,
        sku: `${RUN}-PROD`.toUpperCase(),
        categoryId,
        isPersonalizable: true,
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
        stock: 50,
        attributes: {},
      },
      select: { id: true },
    })
  ).id;

  ownerId = await makeCustomer("owner");
  strangerId = await makeCustomer("stranger");

  // Diseño READY del owner con 2 assets y un canvas que los referencia por assetId.
  readyId = (
    await prisma.design.create({
      data: { customerId: ownerId, productId, status: "READY", canvasData: {} },
      select: { id: true },
    })
  ).id;
  asset1 = await makeAsset(readyId, ownerId);
  asset2 = await makeAsset(readyId, ownerId);
  await prisma.design.update({
    where: { id: readyId },
    data: {
      canvasData: {
        version: 2,
        slots: [
          { slotIndex: 0, assetId: asset1, assetUrl: "https://x/1" },
          { slotIndex: 1, assetId: asset2, assetUrl: "https://x/2" },
        ],
      },
    },
  });
});

afterAll(async () => {
  const safe = (p: Promise<unknown>) => p.catch(() => {});
  await safe(prisma.cartItem.deleteMany({ where: { variant: { productId } } }));
  await safe(prisma.cart.deleteMany({ where: { sessionId: { contains: RUN } } }));
  await safe(prisma.designAsset.deleteMany({ where: { design: { productId } } }));
  await safe(prisma.design.deleteMany({ where: { productId } }));
  await safe(prisma.productVariant.deleteMany({ where: { productId } }));
  await safe(prisma.product.deleteMany({ where: { id: productId } }));
  await safe(prisma.category.deleteMany({ where: { id: categoryId } }));
  await safe(prisma.customer.deleteMany({ where: { email: { contains: RUN } } }));
});

describe("cloneDesignForEdit", () => {
  it("clona READY→DRAFT: assets nuevos (mismo storageUrl), canvas remapeado, original intacto", async () => {
    const clone = await cloneDesignForEdit(readyId, { customerId: ownerId, sessionId: null });
    expect(clone).not.toBeNull();

    const cloned = await prisma.design.findUnique({
      where: { id: clone!.id },
      select: { status: true, productId: true, customerId: true, canvasData: true },
    });
    expect(cloned!.status).toBe("DRAFT");
    expect(cloned!.productId).toBe(productId);
    expect(cloned!.customerId).toBe(ownerId);

    // Assets del clon: 2, ids DISTINTOS de los originales, mismo storageUrl.
    const cloneAssets = await prisma.designAsset.findMany({
      where: { designId: clone!.id },
      select: { id: true, storageUrl: true },
    });
    expect(cloneAssets).toHaveLength(2);
    const cloneAssetIds = cloneAssets.map((a) => a.id);
    expect(cloneAssetIds).not.toContain(asset1);
    expect(cloneAssetIds).not.toContain(asset2);

    // Canvas del clon: los assetId apuntan a los assets NUEVOS (remapeados), no a los originales.
    const slots = (cloned!.canvasData as { slots: { assetId: string }[] }).slots;
    const canvasAssetIds = slots.map((s) => s.assetId);
    expect(canvasAssetIds).not.toContain(asset1);
    expect(canvasAssetIds).not.toContain(asset2);
    for (const id of canvasAssetIds) expect(cloneAssetIds).toContain(id);

    // ORIGINAL intacto: sigue READY, con sus 2 assets originales.
    const original = await prisma.design.findUnique({
      where: { id: readyId },
      select: { status: true },
    });
    expect(original!.status).toBe("READY");
    const originalAssets = await prisma.designAsset.findMany({
      where: { designId: readyId },
      select: { id: true },
    });
    expect(originalAssets.map((a) => a.id).sort()).toEqual([asset1, asset2].sort());
  });

  it("rechaza clonar un diseño de OTRO dueño (null)", async () => {
    const clone = await cloneDesignForEdit(readyId, { customerId: strangerId, sessionId: null });
    expect(clone).toBeNull();
  });

  it("rechaza clonar un diseño que NO está READY (null)", async () => {
    const draft = await prisma.design.create({
      data: { customerId: ownerId, productId, status: "DRAFT", canvasData: {} },
      select: { id: true },
    });
    const clone = await cloneDesignForEdit(draft.id, { customerId: ownerId, sessionId: null });
    expect(clone).toBeNull();
  });
});

describe("addPersonalizedToCart — replaceDesignId (edición desde el carrito)", () => {
  it("reemplaza EN SITIO el item del diseño original, sin duplicar", async () => {
    const sessionId = `${RUN}-sess`;
    // Dos diseños READY del owner: A (en el carrito) y B (la edición finalizada).
    const designA = (
      await prisma.design.create({
        data: { customerId: ownerId, sessionId, productId, status: "READY", canvasData: {} },
        select: { id: true },
      })
    ).id;
    const designB = (
      await prisma.design.create({
        data: { customerId: ownerId, sessionId, productId, status: "READY", canvasData: {} },
        select: { id: true },
      })
    ).id;

    // Carrito con el item apuntando a A.
    const before = await addPersonalizedToCart({
      sessionId,
      customerId: ownerId,
      designId: designA,
      qty: 1,
      variantId,
    });
    expect(before.items).toHaveLength(1);
    expect(before.items[0].designId).toBe(designA);

    // Editar desde el carrito → finaliza B y reemplaza A.
    const after = await addPersonalizedToCart({
      sessionId,
      customerId: ownerId,
      designId: designB,
      qty: 1,
      variantId,
      replaceDesignId: designA,
    });
    // Mismo nº de items (no duplicó); el item ahora apunta a B.
    expect(after.items).toHaveLength(1);
    expect(after.items[0].designId).toBe(designB);
  }, 30_000); // dos flujos completos de carrito contra el pooler → holgura sobre el default de 5s
});
