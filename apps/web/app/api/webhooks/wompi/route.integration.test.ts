/*
 * Integración — ROUTE del webhook Wompi (app/api/webhooks/wompi/route.ts).
 *
 * Es el path MÁS crítico (marca órdenes como PAGADAS) y no tenía NINGÚN test del
 * route — mismo hueco que dejó pasar el bug del webhook Aveonline (audit ADR-054).
 * Los saga (processPaidOrder / processFailedPaymentOrder) YA están cubiertos por 48
 * tests, así que acá se MOCKEAN para testear la PORTERÍA del route con datos reales:
 * firma HMAC real, anti-replay (timestamp + environment), validación de monto,
 * idempotencia, y ruteo por status. La firma se construye igual que la de Wompi:
 *   sha256(props-values.join("") + timestamp + WOMPI_EVENTS_SECRET).
 *
 * Corre contra la DB de dev (DATABASE_URL). Aislamiento: órdenes/eventos RUN-prefijados.
 */

import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Saga stub — registra llamadas SIN ejecutar processPaidOrder real (createShipment/Resend).
const sagaCalls: Array<{
  fn: string;
  orderId: string;
  wompiTransactionId: string;
  reason?: string;
}> = [];
vi.mock("@/features/orders/saga", () => ({
  processPaidOrder: async (args: { orderId: string; wompiTransactionId: string }) => {
    sagaCalls.push({ fn: "processPaidOrder", ...args });
    return { status: "ok", trackingNumber: "TRACK-X" };
  },
  processFailedPaymentOrder: async (args: {
    orderId: string;
    wompiTransactionId: string;
    reason: string;
  }) => {
    sagaCalls.push({ fn: "processFailedPaymentOrder", ...args });
    return { status: "ok" };
  },
}));

