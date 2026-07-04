/*
 * Integración DB — retracto (Bloque F3). Elegibilidad + creación de solicitud
 * contra órdenes reales. Aislamiento por RUN + cleanup SCOPED.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Los emails de retracto son best-effort; los mockeamos para no pegar a Resend.
vi.mock("./emails", () => ({
  sendRetractApproved: async () => {},
  sendRetractRefunded: async () => {},
}));

import { prisma } from "@/lib/db";
import {
  getRetractableItems,
  createRetractRequest,
  approveRetract,
  markRetractReceived,
  refundRetract,
  rejectRetract,
  RetractError,
  RetractTransitionError,
} from "./service";

const hasDb = !!process.env.DATABASE_URL;
const RUN = `rtr${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();

let variantId = "";
let categoryId = "";
let productId = "";

async function makeDeliveredOrder(opts: {
  tag: string;
  deliveredAt: Date | null;
  status?: string;
  items: Array<{ personalized: boolean }>;
}) {
  const order = await prisma.order.create({
    data: {
      number: `RTR-${RUN}-${opts.tag}`.toUpperCase(),
      email: `${RUN}-${opts.tag}@lucams.test`,
      phone: "+573001112233",
      shippingAddress: { city: "Bogotá" },
      subtotal: 20_000 * opts.items.length,
      shipping: 0,
      total: 20_000 * opts.items.length,
      currency: "COP",
      paymentMethod: "WOMPI",
      status: (opts.status ?? "DELIVERED") as never,
      deliveredAt: opts.deliveredAt,
      items: {
        create: opts.items.map((it) => ({
          variantId,
          qty: 1,
          unitPrice: 20_000,
          customDesign: it.personalized ? { layers: ["foto"] } : undefined,
        })),
      },
    },
    select: { id: true, items: { select: { id: true }, orderBy: { createdAt: "asc" } } },
  });
  return order;
}

describe.skipIf(!hasDb)("retract/service — integración DB", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    const category = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        slug: `${RUN}-prod`,
        name: `Imán ${RUN}`,
        description: "fixture retracto",
        basePrice: 20_000,
        sku: `${RUN}-PROD`.toUpperCase(),
        categoryId,
        variants: {
          create: [{ name: "Default", sku: `${RUN}-V`.toUpperCase(), price: 20_000, stock: 100, attributes: {} }],
        },
      },
      select: { id: true, variants: { select: { id: true } } },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;
  });

  afterAll(async () => {
    const safe = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch {
        /* best-effort */
      }
    };
    await safe(() =>
      prisma.retractRequest.deleteMany({
        where: { orderItem: { order: { number: { startsWith: `RTR-${RUN}`.toUpperCase() } } } },
      }),
    );
    const orders = await prisma.order.findMany({
      where: { number: { startsWith: `RTR-${RUN}`.toUpperCase() } },
      select: { id: true },
    });
    const ids = orders.map((o) => o.id);
    await safe(() => prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } }));
    await safe(() => prisma.order.deleteMany({ where: { id: { in: ids } } }));
    await safe(() => prisma.productVariant.deleteMany({ where: { productId } }));
    await safe(() => prisma.product.deleteMany({ where: { id: productId } }));
    await safe(() => prisma.category.deleteMany({ where: { id: categoryId } }));
    await prisma.$disconnect();
  });

  it("getRetractableItems: estándar elegible, personalizado exceptuado", async () => {
    const order = await makeDeliveredOrder({
      tag: "mix",
      deliveredAt: new Date(),
      items: [{ personalized: false }, { personalized: true }],
    });
    const items = await getRetractableItems(order.id);
    expect(items).toHaveLength(2);
    const standard = items.find((i) => i.orderItemId === order.items[0]!.id);
    const custom = items.find((i) => i.orderItemId === order.items[1]!.id);
    expect(standard?.eligible).toBe(true);
    expect(custom?.eligible).toBe(false);
    expect(custom?.reason).toBe("PERSONALIZED");
  });

  it("fuera de la ventana (entrega hace mucho) → OUT_OF_WINDOW", async () => {
    const order = await makeDeliveredOrder({
      tag: "old",
      deliveredAt: new Date("2020-01-01"),
      items: [{ personalized: false }],
    });
    const items = await getRetractableItems(order.id);
    expect(items[0]?.eligible).toBe(false);
    expect(items[0]?.reason).toBe("OUT_OF_WINDOW");
  });

  it("orden no entregada → NOT_DELIVERED", async () => {
    const order = await makeDeliveredOrder({
      tag: "pend",
      status: "PAID",
      deliveredAt: null,
      items: [{ personalized: false }],
    });
    const items = await getRetractableItems(order.id);
    expect(items[0]?.reason).toBe("NOT_DELIVERED");
  });

  it("createRetractRequest: crea PENDING con refundAmount = línea; 2da vez ALREADY_REQUESTED", async () => {
    const order = await makeDeliveredOrder({
      tag: "req",
      deliveredAt: new Date(),
      items: [{ personalized: false }],
    });
    const itemId = order.items[0]!.id;
    const res = await createRetractRequest(itemId, { customerId: null, reason: "no me gustó" });
    expect(res.refundAmount).toBe(20_000);
    const rr = await prisma.retractRequest.findUnique({ where: { orderItemId: itemId } });
    expect(rr?.status).toBe("PENDING");
    expect(rr?.reason).toBe("no me gustó");

    await expect(createRetractRequest(itemId, { customerId: null })).rejects.toThrow(RetractError);
  });

  it("createRetractRequest rechaza un item personalizado (PERSONALIZED)", async () => {
    const order = await makeDeliveredOrder({
      tag: "perso",
      deliveredAt: new Date(),
      items: [{ personalized: true }],
    });
    await expect(
      createRetractRequest(order.items[0]!.id, { customerId: null }),
    ).rejects.toMatchObject({ reason: "PERSONALIZED" });
  });

  it("ciclo admin: PENDING → APPROVED → RECEIVED → REFUNDED con auditoría", async () => {
    const order = await makeDeliveredOrder({
      tag: "life",
      deliveredAt: new Date(),
      items: [{ personalized: false }],
    });
    const { id } = await createRetractRequest(order.items[0]!.id, { customerId: null });

    await approveRetract(id, "admin-1");
    let rr = await prisma.retractRequest.findUnique({ where: { id } });
    expect(rr?.status).toBe("APPROVED");
    expect(rr?.approvedAt).not.toBeNull();
    expect(rr?.processedBy).toBe("admin-1");

    await markRetractReceived(id, "admin-1");
    rr = await prisma.retractRequest.findUnique({ where: { id } });
    expect(rr?.status).toBe("RECEIVED");
    expect(rr?.receivedAt).not.toBeNull();

    await refundRetract(id, "admin-2", "BANK_TRANSFER");
    rr = await prisma.retractRequest.findUnique({ where: { id } });
    expect(rr?.status).toBe("REFUNDED");
    expect(rr?.refundedAt).not.toBeNull();
    expect(rr?.refundMethod).toBe("BANK_TRANSFER");
    expect(rr?.processedBy).toBe("admin-2");
  });

  it("transición ilegal (PENDING → REFUNDED directo) lanza RetractTransitionError", async () => {
    const order = await makeDeliveredOrder({
      tag: "illegal",
      deliveredAt: new Date(),
      items: [{ personalized: false }],
    });
    const { id } = await createRetractRequest(order.items[0]!.id, { customerId: null });
    await expect(refundRetract(id, "admin-1", "WOMPI_VOID")).rejects.toThrow(RetractTransitionError);
  });

  it("IDOR: un cliente logueado no puede retractar un pedido de invitado (customerId null)", async () => {
    const order = await makeDeliveredOrder({
      tag: "idor",
      deliveredAt: new Date(),
      items: [{ personalized: false }],
    });
    // El pedido no tiene customerId (invitado) → ningún cliente logueado es dueño.
    await expect(
      createRetractRequest(order.items[0]!.id, { customerId: "cust-intruso" }),
    ).rejects.toMatchObject({ reason: "FORBIDDEN" });
    const items = await getRetractableItems(order.id, { customerId: "cust-intruso" });
    expect(items).toHaveLength(0);
  });

  it("rechazo: PENDING → REJECTED con motivo", async () => {
    const order = await makeDeliveredOrder({
      tag: "reject",
      deliveredAt: new Date(),
      items: [{ personalized: false }],
    });
    const { id } = await createRetractRequest(order.items[0]!.id, { customerId: null });
    await rejectRetract(id, "admin-1", "Fuera de política");
    const rr = await prisma.retractRequest.findUnique({ where: { id } });
    expect(rr?.status).toBe("REJECTED");
    expect(rr?.rejectionNote).toBe("Fuera de política");
  });
});
