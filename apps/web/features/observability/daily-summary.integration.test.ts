/*
 * Integración — getDailySummary + sendDailySummary contra la DB de dev.
 *
 * getDailySummary cuenta GLOBALMENTE (no hay scoping por RUN), así que asertamos
 * LOWER BOUNDS tras crear fixtures RUN-prefijados (robusto ante datos concurrentes de
 * otros tests). sendDailySummary se prueba con el email mockeado + la idempotencia de
 * 12h. Política 2026-08-05 (centro de notificaciones): el resumen ya NO sale por
 * email — se publica como notificación in-app (dedupKey "daily_summary").
 * afterAll borra las órdenes creadas + el AlertState + la notificación.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// next/cache passthrough (getSettingValue usa unstable_cache).
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      fn(...a),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

const emailsSent: Array<{ to: string; subject: string }> = [];
// El módulo ya NO importa @/lib/resend (política 2026-08-05: cero email diario);
// el mock queda como guardián: si alguien re-introduce un sendEmail, la aserción
// "emailsSent vacío" lo delata.
vi.mock("@/lib/resend", () => ({
  sendEmail: async (args: { to: string; subject: string }) => {
    emailsSent.push({ to: args.to, subject: args.subject });
    return { sent: true };
  },
}));

vi.mock("@/lib/cms", () => ({
  getSettingValue: async (_key: string, fallback: string) => fallback,
}));

import { prisma } from "@/lib/db";
import { getDailySummary, sendDailySummary } from "./daily-summary";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `dsum${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const createdOrderIds: string[] = [];

async function makeOrder(tag: string, status: string, total: number): Promise<string> {
  const o = await prisma.order.create({
    data: {
      number: `${RUN}-${tag}`,
      email: `${RUN}@lucams.test`,
      phone: "3001112233",
      shippingAddress: { fullName: "T", city: "Bogotá", department: "Bogotá D.C." },
      subtotal: total - 10000,
      shipping: 10000,
      total,
      paymentMethod: "WOMPI",
      status: status as never,
    },
    select: { id: true },
  });
  createdOrderIds.push(o.id);
  return o.id;
}

describe.skipIf(!hasDb)("daily-summary — integración DB", () => {
  beforeAll(async () => {
    await makeOrder("paid1", "PAID", 55000);
    await makeOrder("paid2", "PAID", 45000);
    await makeOrder("pend1", "PENDING_PAYMENT", 30000);
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
    // La clave del resumen es singleton (no RUN-scoped). En dev el cron real no está
    // agendado, así que borrarla es seguro y evita contaminar el estado.
    await prisma.alertState.deleteMany({ where: { key: "daily_summary" } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { dedupKey: "daily_summary" } }).catch(() => {});
  });

  it("getDailySummary refleja las órdenes creadas (lower bounds) y tiene forma válida", async () => {
    const s = await getDailySummary();
    // Creamos 3 no-DRAFT (2 PAID + 1 PENDING_PAYMENT) con total 55k+45k pagados.
    expect(s.ordersLast24h).toBeGreaterThanOrEqual(3);
    expect(s.paidOrdersLast24h).toBeGreaterThanOrEqual(2);
    expect(s.revenueLast24hCop).toBeGreaterThanOrEqual(100000); // 55000 + 45000
    expect(s.pendingPayment).toBeGreaterThanOrEqual(1);
    expect(s.toShip).toBeGreaterThanOrEqual(2); // 2 PAID ∈ [PAID, FULFILLING]
    // Forma: todos los campos numéricos >= 0.
    for (const k of [
      "lowStock",
      "pendingReviews",
      "abandonedCarts24h",
      "recoveredCarts24h",
      "errors24h",
      "needsReconciliation",
      "expiredPendingWompi24h",
    ] as const) {
      expect(typeof s[k]).toBe("number");
      expect(s[k]).toBeGreaterThanOrEqual(0);
    }
  }, 30000);

  it("sendDailySummary publica notificación (SIN email) y luego DEDUP (no re-publica dentro de 12h)", async () => {
    await prisma.alertState.deleteMany({ where: { key: "daily_summary" } });
    await prisma.notification.deleteMany({ where: { dedupKey: "daily_summary" } });
    emailsSent.length = 0;
    const now = new Date();

    const first = await sendDailySummary(now);
    expect(first.sent).toBe(true);
    expect(emailsSent).toHaveLength(0); // política 2026-08-05: el resumen ya NO va por email

    // La notificación in-app es el registro duradero del resumen.
    const n = await prisma.notification.findFirst({ where: { dedupKey: "daily_summary" } });
    expect(n).toBeTruthy();
    expect(n!.type).toBe("SYSTEM");
    expect(n!.severity).toBe("info");
    expect(n!.title).toContain("Resumen Lucams");
    expect(n!.actionUrl).toBe("/admin/metricas");
    expect(n!.detail).toContain("Pedidos nuevos");

    // 2da llamada inmediata (mismo now) → dentro de la ventana de 12h → skip, sin duplicar fila.
    const second = await sendDailySummary(now);
    expect(second.sent).toBe(false);
    expect(second.skipped).toBe("already_sent");
    expect(emailsSent).toHaveLength(0);
    expect(await prisma.notification.count({ where: { dedupKey: "daily_summary" } })).toBe(1);
  }, 30000);

  it("lowStock cuenta solo variantes PHYSICAL_STOCK y omite MADE_TO_ORDER en 0", async () => {
    const cat = await prisma.category.create({
      data: { slug: `${RUN}-cat`, name: `Cat ${RUN}`, isActive: true },
      select: { id: true },
    });
    try {
      const madeProd = await prisma.product.create({
        data: {
          slug: `${RUN}-mto`,
          name: `MTO ${RUN}`,
          description: "Producto bajo pedido",
          basePrice: 10_000,
          sku: `${RUN}-MTO`.toUpperCase(),
          categoryId: cat.id,
          isActive: true,
          fulfillmentMode: "MADE_TO_ORDER",
          variants: {
            create: {
              name: "Única",
              sku: `${RUN}-MTO-V`.toUpperCase(),
              stock: 0,
              isActive: true,
              attributes: {},
            },
          },
        },
        select: { id: true },
      });
      const baselineWithMto = (await getDailySummary()).lowStock;

      const physProd = await prisma.product.create({
        data: {
          slug: `${RUN}-phys`,
          name: `Físico ${RUN}`,
          description: "Producto físico con stock bajo",
          basePrice: 10_000,
          sku: `${RUN}-PHYS`.toUpperCase(),
          categoryId: cat.id,
          isActive: true,
          fulfillmentMode: "PHYSICAL_STOCK",
          variants: {
            create: {
              name: "Única",
              sku: `${RUN}-PHYS-V`.toUpperCase(),
              stock: 2,
              isActive: true,
              attributes: {},
            },
          },
        },
        select: { id: true },
      });

      const afterPhysical = (await getDailySummary()).lowStock;
      expect(afterPhysical).toBeGreaterThanOrEqual(baselineWithMto + 1);

      await prisma.product.update({
        where: { id: madeProd.id },
        data: { isActive: false },
      });
      const afterDisablingMto = (await getDailySummary()).lowStock;
      expect(afterDisablingMto).toBe(afterPhysical);

      await prisma.productVariant.deleteMany({
        where: { productId: { in: [madeProd.id, physProd.id] } },
      });
      await prisma.product.deleteMany({
        where: { id: { in: [madeProd.id, physProd.id] } },
      });
    } finally {
      await prisma.productVariant
        .deleteMany({ where: { product: { categoryId: cat.id } } })
        .catch(() => {});
      await prisma.product.deleteMany({ where: { categoryId: cat.id } }).catch(() => {});
      await prisma.category.deleteMany({ where: { id: cat.id } }).catch(() => {});
    }
  }, 30000);
});
