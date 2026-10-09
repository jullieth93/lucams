/*
 * Integración — reopenDesignForEdit (fix F1.1, plan maduración 2026-10).
 * Camino: el Estudio finaliza (READY) y el cliente sigue editando EN LA MISMA SESIÓN
 * (p.ej. el add-to-cart falló y reintentó) → el save forzado pre-finalize reabre el
 * diseño a DRAFT en vez de fallar con el error genérico de guardado.
 *
 * Verifica: (1) READY sin referencias → DRAFT, (2) DRAFT es no-op, (3) READY referenciado
 * por CartItem se RECHAZA (un item de carrito exige READY — ahí toca clonar), (4) ownership.
 *
 * Comparte la Supabase de dev (DIRECT_URL). Fixtures con prefijo RUN, borrados en afterAll.
 * Ver project_integration_tests_share_dev_db.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { reopenDesignForEdit } from "./service";

const RUN = `reopen${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

let categoryId = "";
let productId = "";
let variantId = "";
let ownerId = "";
let strangerId = "";

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
        description: "fixture reopen",
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
  ownerId = (
    await prisma.customer.create({
      data: {
        email: `${RUN}-owner@lucams.test`,
        supabaseUserId: `${RUN}-owner-sub`,
        referralCode: `${RUN}-owner-ref`,
      },
      select: { id: true },
    })
  ).id;
  strangerId = (
    await prisma.customer.create({
      data: {
        email: `${RUN}-stranger@lucams.test`,
        supabaseUserId: `${RUN}-stranger-sub`,
        referralCode: `${RUN}-stranger-ref`,
      },
      select: { id: true },
    })
  ).id;
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

async function makeDesign(status: "DRAFT" | "READY" | "USED_IN_ORDER", customerId: string) {
  const d = await prisma.design.create({
    data: { customerId, productId, status, canvasData: {} },
    select: { id: true },
  });
  return d.id;
}

// Timeout amplio (mismo criterio que clone-design-for-edit.integration.test.ts): varios
// round-trips contra el pooler por caso.
describe("reopenDesignForEdit", { timeout: 30000 }, () => {
  it("READY sin referencias → DRAFT (camino del fix F1.1)", async () => {
    const id = await makeDesign("READY", ownerId);
    const reopened = await reopenDesignForEdit(id, { customerId: ownerId, sessionId: null });
    expect(reopened.status).toBe("DRAFT");
  });

  it("DRAFT es no-op (idempotente)", async () => {
    const id = await makeDesign("DRAFT", ownerId);
    const reopened = await reopenDesignForEdit(id, { customerId: ownerId, sessionId: null });
    expect(reopened.status).toBe("DRAFT");
  });

  it("READY referenciado por un CartItem se RECHAZA (el carrito exige READY)", async () => {
    const id = await makeDesign("READY", ownerId);
    await prisma.cart.create({
      data: {
        sessionId: `${RUN}-sess`,
        items: {
          create: { variantId, designId: id, qty: 1, unitPrice: 10_000 },
        },
      },
    });
    await expect(reopenDesignForEdit(id, { customerId: ownerId, sessionId: null })).rejects.toThrow(
      /referenced/,
    );
    const after = await prisma.design.findUnique({ where: { id }, select: { status: true } });
    expect(after?.status).toBe("READY");
  });

  it("estado no reopenable (USED_IN_ORDER) se rechaza", async () => {
    const id = await makeDesign("USED_IN_ORDER", ownerId);
    await expect(reopenDesignForEdit(id, { customerId: ownerId, sessionId: null })).rejects.toThrow(
      /only READY/,
    );
  });

  it("ownership: otro cliente no puede reabrir el diseño", async () => {
    const id = await makeDesign("READY", ownerId);
    await expect(
      reopenDesignForEdit(id, { customerId: strangerId, sessionId: null }),
    ).rejects.toThrow(/not found or not owned/);
    const after = await prisma.design.findUnique({ where: { id }, select: { status: true } });
    expect(after?.status).toBe("READY");
  });
});
