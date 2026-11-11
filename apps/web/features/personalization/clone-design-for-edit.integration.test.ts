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
import { cloneDesignForEdit, saveCanvas } from "./service";
import { extractCanvasReferencedAssetIds } from "./canvas-remap";
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

// Timeout de suite amplio (mismo criterio que features/cms/service.integration.test.ts):
// cada caso encadena varios round-trips contra el pooler de Supabase (pgbouncer) y el
// default de vitest (5000ms) no alcanza bajo latencia alta — el test de clonado READY→DRAFT
// toma ~7s limpios. Es calibración de infraestructura, no cambio de aserciones.
describe("cloneDesignForEdit", { timeout: 30000 }, () => {
  it("#10 — un clon de un diseño APPROVED nace PENDING (re-moderación al reeditar)", async () => {
    // Diseño APPROVED propio (no reusar readyId compartido, que arrastraría estado a otros tests).
    const approved = await prisma.design.create({
      data: {
        customerId: ownerId,
        productId,
        status: "READY",
        moderationStatus: "APPROVED",
        canvasData: {},
      },
      select: { id: true },
    });
    const clone = await cloneDesignForEdit(approved.id, { customerId: ownerId, sessionId: null });
    expect(clone).not.toBeNull();
    const cloned = await prisma.design.findUnique({
      where: { id: clone!.id },
      select: { moderationStatus: true, status: true },
    });
    // El clon NO hereda la aprobación: vuelve a moderarse al reeditar (invariante anti-abuso).
    expect(cloned!.moderationStatus).toBe("PENDING");
    expect(cloned!.status).toBe("DRAFT");
  });

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

  it("reuso «Mis fotos» entre diseños: saveCanvas y cloneDesignForEdit clonan assets propios del dueño sin permitir IDOR", async () => {
    // Diseño fuente («Mis fotos» previo del mismo owner) + asset ajeno de stranger (anti-IDOR).
    const libraryDesign = await prisma.design.create({
      data: { customerId: ownerId, productId, status: "READY", canvasData: {} },
      select: { id: true },
    });
    const strangerDesign = await prisma.design.create({
      data: { customerId: strangerId, productId, status: "READY", canvasData: {} },
      select: { id: true },
    });
    const sharedPhotoId = await makeAsset(libraryDesign.id, ownerId);
    const sharedPhotoRow = await prisma.designAsset.findUniqueOrThrow({
      where: { id: sharedPhotoId },
      select: { storageUrl: true },
    });
    const strangerPhotoId = await makeAsset(strangerDesign.id, strangerId);

    const draft = await prisma.design.create({
      data: { customerId: ownerId, productId, status: "DRAFT", canvasData: {} },
      select: { id: true },
    });

    await saveCanvas({
      designId: draft.id,
      customerId: ownerId,
      sessionId: null,
      canvasData: {
        version: 2,
        clientRev: 1,
        slotCount: 2,
        unitCount: 1,
        unitSlots: 2,
        photoSlots: 2,
        gridLayout: { cols: 2, rows: 1, gap: 16 },
        unitTemplate: {
          version: 1,
          stage: { width: 480, height: 480, dpiPreview: 72, dpiProduction: 300 },
          layers: [],
        },
        slots: [
          { slotIndex: 0, assetId: sharedPhotoId, assetUrl: "https://x/shared" },
          // Intento de referenciar un asset de OTRO usuario → NO debe copiarse.
          { slotIndex: 1, assetId: strangerPhotoId, assetUrl: "https://x/stranger" },
        ],
      },
    });

    const savedDraft = await prisma.design.findUniqueOrThrow({
      where: { id: draft.id },
      select: { canvasData: true },
    });
    const ownDraftAssets = await prisma.designAsset.findMany({
      where: { designId: draft.id },
      select: { id: true, storageUrl: true, customerId: true },
    });
    // Solo el asset del mismo owner se materializó como fila propia del borrador.
    expect(ownDraftAssets).toHaveLength(1);
    expect(ownDraftAssets[0]!.storageUrl).toBe(sharedPhotoRow.storageUrl);
    expect(ownDraftAssets[0]!.id).not.toBe(sharedPhotoId);
    expect(ownDraftAssets[0]!.customerId).toBe(ownerId);

    const savedSlots = (savedDraft.canvasData as { slots: { assetId: string }[] }).slots;
    expect(savedSlots[0]!.assetId).toBe(ownDraftAssets[0]!.id);
    // El asset de stranger NO fue adoptado ni copiado.
    expect(savedSlots[1]!.assetId).toBe(strangerPhotoId);
    expect(extractCanvasReferencedAssetIds(savedDraft.canvasData)).toEqual([
      ownDraftAssets[0]!.id,
      strangerPhotoId,
    ]);

    // Incluso en un diseño histórico READY cuyo canvasData apuntaba directo al assetId de otro
    // diseño del mismo owner, cloneDesignForEdit lo resuelve y le crea su DesignAsset propio.
    const legacyReady = await prisma.design.create({
      data: {
        customerId: ownerId,
        productId,
        status: "READY",
        canvasData: {
          version: 2,
          slots: [{ slotIndex: 0, assetId: sharedPhotoId, assetUrl: "https://x/shared" }],
        },
      },
      select: { id: true },
    });

    const clonedLegacy = await cloneDesignForEdit(legacyReady.id, {
      customerId: ownerId,
      sessionId: null,
    });
    expect(clonedLegacy).not.toBeNull();
    const clonedLegacyAssets = await prisma.designAsset.findMany({
      where: { designId: clonedLegacy!.id },
      select: { id: true, storageUrl: true },
    });
    expect(clonedLegacyAssets).toHaveLength(1);
    expect(clonedLegacyAssets[0]!.storageUrl).toBe(sharedPhotoRow.storageUrl);
    const clonedLegacyDesign = await prisma.design.findUniqueOrThrow({
      where: { id: clonedLegacy!.id },
      select: { canvasData: true },
    });
    const clonedLegacySlots = (clonedLegacyDesign.canvasData as { slots: { assetId: string }[] })
      .slots;
    expect(clonedLegacySlots[0]!.assetId).toBe(clonedLegacyAssets[0]!.id);
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
