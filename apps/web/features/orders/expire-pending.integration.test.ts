/*
 * Tests de integración de expireStalePendingOrders (N-12) contra la DB real.
 *
 * FOCO:
 *   - Cancela SOLO órdenes paymentMethod=WOMPI + PENDING_PAYMENT + createdAt
 *     más viejo que PENDING_PAYMENT_EXPIRY_HOURS (24h, contrato compartido en
 *     features/orders/constants.ts).
 *   - NO toca: frescas, COD, ya pagadas, soft-deleted, ni las marcadas
 *     needsReconciliation (pueden tener dinero CAPTURADO → decisión humana).
 *   - needsRevert es no-op: expirar una orden con items NO crea InventoryLog
 *     ni mueve stock (ni stock ni cupón se consumen antes de PAID).
 *   - Idempotente: re-correr no toca las ya canceladas.
 *   - Marca de auditoría: updatedBy = "cron:expire-pending-orders".
 *
 * FOCO 5.4 (2026-09-13) — verificación Wompi antes de cancelar una orden CON
 * wompiTransactionId (mismo criterio que el fallback /checkout/gracias):
 *   - APPROVED (+monto OK) → NO cancela: corre la saga processPaidOrder como
 *     auto-sanación y la cuenta en `healed` (webhook perdido = venta real).
 *   - APPROVED con monto desfasado → ni cancela ni sana: needsReconciliation.
 *   - PENDING/DECLINED (no aprobado) → cancela, con veredicto en el log.
 *   - API caída / tx inexistente → cancela como siempre.
 *   - Sin llaves WOMPI_* (getWompiConfig lanza) → NO verifica y cancela.
 *   - Sin wompiTransactionId → cancela directo SIN llamar a Wompi.
 * La capa de Wompi (lib/wompi) y la saga se mockean como hacen los tests del
 * webhook (route.integration.test.ts): la DB es real, el tercero no.
 *
 * Aislamiento: todo fixture RUN-prefijado, limpieza SCOPED en afterAll.
 * Requiere DATABASE_URL (skipIf si falta).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// next/cache → passthrough (transitionOrder invalida listados vía revalidateTag — N-11;
// unstable_cache pasa tal cual porque lib/catalog lo usa a nivel módulo).
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

// 5.4 — lib/wompi y la saga mockeados (patrón del test del webhook): el lookup
// getTransaction y la auto-sanación processPaidOrder se controlan por test; la
// DB y transitionOrder son reales. Las órdenes sin txId nunca tocan estos mocks.
const wompiMocks = vi.hoisted(() => ({
  getTransaction: vi.fn(),
  getWompiConfig: vi.fn(),
  processPaidOrder: vi.fn(),
}));

vi.mock("@/lib/wompi", () => ({
  getTransaction: wompiMocks.getTransaction,
  getWompiConfig: wompiMocks.getWompiConfig,
}));

vi.mock("@/features/orders/saga", () => ({
  processPaidOrder: wompiMocks.processPaidOrder,
}));

import { prisma } from "@/lib/db";
import { expireStalePendingOrders, EXPIRE_PENDING_ACTOR } from "./expire-pending";
import { PENDING_PAYMENT_EXPIRY_HOURS } from "./constants";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `exp${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const T = 30_000;

const HOUR_MS = 60 * 60 * 1000;
const STALE_AGE = (PENDING_PAYMENT_EXPIRY_HOURS + 1) * HOUR_MS; // 1h pasado el corte
const FRESH_AGE = 2 * HOUR_MS;

const createdOrderIds: string[] = [];
let categoryId = "";
let productId = "";
let variantId = "";

async function makeOrder(opts: {
  tag: string;
  ageMs: number;
  status?: string;
  paymentMethod?: "WOMPI" | "COD";
  needsReconciliation?: boolean;
  deletedAt?: Date;
  withItem?: boolean;
  wompiTransactionId?: string;
}): Promise<string> {
  const o = await prisma.order.create({
    data: {
      number: `${RUN}-${opts.tag}`,
      email: `${RUN}-${opts.tag}@lucams.test`,
      phone: "3001112233",
      shippingAddress: { fullName: "Test", city: "Bogotá", department: "Bogotá D.C." },
      subtotal: 45_000,
      shipping: 10_000,
      total: 55_000,
      paymentMethod: opts.paymentMethod ?? "WOMPI",
      status: (opts.status ?? "PENDING_PAYMENT") as never,
      createdAt: new Date(Date.now() - opts.ageMs),
      needsReconciliation: opts.needsReconciliation ?? false,
      deletedAt: opts.deletedAt ?? null,
      wompiTransactionId: opts.wompiTransactionId ?? null,
      ...(opts.withItem ? { items: { create: [{ variantId, qty: 2, unitPrice: 22_500 }] } } : {}),
    },
    select: { id: true },
  });
  createdOrderIds.push(o.id);
  return o.id;
}

async function orderState(id: string) {
  return prisma.order.findUnique({
    where: { id },
    select: { status: true, updatedBy: true },
  });
}

describe.skipIf(!hasDb)(
  "orders/expire-pending — expiración de PENDING_PAYMENT (N-12)",
  { timeout: T },
  () => {
    beforeAll(async () => {
      const category = await prisma.category.create({
        data: { slug: `${RUN}-cat`, name: `Cat ${RUN}` },
      });
      categoryId = category.id;
      const product = await prisma.product.create({
        data: {
          slug: `${RUN}-prod`,
          name: `Prod ${RUN}`,
          description: "fixture expire-pending",
          basePrice: 22_500,
          sku: `${RUN}-PROD`.toUpperCase(),
          categoryId,
          variants: {
            create: [
              {
                name: "Única",
                sku: `${RUN}-V`.toUpperCase(),
                price: 22_500,
                stock: 37,
                attributes: {},
              },
            ],
          },
        },
        select: { id: true, variants: { select: { id: true } } },
      });
      productId = product.id;
      variantId = product.variants[0].id;
    }, T);

    afterAll(async () => {
      const safe = async (fn: () => Promise<unknown>) => {
        try {
          await fn();
        } catch {
          /* blip del pooler — fixture RUN-scoped */
        }
      };
      await safe(() =>
        prisma.inventoryLog.deleteMany({ where: { orderId: { in: createdOrderIds } } }),
      );
      await safe(() =>
        prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } }),
      );
      await safe(() => prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }));
      await safe(() => prisma.productVariant.deleteMany({ where: { productId } }));
      await safe(() => prisma.product.deleteMany({ where: { id: productId } }));
      await safe(() => prisma.category.deleteMany({ where: { id: categoryId } }));
    }, T);

    it("expira la WOMPI PENDING_PAYMENT vieja → CANCELLED con marca de auditoría", async () => {
      const id = await makeOrder({ tag: "stale", ageMs: STALE_AGE });

      const res = await expireStalePendingOrders();

      expect(res.expired).toBeGreaterThanOrEqual(1);
      const o = await orderState(id);
      expect(o?.status).toBe("CANCELLED");
      expect(o?.updatedBy).toBe(EXPIRE_PENDING_ACTOR);
    });

    it("NO toca la WOMPI PENDING_PAYMENT fresca (dentro de la ventana de 24h)", async () => {
      const id = await makeOrder({ tag: "fresh", ageMs: FRESH_AGE });

      await expireStalePendingOrders();

      expect((await orderState(id))?.status).toBe("PENDING_PAYMENT");
    });

    it("NO toca una COD PENDING_PAYMENT vieja (el contraentrega no expira por pasarela)", async () => {
      const id = await makeOrder({ tag: "cod", ageMs: STALE_AGE, paymentMethod: "COD" });

      await expireStalePendingOrders();

      expect((await orderState(id))?.status).toBe("PENDING_PAYMENT");
    });

    it("NO toca una WOMPI ya PAID aunque sea vieja", async () => {
      const id = await makeOrder({ tag: "paid", ageMs: STALE_AGE, status: "PAID" });

      await expireStalePendingOrders();

      expect((await orderState(id))?.status).toBe("PAID");
    });

    it("NO toca una WOMPI PENDING vieja con needsReconciliation (puede tener dinero capturado)", async () => {
      const id = await makeOrder({ tag: "recon", ageMs: STALE_AGE, needsReconciliation: true });

      await expireStalePendingOrders();

      expect((await orderState(id))?.status).toBe("PENDING_PAYMENT");
    });

    it("NO toca una orden soft-deleted", async () => {
      const id = await makeOrder({ tag: "soft", ageMs: STALE_AGE, deletedAt: new Date() });

      await expireStalePendingOrders();

      expect((await orderState(id))?.status).toBe("PENDING_PAYMENT");
    });

    it("needsRevert es no-op: expirar una orden CON items no crea InventoryLog ni mueve stock", async () => {
      const id = await makeOrder({ tag: "items", ageMs: STALE_AGE, withItem: true });
      const stockBefore = (await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: { stock: true },
      }))!.stock;

      await expireStalePendingOrders();

      expect((await orderState(id))?.status).toBe("CANCELLED");
      // Ni un solo movimiento de inventario para esta orden (nunca hubo decremento previo).
      expect(await prisma.inventoryLog.count({ where: { orderId: id } })).toBe(0);
      const stockAfter = (await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: { stock: true },
      }))!.stock;
      expect(stockAfter).toBe(stockBefore);
    });

    it("idempotente: la segunda corrida no encuentra nada que expirar (scanned/expired 0 sobre lo propio)", async () => {
      const id = await makeOrder({ tag: "twice", ageMs: STALE_AGE });

      const first = await expireStalePendingOrders();
      expect(first.expired).toBeGreaterThanOrEqual(1);
      expect((await orderState(id))?.status).toBe("CANCELLED");

      const second = await expireStalePendingOrders();
      // Ya cancelada → fuera del WHERE; la corrida no la vuelve a tocar.
      const still = await orderState(id);
      expect(still?.status).toBe("CANCELLED");
      // Idempotencia REAL medida sobre los fixtures propios: ninguno quedó
      // re-expirable tras la primera corrida (no se re-expira nada propio).
      // (No se aserta second.expired === 0 global: la DB es compartida y otra
      // suite paralela pudo crear sus propios fixtures stale entre corridas.)
      const remainingMine = await prisma.order.count({
        where: {
          id: { in: createdOrderIds },
          status: "PENDING_PAYMENT",
          paymentMethod: "WOMPI",
          needsReconciliation: false,
          deletedAt: null,
          createdAt: { lt: new Date(Date.now() - PENDING_PAYMENT_EXPIRY_HOURS * HOUR_MS) },
        },
      });
      expect(remainingMine).toBe(0);
      expect(second.scanned).toBeGreaterThanOrEqual(0); // corrida válida, sin efecto sobre lo propio
    });

    // ─────────────────────────────────────────────────────────────────────
    // 5.4 — Verificación Wompi antes de cancelar órdenes CON wompiTransactionId.
    // La saga stub no transiciona la orden (registra la llamada), así que una
    // orden "sanada" queda PENDING_PAYMENT: el afterEach la barre a CANCELLED
    // para que corridas de tests posteriores no la vuelvan a escanear (las
    // corridas ven TODA la DB compartida).
    // ─────────────────────────────────────────────────────────────────────
    describe("5.4 — verificación Wompi pre-cancelación", () => {
      const TX = `${RUN}-tx`;

      function makeTx(overrides: Record<string, unknown> = {}) {
        return {
          id: TX,
          reference: `${RUN}-ref`,
          status: "PENDING",
          amount_in_cents: 55_000, // === total del fixture (makeOrder)
          currency: "COP",
          customer_email: null,
          payment_method_type: null,
          created_at: new Date().toISOString(),
          finalized_at: null,
          status_message: null,
          ...overrides,
        };
      }

      beforeEach(() => {
        vi.clearAllMocks();
        // Default: Wompi CONFIGURADO (la verificación está habilitada).
        wompiMocks.getWompiConfig.mockReturnValue({
          env: "sandbox",
          apiUrl: "https://sandbox.wompi.co/v1",
        });
        wompiMocks.processPaidOrder.mockResolvedValue({
          status: "ok",
          trackingNumber: "TRACK-X",
        });
      });

      afterEach(async () => {
        // Higiene de fixtures: toda orden propia que quedó PENDING_PAYMENT (la
        // saga está stubbeada y no transiciona) se barre a CANCELLED para que
        // la corrida del siguiente test no la re-escanee ni ensucie los mocks.
        await prisma.order.updateMany({
          where: { id: { in: createdOrderIds }, status: "PENDING_PAYMENT" },
          data: { status: "CANCELLED" },
        });
      });

      it("APPROVED + monto OK → NO cancela: corre la saga y la cuenta en `healed`", async () => {
        const id = await makeOrder({
          tag: "w54-approved",
          ageMs: STALE_AGE,
          wompiTransactionId: TX,
        });
        wompiMocks.getTransaction.mockResolvedValue(makeTx({ status: "APPROVED" }));

        const res = await expireStalePendingOrders();

        expect(res.healed).toBeGreaterThanOrEqual(1);
        expect(wompiMocks.getTransaction).toHaveBeenCalledWith(TX);
        expect(wompiMocks.processPaidOrder).toHaveBeenCalledWith({
          orderId: id,
          wompiTransactionId: TX,
        });
        // No se canceló: la saga (stub) no cambia el estado, queda PENDING_PAYMENT.
        expect((await orderState(id))?.status).toBe("PENDING_PAYMENT");
      });

      it("APPROVED con monto desfasado → ni cancela ni sana: needsReconciliation + skipped", async () => {
        const id = await makeOrder({
          tag: "w54-mismatch",
          ageMs: STALE_AGE,
          wompiTransactionId: TX,
        });
        wompiMocks.getTransaction.mockResolvedValue(
          makeTx({ status: "APPROVED", amount_in_cents: 55_001 }),
        );

        const res = await expireStalePendingOrders();

        expect(wompiMocks.processPaidOrder).not.toHaveBeenCalled();
        const o = await prisma.order.findUnique({
          where: { id },
          select: { status: true, needsReconciliation: true },
        });
        expect(o?.status).toBe("PENDING_PAYMENT"); // NO cancelada
        expect(o?.needsReconciliation).toBe(true); // visible para un humano
        expect(res.healed).toBe(0);
        expect(res.skipped).toBeGreaterThanOrEqual(1);
      });

      it.each(["PENDING", "DECLINED", "ERROR", "VOIDED"])(
        "tx %s → cancela como siempre (verificó contra Wompi)",
        async (status) => {
          const id = await makeOrder({
            tag: `w54-${status.toLowerCase()}`,
            ageMs: STALE_AGE,
            wompiTransactionId: TX,
          });
          wompiMocks.getTransaction.mockResolvedValue(makeTx({ status }));

          const res = await expireStalePendingOrders();

          expect(wompiMocks.getTransaction).toHaveBeenCalledWith(TX);
          expect(wompiMocks.processPaidOrder).not.toHaveBeenCalled();
          expect((await orderState(id))?.status).toBe("CANCELLED");
          expect(res.expired).toBeGreaterThanOrEqual(1);
          expect(res.healed).toBe(0);
        },
      );

      it("API de Wompi caída (lookup revienta) → cancela como siempre", async () => {
        const id = await makeOrder({
          tag: "w54-apidown",
          ageMs: STALE_AGE,
          wompiTransactionId: TX,
        });
        wompiMocks.getTransaction.mockRejectedValue(new Error("Wompi getTransaction HTTP 503"));

        await expireStalePendingOrders();

        expect(wompiMocks.processPaidOrder).not.toHaveBeenCalled();
        expect((await orderState(id))?.status).toBe("CANCELLED");
      });

      it("sin llaves WOMPI_* (getWompiConfig lanza) → NO verifica y cancela como siempre", async () => {
        const id = await makeOrder({
          tag: "w54-noconfig",
          ageMs: STALE_AGE,
          wompiTransactionId: TX,
        });
        wompiMocks.getWompiConfig.mockImplementation(() => {
          throw new Error("Wompi: faltan WOMPI_* en env");
        });

        await expireStalePendingOrders();

        expect(wompiMocks.getTransaction).not.toHaveBeenCalled();
        expect((await orderState(id))?.status).toBe("CANCELLED");
      });

      it("orden SIN wompiTransactionId → cancela directo SIN llamar a Wompi", async () => {
        const id = await makeOrder({ tag: "w54-notxid", ageMs: STALE_AGE });

        await expireStalePendingOrders();

        expect((await orderState(id))?.status).toBe("CANCELLED");
        // El afterEach del test anterior barrió los fixtures con txId: en esta
        // corrida no hay ninguna orden propia con txId → cero llamadas a Wompi.
        expect(wompiMocks.getTransaction).not.toHaveBeenCalled();
        expect(wompiMocks.processPaidOrder).not.toHaveBeenCalled();
      });
    });
  },
);
