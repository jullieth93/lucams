/*
 * Integración — Moderación de contenido (ADR-062 P0-2). Cubre: el gate del envío
 * (orderHasUnmoderatedDesigns), la cola (listPendingModeration), aprobar y rechazar.
 * Solo Prisma (Postgres) → corre en CI. Comparte la Supabase de dev; fixtures RUN-prefijados.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ensureDesignShareToken, getSharedDesign } from "@/features/personalization/service";
import {
  listPendingModeration,
  approveDesign,
  rejectDesign,
  orderHasUnmoderatedDesigns,
} from "./service";

const RUN = `mod${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const ADMIN_ID = `${RUN}-admin`;
let categoryId = "";
let productId = "";
let variantId = "";
let customerId = "";
let designId = "";
let orderId = "";
let orderNumber = "";
let design2Id = "";
let order2Id = "";

async function makeOrder(suffix: string, designId: string | null) {
  return prisma.order.create({
    data: {
      number: `${RUN}-${suffix}`,
      email: `${RUN}@lucams.test`,
      phone: "3001112233",
      shippingAddress: { fullName: "Test Cliente", city: "Bogotá", department: "Bogotá D.C." },
      subtotal: 1000,
      shipping: 0,
      total: 1000,
      paymentMethod: "COD",
      status: "PAID",
      items: {
        create: [{ variantId, qty: 1, unitPrice: 1000, ...(designId ? { designId } : {}) }],
      },
    },
    select: { id: true, number: true },
  });
}

beforeAll(async () => {
  categoryId = (
    await prisma.category.create({ data: { slug: `${RUN}-c`, name: "c" }, select: { id: true } })
  ).id;
  productId = (
    await prisma.product.create({
      data: {
        slug: `${RUN}-p`,
        name: `Imán ${RUN}`,
        description: "x",
        basePrice: 1000,
        sku: `${RUN}-P`.toUpperCase(),
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
        name: "u",
        sku: `${RUN}-V`.toUpperCase(),
        price: 1000,
        stock: 5,
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

  designId = (
    await prisma.design.create({
      data: {
        customerId,
        productId,
        status: "USED_IN_ORDER",
        canvasData: {},
        previewUrl: "https://cdn.lucams.test/p.png",
      },
      select: { id: true },
    })
  ).id;
  const order = await makeOrder("ORD1", designId);
  orderId = order.id;
  orderNumber = order.number;

  design2Id = (
    await prisma.design.create({
      data: { customerId, productId, status: "USED_IN_ORDER", canvasData: {}, previewUrl: null },
      select: { id: true },
    })
  ).id;
  const order2 = await makeOrder("ORD2", design2Id);
  order2Id = order2.id;
});

afterAll(async () => {
  const safe = (p: Promise<unknown>) => p.catch(() => {});
  await safe(prisma.orderItem.deleteMany({ where: { order: { number: { contains: RUN } } } }));
  await safe(prisma.order.deleteMany({ where: { number: { contains: RUN } } }));
  await safe(prisma.design.deleteMany({ where: { productId } }));
  await safe(prisma.productVariant.deleteMany({ where: { productId } }));
  await safe(prisma.product.deleteMany({ where: { id: productId } }));
  await safe(prisma.category.deleteMany({ where: { id: categoryId } }));
  await safe(prisma.customer.deleteMany({ where: { id: customerId } }));
});

describe("moderation service", () => {
  it("gate: un pedido con diseño PENDING bloquea el envío", async () => {
    expect(await orderHasUnmoderatedDesigns(orderId)).toBe(true);
  });

  it("la cola incluye el diseño PENDING de un pedido activo, con su pedido", async () => {
    const rows = await listPendingModeration();
    const mine = rows.find((r) => r.designId === designId);
    expect(mine).toBeTruthy();
    expect(mine!.sources.map((x) => x.numero)).toContain(orderNumber);
    expect(mine!.sources.find((x) => x.numero === orderNumber)!.tipo).toBe("pedido");
  });

  it("approveDesign marca APPROVED y el gate deja de bloquear", async () => {
    await approveDesign(designId, ADMIN_ID);
    const d = await prisma.design.findUnique({
      where: { id: designId },
      select: { moderationStatus: true, moderatedById: true, moderatedAt: true },
    });
    expect(d!.moderationStatus).toBe("APPROVED");
    expect(d!.moderatedById).toBe(ADMIN_ID);
    expect(d!.moderatedAt).not.toBeNull();
    expect(await orderHasUnmoderatedDesigns(orderId)).toBe(false);
  });

  it("rejectDesign marca REJECTED, guarda el motivo y devuelve los pedidos afectados", async () => {
    const result = await rejectDesign(design2Id, ADMIN_ID, "Contenido no apto");
    expect(result.sources.map((x) => x.numero)).toContain(`${RUN}-ORD2`);
    const d = await prisma.design.findUnique({
      where: { id: design2Id },
      select: { moderationStatus: true, moderationReason: true },
    });
    expect(d!.moderationStatus).toBe("REJECTED");
    expect(d!.moderationReason).toBe("Contenido no apto");
    // REJECTED tampoco es APPROVED → el pedido sigue bloqueado para envío.
    expect(await orderHasUnmoderatedDesigns(order2Id)).toBe(true);
  });

  it("un pedido sin diseños personalizados no bloquea el envío", async () => {
    const plain = await makeOrder("PLAIN", null);
    expect(await orderHasUnmoderatedDesigns(plain.id)).toBe(false);
  });
});

// A4-01 (cert 2026-09-26): un diseño COMPARTIDO por link público (/d/<token>) es
// contenido público y debe pasar por moderación aunque no tenga pedido ni
// cotización; rechazarlo revoca el link.
describe("diseños compartidos por link público (A4-01)", () => {
  async function makeSharedDesign(): Promise<{ id: string; token: string }> {
    const id = (
      await prisma.design.create({
        data: {
          customerId,
          productId,
          status: "READY",
          canvasData: {},
          previewUrl: "https://cdn.lucams.test/shared.png",
        },
        select: { id: true },
      })
    ).id;
    const token = (await ensureDesignShareToken(id, customerId))!;
    return { id, token };
  }

  it("un diseño SOLO-compartido (sin pedido/cotización) aparece en la cola, shared=true y sin sources", async () => {
    const { id } = await makeSharedDesign();
    const rows = await listPendingModeration();
    const mine = rows.find((r) => r.designId === id);
    expect(mine).toBeTruthy();
    expect(mine!.shared).toBe(true);
    expect(mine!.sources).toEqual([]);
  });

  it("compartir → rechazar: /d/<token> deja de resolver y el shareTokenHash queda revocado", async () => {
    const { id, token } = await makeSharedDesign();
    expect(await getSharedDesign(token)).not.toBeNull();

    await rejectDesign(id, ADMIN_ID, "Contenido no apto");

    const row = await prisma.design.findUnique({
      where: { id },
      select: { moderationStatus: true, shareTokenHash: true },
    });
    expect(row!.moderationStatus).toBe("REJECTED");
    // Revocación real en origen: el link muere aunque el token circule por ahí.
    expect(row!.shareTokenHash).toBeNull();
    expect(await getSharedDesign(token)).toBeNull();
    // Y sale de la cola (ya no está PENDING).
    const rows = await listPendingModeration();
    expect(rows.some((r) => r.designId === id)).toBe(false);
  });

  it("aprobar un diseño compartido NO toca el link (sigue resolviendo) y sale de la cola", async () => {
    // Decisión de dominio: aprobar conserva el share. (El camino inverso no existe:
    // un diseño rechazado perdió el hash y re-aprobarlo NO restaura el link viejo —
    // el cliente re-comparte y genera token nuevo; ver rejectDesign en service.ts.)
    const { id, token } = await makeSharedDesign();
    await approveDesign(id, ADMIN_ID);
    expect(await getSharedDesign(token)).not.toBeNull();
    const rows = await listPendingModeration();
    expect(rows.some((r) => r.designId === id)).toBe(false);
  });
});
