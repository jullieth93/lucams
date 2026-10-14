/*
 * Integración — ciclo de vida de borradores (Fase 3, plan maduración 2026-10-13).
 * Con DB real (DIRECT_URL compartida de dev) verifica de punta a punta:
 *   - La poda «últimos 3» corre DENTRO de createDraftDesign: al crear el 4º
 *     DRAFT del mismo dueño+producto quedan 3 (el más viejo se elimina con sus
 *     filas DesignAsset) y los READY del mismo producto quedan intactos.
 *   - findReusableDraftDesign retoma el DRAFT activo más reciente del dueño
 *     (mismo producto, variante explícita o no).
 *   - emptyCustomerDraftDesigns («Vaciar borradores») elimina todos los DRAFT
 *     del cliente y nada más.
 *
 * Los fixtures no suben bytes a Storage: las filas se borran igual (la remoción
 * de previews/derivados es no-op best-effort; solo un fallo de las fotos crudas
 * bloquearía el borrado y acá no hay). Mismo patrón que
 * templates.integration.test.ts: prefijo RUN único, limpieza en afterAll,
 * skipIf sin DATABASE_URL.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createDraftDesign } from "./service";
import {
  MAX_DRAFTS_PER_PRODUCT,
  emptyCustomerDraftDesigns,
  findReusableDraftDesign,
} from "./draft-lifecycle";

const hasDb = Boolean(process.env.DATABASE_URL);

const RUN = `dlc${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const T = 30_000;

let categoryId = "";
let productId = "";
let variantId = "";
let customerId = "";

async function draftCount(product: string, customer: string): Promise<number> {
  return prisma.design.count({
    where: { productId: product, customerId: customer, status: "DRAFT" },
  });
}

describe.skipIf(!hasDb)("draft-lifecycle — integración (2026-10-13)", { timeout: T }, () => {
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
          description: "fixture draft-lifecycle",
          basePrice: 10_000,
          sku: `${RUN}-PROD`.toUpperCase(),
          categoryId,
          isPersonalizable: true,
          personalizationKind: "PHOTO_PACK",
          personalizationSchema: { photoSlots: 2, aspectRatio: "1:1" },
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
    customerId = (
      await prisma.customer.create({
        data: {
          email: `${RUN}@lucams.test`,
          supabaseUserId: `${RUN}-sub`,
          referralCode: `${RUN}-ref`,
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    const safe = (p: Promise<unknown>) => p.catch(() => {});
    await safe(prisma.designAsset.deleteMany({ where: { design: { productId } } }));
    await safe(prisma.design.deleteMany({ where: { productId } }));
    await safe(prisma.productVariant.deleteMany({ where: { productId } }));
    await safe(prisma.product.deleteMany({ where: { id: productId } }));
    await safe(prisma.category.deleteMany({ where: { id: categoryId } }));
    await safe(prisma.customer.deleteMany({ where: { id: customerId } }));
  });

  it("al crear el 4º DRAFT quedan 3 (el más viejo se elimina) y el READY queda intacto", async () => {
    const owner = { customerId, sessionId: null };
    // READY del mismo producto: la poda NUNCA lo toca.
    const ready = await prisma.design.create({
      data: { productId, customerId, status: "READY", canvasData: {} },
      select: { id: true },
    });

    const ids: string[] = [];
    for (let i = 0; i < MAX_DRAFTS_PER_PRODUCT + 1; i++) {
      const d = await createDraftDesign({ productId, variantId, ...owner });
      ids.push(d.id);
      // updatedAt distintos para un "más reciente" determinista.
      await prisma.design.update({
        where: { id: d.id },
        data: { updatedAt: new Date(Date.now() + i * 1000) },
      });
    }

    expect(await draftCount(productId, customerId)).toBe(MAX_DRAFTS_PER_PRODUCT);
    // El primer creado (más viejo) fue el eliminado; los 3 últimos sobreviven.
    const survivors = await prisma.design.findMany({
      where: { productId, customerId, status: "DRAFT" },
      select: { id: true },
    });
    expect(survivors.map((s) => s.id).sort()).toEqual(ids.slice(1).sort());
    const readyAlive = await prisma.design.findUnique({ where: { id: ready.id } });
    expect(readyAlive?.status).toBe("READY");
  });

  it("findReusableDraftDesign retoma el DRAFT activo más reciente del dueño+producto", async () => {
    const found = await findReusableDraftDesign({ customerId, sessionId: null, productId });
    expect(found).not.toBeNull();
    const drafts = await prisma.design.findMany({
      where: { productId, customerId, status: "DRAFT" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
      take: 1,
    });
    expect(found!.id).toBe(drafts[0]!.id);
  });

  it("con variante explícita distinta a la de los DRAFT no retoma ninguno", async () => {
    const found = await findReusableDraftDesign({
      customerId,
      sessionId: null,
      productId,
      variantId: "variante-inexistente",
    });
    expect(found).toBeNull();
    // Y con la variante con la que se crearon (metadata.variantId), sí.
    const match = await findReusableDraftDesign({
      customerId,
      sessionId: null,
      productId,
      variantId,
    });
    expect(match).not.toBeNull();
  });

  it("emptyCustomerDraftDesigns elimina todos los DRAFT del cliente y conserva el READY", async () => {
    const res = await emptyCustomerDraftDesigns(customerId);
    expect(res.deleted).toBe(MAX_DRAFTS_PER_PRODUCT);
    expect(await draftCount(productId, customerId)).toBe(0);
    // El READY del primer test sigue vivo.
    expect(await prisma.design.count({ where: { productId, customerId, status: "READY" } })).toBe(
      1,
    );
  });
});
