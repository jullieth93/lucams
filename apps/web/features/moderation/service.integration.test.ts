/*
 * Integración — Moderación de contenido (ADR-062 P0-2). Cubre: el gate del envío
 * (orderHasUnmoderatedDesigns), la cola (listPendingModeration), aprobar y rechazar.
 * Solo Prisma (Postgres) → corre en CI. Comparte la Supabase de dev; fixtures RUN-prefijados.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
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
    expect(mine!.orders.map((o) => o.number)).toContain(orderNumber);
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
    expect(result.orders.map((o) => o.number)).toContain(`${RUN}-ORD2`);
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
