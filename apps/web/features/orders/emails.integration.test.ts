/*
 * Tests de integración de los senders N-22a/N-22b de features/orders/emails.ts
 * contra la DB real (sin Resend: sin RESEND_API_KEY el envío queda "skipped"
 * — lo que se prueba es la LÓGICA de persistencia, no la entrega).
 *
 * N-22a — sendOrderPaymentDeclined (webhook Wompi DECLINED/ERROR, orden viva):
 *   - Claim atómico anti-spam sobre Order.paymentFailedNotifiedAt: 1ª vez
 *     marca, 2ª dentro del cooldown NO re-marca, tras el cooldown re-marca.
 *   - Guardas: solo PENDING_PAYMENT + WOMPI (ni PAID, ni COD, ni inexistente).
 *
 * N-22b — notifyOrderReturned (webhook Aveonline RETURNED/EXCEPTION):
 *   - Crea la notificación in-app con la acción esperada + dedupKey por orden;
 *     un segundo evento ACTUALIZA la misma (anti-ruido, no duplica).
 *
 * Aislamiento: todo RUN-prefijado / ids trackeados, limpieza SCOPED.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  sendOrderPaymentDeclined,
  notifyOrderReturned,
  notifyOrderShippingException,
} from "./emails";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `eml${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const T = 30_000;

const createdOrderIds: string[] = [];

// Los senders reales pegarían a Resend (hay API key en .env.local): la suprimimos
// para que el test sea offline de email — lo que se prueba es la persistencia
// (claim anti-spam, dedup de notificaciones), no la entrega. El worker de vitest
// es un proceso por archivo → mutar process.env acá no afecta otras suites.
let savedResendKey: string | undefined;

function uniq(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

async function makeOrder(opts: {
  status?: string;
  paymentMethod?: "WOMPI" | "COD";
  paymentFailedNotifiedAt?: Date | null;
}): Promise<string> {
  const tag = uniq();
  const o = await prisma.order.create({
    data: {
      number: `${RUN}-${tag}`,
      email: `${RUN}-${tag}@lucams.test`,
      phone: "3001112233",
      shippingAddress: { fullName: "Test Cliente", city: "Bogotá", department: "Bogotá D.C." },
      subtotal: 45_000,
      shipping: 10_000,
      total: 55_000,
      paymentMethod: opts.paymentMethod ?? "WOMPI",
      status: (opts.status ?? "PENDING_PAYMENT") as never,
      paymentFailedNotifiedAt: opts.paymentFailedNotifiedAt ?? null,
    },
    select: { id: true },
  });
  createdOrderIds.push(o.id);
  return o.id;
}

const notifiedAtOf = async (id: string) =>
  (await prisma.order.findUnique({ where: { id }, select: { paymentFailedNotifiedAt: true } }))
    ?.paymentFailedNotifiedAt ?? null;

describe.skipIf(!hasDb)(
  "orders/emails — senders N-22a/N-22b (integración DB)",
  { timeout: T },
  () => {
    beforeAll(() => {
      savedResendKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;
    });

    afterAll(async () => {
      if (savedResendKey !== undefined) process.env.RESEND_API_KEY = savedResendKey;
      const safe = async (fn: () => Promise<unknown>) => {
        try {
          await fn();
        } catch {
          /* blip del pooler — fixture RUN-scoped */
        }
      };
      await safe(() =>
        prisma.notification.deleteMany({
          where: {
            dedupKey: {
              in: createdOrderIds.flatMap((id) => [
                `order-returned-${id}`,
                `order-exception-${id}`,
              ]),
            },
          },
        }),
      );
      await safe(() =>
        prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } }),
      );
      await safe(() => prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }));
    }, T);

    // ═══════════════════ N-22a — sendOrderPaymentDeclined ═══════════════════

    it("orden PENDING_PAYMENT WOMPI: 1ª vez marca paymentFailedNotifiedAt (claim)", async () => {
      const orderId = await makeOrder({});

      await sendOrderPaymentDeclined({
        orderId,
        txId: `${RUN}-tx1`,
        reason: "Fondos insuficientes",
      });

      expect(await notifiedAtOf(orderId)).not.toBeNull();
    });

    it("anti-spam: 2ª notificación dentro del cooldown NO re-marca (no se reenvía)", async () => {
      const orderId = await makeOrder({});

      await sendOrderPaymentDeclined({ orderId, txId: `${RUN}-tx2a`, reason: "rechazada" });
      const first = await notifiedAtOf(orderId);
      expect(first).not.toBeNull();

      // Otro DECLINED (otra transacción) a los pocos minutos → cooldown activo.
      await sendOrderPaymentDeclined({ orderId, txId: `${RUN}-tx2b`, reason: "rechazada" });
      expect(await notifiedAtOf(orderId)).toEqual(first);
    });

    it("tras el cooldown (marca vieja) sí vuelve a notificar (re-claim)", async () => {
      const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000);
      const orderId = await makeOrder({ paymentFailedNotifiedAt: sevenHoursAgo });

      await sendOrderPaymentDeclined({ orderId, txId: `${RUN}-tx3`, reason: "rechazada" });

      const after = await notifiedAtOf(orderId);
      expect(after).not.toBeNull();
      expect(after!.getTime()).toBeGreaterThan(sevenHoursAgo.getTime());
    });

    it("guardas: NO notifica si la orden ya avanzó (PAID), es COD, o no existe", async () => {
      const paidId = await makeOrder({ status: "PAID" });
      const codId = await makeOrder({ paymentMethod: "COD" });

      await sendOrderPaymentDeclined({ orderId: paidId, txId: `${RUN}-tx4a`, reason: "x" });
      await sendOrderPaymentDeclined({ orderId: codId, txId: `${RUN}-tx4b`, reason: "x" });
      // Inexistente: no lanza.
      await sendOrderPaymentDeclined({ orderId: `${RUN}-nope`, txId: `${RUN}-tx4c`, reason: "x" });

      expect(await notifiedAtOf(paidId)).toBeNull();
      expect(await notifiedAtOf(codId)).toBeNull();
    });

    // ═══════════════════ N-22b — notifyOrderReturned ═══════════════════

    it("crea la notificación admin con acción esperada explícita + dedup por orden (anti-ruido)", async () => {
      const orderId = await makeOrder({ status: "FULFILLING" });
      await prisma.order.update({
        where: { id: orderId },
        data: { trackingNumber: `${RUN}-TRK` },
      });

      await notifyOrderReturned({ orderId, carrierStatusRaw: "DEVUELTA" });

      const notif = await prisma.notification.findFirst({
        where: { dedupKey: `order-returned-${orderId}` },
      });
      expect(notif).not.toBeNull();
      expect(notif!.type).toBe("ORDER");
      expect(notif!.severity).toBe("warning");
      expect(notif!.actionUrl).toMatch(/^\/admin\/pedidos\//);
      expect(notif!.actionLabel).toBe("Revisar pedido");
      // La guía de acción esperada va explícita (reenvío / reembolso / reposición).
      expect(notif!.detail).toContain("Acción esperada");
      expect(notif!.detail).toMatch(/reenvío|reembolso|reposición/);

      // Segundo evento RETURNED de la misma orden → ACTUALIZA la misma notificación
      // (dedupKey), no duplica filas no leídas.
      await notifyOrderReturned({ orderId, carrierStatusRaw: "DEVUELTA (reintento)" });
      expect(
        await prisma.notification.count({ where: { dedupKey: `order-returned-${orderId}` } }),
      ).toBe(1);
      const updated = await prisma.notification.findFirst({
        where: { dedupKey: `order-returned-${orderId}` },
      });
      expect(updated!.detail).toContain("reintento");
    });

    it("no lanza si la orden no existe (best-effort)", async () => {
      await expect(
        notifyOrderReturned({ orderId: `${RUN}-nope`, carrierStatusRaw: "DEVUELTA" }),
      ).resolves.toBeUndefined();
    });

    it("notifyOrderShippingException: alerta solo al admin, enriquece con polling y no recrea tras marcar leída", async () => {
      const orderId = await makeOrder({ status: "SHIPPED" });
      await prisma.order.update({
        where: { id: orderId },
        data: { trackingNumber: `${RUN}-TRK-EXC`, shippingCarrier: "envia" },
      });

      // 1) Webhook llega sin timestamp ni descripción → crea 1 aviso interno de novedad (no devolución).
      await notifyOrderShippingException({ orderId, carrierStatusRaw: "NOVEDAD" });
      const first = await prisma.notification.findFirst({
        where: { dedupKey: `order-exception-${orderId}` },
      });
      expect(first).not.toBeNull();
      expect(first!.title).toContain("Novedad de entrega");
      expect(first!.title).not.toContain("devuelto");

      // 2) Polling llega con descripción + aclaración del mismo incidente → enriquece en sitio sin duplicar.
      const occurredAt = new Date("2026-11-18T23:31:00.000Z");
      await notifyOrderShippingException({
        orderId,
        carrierStatusRaw: "NOVEDAD",
        carrierDescription: "ENTREGA NO EFECTUADA POR INCONVENIENTES OPERATIVOS",
        carrierClarification: "18:30 : NOMBRE: 2986 ACLARACION:por tiempo",
        occurredAt,
      });
      expect(
        await prisma.notification.count({ where: { dedupKey: `order-exception-${orderId}` } }),
      ).toBe(1);
      const enriched = await prisma.notification.findUnique({ where: { id: first!.id } });
      expect(enriched!.detail).toContain("INCONVENIENTES OPERATIVOS");
      expect(enriched!.detail).toContain("por tiempo");

      // 3) Admin marca como leída → corridas siguientes de tracking-sync del mismo minuto son no-op.
      const readAt = new Date();
      await prisma.notification.update({ where: { id: first!.id }, data: { readAt } });
      await notifyOrderShippingException({
        orderId,
        carrierStatusRaw: "NOVEDAD",
        carrierDescription: "ENTREGA NO EFECTUADA POR INCONVENIENTES OPERATIVOS",
        carrierClarification: "18:30 : NOMBRE: 2986 ACLARACION:por tiempo",
        occurredAt,
      });
      expect(
        await prisma.notification.count({ where: { dedupKey: `order-exception-${orderId}` } }),
      ).toBe(1);
      const stillRead = await prisma.notification.findUnique({ where: { id: first!.id } });
      expect(stillRead!.readAt).not.toBeNull();
    });
  },
);