import { prisma } from "@/lib/db";
import { POST } from "@/app/api/webhooks/wompi/route";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `wompiroute${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const EVENTS_SECRET = `${RUN}-events-secret`;

const createdOrderIds: string[] = [];

async function makeOrder(
  reference: string,
  total: number,
  status = "PENDING_PAYMENT",
): Promise<string> {
  const o = await prisma.order.create({
    data: {
      number: reference,
      email: `${RUN}@lucams.test`,
      phone: "3001112233",
      shippingAddress: { fullName: "Test", city: "Bogotá", department: "Bogotá D.C." },
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

/** Construye un evento Wompi FIRMADO igual que lo hace Wompi (checksum real). */
function signedEvent(opts: {
  txId: string;
  status: string;
  amountInCents: number;
  reference: string;
  timestamp?: number;
  environment?: "test" | "prod";
  statusMessage?: string;
  tamperChecksum?: boolean;
}) {
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const transaction = {
    id: opts.txId,
    status: opts.status,
    amount_in_cents: opts.amountInCents,
    reference: opts.reference,
    status_message: opts.statusMessage ?? null,
  };
  const concat =
    String(transaction.id) +
    String(transaction.status) +
    String(transaction.amount_in_cents) +
    String(timestamp) +
    EVENTS_SECRET;
  let checksum = crypto.createHash("sha256").update(concat).digest("hex");
  if (opts.tamperChecksum) checksum = checksum.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
  return {
    event: "transaction.updated",
    data: { transaction },
    environment: opts.environment ?? "test",
    signature: { properties, checksum },
    timestamp,
  };
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/webhooks/wompi", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe.skipIf(!hasDb)("webhook Wompi ROUTE — portería con firma real", () => {
  const saved: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const k of [
      "WOMPI_ENV",
      "WOMPI_PUBLIC_KEY",
      "WOMPI_PRIVATE_KEY",
      "WOMPI_EVENTS_SECRET",
      "WOMPI_INTEGRITY_SECRET",
      "WOMPI_DISABLE_TIMESTAMP_CHECK",
    ]) {
      saved[k] = process.env[k];
    }
    process.env.WOMPI_ENV = "sandbox"; // → expectedEnv "test"
    process.env.WOMPI_PUBLIC_KEY = "pub_test_x";
    process.env.WOMPI_PRIVATE_KEY = "prv_test_x";
    process.env.WOMPI_EVENTS_SECRET = EVENTS_SECRET;
    process.env.WOMPI_INTEGRITY_SECRET = "integ_test_x";
    delete process.env.WOMPI_DISABLE_TIMESTAMP_CHECK; // queremos probar los checks reales
  });

  afterAll(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    // El externalId del webhookEvent es `<txId>-<status>-<ts>` (usa el TX id, NO la
    // reference), pero ambos llevan el prefijo RUN → limpiamos por RUN (bulletproof).
    await prisma.webhookEvent
      .deleteMany({ where: { source: "WOMPI", externalId: { contains: RUN } } })
      .catch(() => {});
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
  });

  beforeEach(() => {
    sagaCalls.length = 0;
  });

  it("APPROVED con firma y monto válidos → processPaidOrder + 200 + webhookEvent procesado", async () => {
    const ref = `${RUN}-LCM-APR`;
    const orderId = await makeOrder(ref, 55000);
    const res = await POST(
      req(
        signedEvent({
          txId: `${RUN}-tx1`,
          status: "APPROVED",
          amountInCents: 55000,
          reference: ref,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(sagaCalls).toHaveLength(1);
    expect(sagaCalls[0]).toMatchObject({
      fn: "processPaidOrder",
      orderId,
      wompiTransactionId: `${RUN}-tx1`,
    });
    const ev = await prisma.webhookEvent.findFirst({
      where: { source: "WOMPI", externalId: { contains: `${RUN}-tx1` } },
    });
    expect(ev?.processedAt).not.toBeNull();
  });

  it("firma INVÁLIDA → 401 y NO procesa (ni saga ni webhookEvent)", async () => {
    const ref = `${RUN}-LCM-BADSIG`;
    await makeOrder(ref, 55000);
    const res = await POST(
      req(
        signedEvent({
          txId: `${RUN}-tx2`,
          status: "APPROVED",
          amountInCents: 55000,
          reference: ref,
          tamperChecksum: true,
        }),
      ),
    );
    expect(res.status).toBe(401);
    expect(sagaCalls).toHaveLength(0);
    const ev = await prisma.webhookEvent.findFirst({
      where: { source: "WOMPI", externalId: { contains: `${RUN}-tx2` } },
    });
    expect(ev).toBeNull();
  });

  it("reintento Wompi (mismo timestamp, 3h después) → se PROCESA, no se rechaza (doc eventos)", async () => {
    const ref = `${RUN}-LCM-RETRY`;
    const orderId = await makeOrder(ref, 55000);
    const oldTs = Math.floor(Date.now() / 1000) - 3 * 3600; // 3h atrás (horario del 2do reintento)
    const res = await POST(
      req(
        signedEvent({
          txId: `${RUN}-tx3`,
          status: "APPROVED",
          amountInCents: 55000,
          reference: ref,
          timestamp: oldTs,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(sagaCalls).toHaveLength(1);
    expect(sagaCalls[0]).toMatchObject({ fn: "processPaidOrder", orderId });
  });

  it("timestamp MÁS ALLÁ del horizonte de reintentos (>25h, replay viejo) → 401", async () => {
    const ref = `${RUN}-LCM-REPLAY`;
    await makeOrder(ref, 55000);
    const oldTs = Math.floor(Date.now() / 1000) - 26 * 3600; // 26h atrás
    const res = await POST(
      req(
        signedEvent({
          txId: `${RUN}-tx3b`,
          status: "APPROVED",
          amountInCents: 55000,
          reference: ref,
          timestamp: oldTs,
        }),
      ),
    );
    expect(res.status).toBe(401);
    expect(sagaCalls).toHaveLength(0);
  });

  it("environment mismatch (prod vs test esperado) → 401", async () => {
    const ref = `${RUN}-LCM-ENV`;
    await makeOrder(ref, 55000);
    const res = await POST(
      req(
        signedEvent({
          txId: `${RUN}-tx4`,
          status: "APPROVED",
          amountInCents: 55000,
          reference: ref,
          environment: "prod",
        }),
      ),
    );
    expect(res.status).toBe(401);
    expect(sagaCalls).toHaveLength(0);
  });

  it("idempotente: el MISMO evento 2 veces → processPaidOrder una sola vez", async () => {
    const ref = `${RUN}-LCM-IDEM`;
    await makeOrder(ref, 55000);
    const ev = signedEvent({
      txId: `${RUN}-tx5`,
      status: "APPROVED",
      amountInCents: 55000,
      reference: ref,
    });
    await POST(req(ev));
    const res2 = await POST(req(ev));
    expect(res2.status).toBe(200);
    expect(sagaCalls.filter((c) => c.fn === "processPaidOrder")).toHaveLength(1);
  });

  it("monto que NO coincide con order.total → 200 sin procesar (revisión manual)", async () => {
    const ref = `${RUN}-LCM-AMT`;
    await makeOrder(ref, 55000);
    const res = await POST(
      req(
        signedEvent({
          txId: `${RUN}-tx6`,
          status: "APPROVED",
          amountInCents: 99000,
          reference: ref,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(sagaCalls).toHaveLength(0); // NO se procesa un monto adulterado
  });

  it("orden inexistente (reference sin match) → 200 ignorado, sin saga", async () => {
    const res = await POST(
      req(
        signedEvent({
          txId: `${RUN}-tx7`,
          status: "APPROVED",
          amountInCents: 55000,
          reference: `${RUN}-NOPE`,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(sagaCalls).toHaveLength(0);
  });

  it("DECLINED → noop (orden sigue PENDING_PAYMENT para el reintento de Wompi, doc oficial)", async () => {
    const ref = `${RUN}-LCM-DECL`;
    await makeOrder(ref, 55000);
    const res = await POST(
      req(
        signedEvent({
          txId: `${RUN}-tx8`,
          status: "DECLINED",
          amountInCents: 55000,
          reference: ref,
          statusMessage: "Fondos insuficientes",
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(sagaCalls).toHaveLength(0); // NO se cancela: Wompi reintenta con la misma reference
  });

  it("VOIDED → processFailedPaymentOrder (dinero capturado)", async () => {
    const ref = `${RUN}-LCM-VOID`;
    const orderId = await makeOrder(ref, 55000, "PAID");
    const res = await POST(
      req(
        signedEvent({
          txId: `${RUN}-tx8b`,
          status: "VOIDED",
          amountInCents: 55000,
          reference: ref,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(sagaCalls).toHaveLength(1);
    expect(sagaCalls[0]).toMatchObject({
      fn: "processFailedPaymentOrder",
      orderId,
      wompiTransactionId: `${RUN}-tx8b`,
    });
  });

  it("PENDING → noop (espera próximo evento), sin saga", async () => {
    const ref = `${RUN}-LCM-PEND`;
    await makeOrder(ref, 55000);
    const res = await POST(
      req(
        signedEvent({
          txId: `${RUN}-tx9`,
          status: "PENDING",
          amountInCents: 55000,
          reference: ref,
        }),
      ),
    );
    expect(res.status).toBe(200);
    expect(sagaCalls).toHaveLength(0);
  });
});
