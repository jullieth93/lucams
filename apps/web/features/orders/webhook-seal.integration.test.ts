/*
 * Tests de integración de sealManuallyResolvedWebhookEvents (N-13) contra la DB real.
 *
 * FOCO: cuando retryShipmentAction resuelve manualmente una orden atascada, se
 * sellan (processedAt) los WebhookEvent SIN procesar relacionados con ella —
 * así la alerta webhooks_stuck se auto-limpia. Relación por payload:
 *   - WOMPI: payload.data.transaction.id === order.wompiTransactionId
 *   - AVEONLINE: payload.trackingNumber === order.trackingNumber
 *
 * Se cubre: sella solo los relacionados y pendientes; NO toca los de otras
 * órdenes, los ya procesados, ni payloads con forma inesperada; el caso SIN
 * relación (orden sin wompiTransactionId ni trackingNumber); la idempotencia;
 * y la orden inexistente (no lanza).
 *
 * Aislamiento: todo RUN-prefijado, limpieza SCOPED. Requiere DATABASE_URL.
 */

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sealManuallyResolvedWebhookEvents } from "./webhook-seal";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `seal${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const T = 30_000;

const createdOrderIds: string[] = [];
const createdEventIds: string[] = [];

function uniq(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

async function makeOrder(opts: {
  wompiTransactionId?: string | null;
  trackingNumber?: string | null;
}): Promise<string> {
  const tag = uniq();
  const o = await prisma.order.create({
    data: {
      number: `${RUN}-${tag}`,
      email: `${RUN}-${tag}@lucams.test`,
      phone: "3001112233",
      shippingAddress: { fullName: "Test", city: "Bogotá", department: "Bogotá D.C." },
      subtotal: 45_000,
      shipping: 10_000,
      total: 55_000,
      paymentMethod: "WOMPI",
      status: "PAID",
      wompiTransactionId: opts.wompiTransactionId ?? null,
      trackingNumber: opts.trackingNumber ?? null,
    },
    select: { id: true },
  });
  createdOrderIds.push(o.id);
  return o.id;
}

async function makeEvent(opts: {
  source: "WOMPI" | "AVEONLINE";
  payload: object;
  processed?: boolean;
}): Promise<string> {
  const ev = await prisma.webhookEvent.create({
    data: {
      source: opts.source,
      externalId: `${RUN}-${uniq()}`,
      payload: opts.payload,
      processedAt: opts.processed ? new Date() : null,
    },
    select: { id: true },
  });
  createdEventIds.push(ev.id);
  return ev.id;
}

const processedAtOf = async (id: string) =>
  (await prisma.webhookEvent.findUnique({ where: { id }, select: { processedAt: true } }))
    ?.processedAt ?? null;

describe.skipIf(!hasDb)(
  "orders/webhook-seal — sellado tras resolución manual (N-13)",
  { timeout: T },
  () => {
    afterAll(async () => {
      const safe = async (fn: () => Promise<unknown>) => {
        try {
          await fn();
        } catch {
          /* blip del pooler — fixture RUN-scoped */
        }
      };
      await safe(() => prisma.webhookEvent.deleteMany({ where: { id: { in: createdEventIds } } }));
      await safe(() =>
        prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } }),
      );
      await safe(() => prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }));
    }, T);

    it("sella SOLO los eventos pendientes relacionados con la orden (WOMPI por txId + AVEONLINE por tracking)", async () => {
      const txId = `${RUN}-tx`;
      const tracking = `${RUN}-TRK`;
      const orderId = await makeOrder({ wompiTransactionId: txId, trackingNumber: tracking });

      // Relacionados y pendientes → deben sellarse.
      const wompiHit = await makeEvent({
        source: "WOMPI",
        payload: {
          event: "transaction.updated",
          data: { transaction: { id: txId, status: "APPROVED" } },
        },
      });
      const aveoHit = await makeEvent({
        source: "AVEONLINE",
        payload: { trackingNumber: tracking, status: "DISPATCHED", carrierStatusRaw: "DESPACHADA" },
      });
      // NO relacionados → intactos.
      const wompiOtherTx = await makeEvent({
        source: "WOMPI",
        payload: { data: { transaction: { id: `${RUN}-tx-OTRA` } } },
      });
      const aveoOtherTrk = await makeEvent({
        source: "AVEONLINE",
        payload: { trackingNumber: `${RUN}-TRK-OTRA` },
      });
      // Relacionado pero YA procesado → no se toca (su timestamp queda como estaba).
      const alreadyProcessed = await makeEvent({
        source: "WOMPI",
        payload: { data: { transaction: { id: txId } } },
        processed: true,
      });
      const processedTimestamp = (await prisma.webhookEvent.findUnique({
        where: { id: alreadyProcessed },
        select: { processedAt: true },
      }))!.processedAt;
      // Payloads con forma inesperada → no revientan ni matchean.
      const malformed1 = await makeEvent({ source: "WOMPI", payload: {} });
      const malformed2 = await makeEvent({
        source: "WOMPI",
        payload: { data: { transaction: { id: 12345 } } },
      });
      const malformed3 = await makeEvent({
        source: "AVEONLINE",
        payload: ["no", "es", "objeto"] as unknown as object,
      });

      const res = await sealManuallyResolvedWebhookEvents(orderId);

      expect(res.sealed).toBe(2);
      expect(await processedAtOf(wompiHit)).not.toBeNull();
      expect(await processedAtOf(aveoHit)).not.toBeNull();
      expect(await processedAtOf(wompiOtherTx)).toBeNull();
      expect(await processedAtOf(aveoOtherTrk)).toBeNull();
      expect(await processedAtOf(alreadyProcessed)).toEqual(processedTimestamp);
      expect(await processedAtOf(malformed1)).toBeNull();
      expect(await processedAtOf(malformed2)).toBeNull();
      expect(await processedAtOf(malformed3)).toBeNull();
    });

    it("orden SIN relación (ni wompiTransactionId ni trackingNumber) → no sella nada", async () => {
      const orderId = await makeOrder({});
      const pending = await makeEvent({
        source: "WOMPI",
        payload: { data: { transaction: { id: `${RUN}-tx-cualquiera` } } },
      });

      const res = await sealManuallyResolvedWebhookEvents(orderId);

      expect(res.sealed).toBe(0);
      expect(await processedAtOf(pending)).toBeNull();
    });

    it("idempotente: la segunda corrida no vuelve a sellar (sealed 0) y no pisa timestamps", async () => {
      const txId = `${RUN}-tx-idem`;
      const orderId = await makeOrder({ wompiTransactionId: txId });
      const ev = await makeEvent({
        source: "WOMPI",
        payload: { data: { transaction: { id: txId } } },
      });

      const first = await sealManuallyResolvedWebhookEvents(orderId);
      expect(first.sealed).toBe(1);
      const stamped = await processedAtOf(ev);
      expect(stamped).not.toBeNull();

      const second = await sealManuallyResolvedWebhookEvents(orderId);
      expect(second.sealed).toBe(0);
      expect(await processedAtOf(ev)).toEqual(stamped);
    });

    it("orden inexistente → sealed 0 sin lanzar (el caller ya resolvió; el sellado es best-effort)", async () => {
      const res = await sealManuallyResolvedWebhookEvents(`${RUN}-no-existe`);
      expect(res.sealed).toBe(0);
    });
  },
);
