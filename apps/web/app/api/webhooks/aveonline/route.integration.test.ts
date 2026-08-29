/*
 * Integración — ROUTE del webhook Aveonline (app/api/webhooks/aveonline/route.ts).
 *
 * Ejercita el PATH REAL end-to-end: POST → getShippingProvider().handleWebhook(cuerpo
 * REAL) → processTrackingUpdate → transición de la orden en DB. A diferencia de
 * saga.integration.test.ts (que MOCKEA el provider y llama a processTrackingUpdate con
 * un trackingNumber STRING), acá NO se mockea el provider: se usa el AveonlineProvider
 * real, así que se valida la coerción de `guia` NUMÉRICO → String.
 *
 * Es el hueco EXACTO que dejó pasar el bug P1 del webhook (audit ADR-054): Aveonline
 * manda `guia` como número; sin String() reventaba prisma.order.findFirst({trackingNumber})
 * (columna String) → la orden nunca pasaba a SHIPPED/DELIVERED ni salían correos, y el
 * CI seguía verde porque ningún test alimentaba una guía numérica al path real.
 *
 * Corre contra la DB de dev (DATABASE_URL). Aislamiento: filas RUN-prefijadas; afterAll
 * borra órdenes + webhookEvents creados.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// El setup (makeFulfillingOrder = varias escrituras) corre contra la Supabase de dev por red;
// el default de 5s es demasiado ajustado y da timeouts flaky bajo carga del suite completo. Subimos
// el timeout de este archivo de integración para que la latencia no lo tumbe (en CI, con Postgres
// local, sobra de todos modos).
vi.setConfig({ testTimeout: 20_000, hookTimeout: 30_000 });

// next/cache → passthrough (transitionOrder / getSettingValue pueden usarlo).
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

// Emails → stub que registra llamadas (sin pegar a Resend).
const emailCalls: Array<{ fn: string; orderId: string }> = [];
vi.mock("@/features/orders/emails", () => ({
  sendOrderConfirmation: async () => true,
  sendOrderConfirmationOnce: async () => {},
  sendOrderShipped: async (orderId: string) => {
    emailCalls.push({ fn: "sendOrderShipped", orderId });
  },
  sendOrderDelivered: async (orderId: string) => {
    emailCalls.push({ fn: "sendOrderDelivered", orderId });
  },
  sendOrderPaymentFailed: async () => {},
  sendOrderRefunded: async () => {},
  // Cubrir CADA export real de ./emails: un webhook de novedad puede tumbar la
  // orden (CANCELLED) → sendOrderCancelled. Sin el stub, el módulo mockeado lanza
  // "No export is defined on the mock" al invocarlo.
  sendOrderCancelled: async () => {},
}));

import { prisma } from "@/lib/db";
import { POST } from "@/app/api/webhooks/aveonline/route";
import { getShippingProvider } from "@/features/shipping/provider";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `whroute${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
const SECRET = `${RUN}-secret`;

// guia NUMÉRICA como la manda Aveonline. Única por corrida (no colisiona con datos reales).
let guiaSeq = 0;
function freshGuia(): number {
  return Number(`9${String(Date.now()).slice(-8)}${++guiaSeq}`);
}

const createdOrderIds: string[] = [];
const createdGuias: string[] = [];

async function makeFulfillingOrder(trackingNumber: string): Promise<string> {
  const o = await prisma.order.create({
    data: {
      number: `${RUN}-${trackingNumber}`,
      email: `${RUN}@lucams.test`,
      phone: "3001112233",
      shippingAddress: { fullName: "Test Cliente", city: "Bogotá", department: "Bogotá D.C." },
      subtotal: 45000,
      shipping: 10000,
      total: 55000,
      paymentMethod: "WOMPI",
      status: "FULFILLING",
      trackingNumber,
      shippingCarrier: "envia",
    },
    select: { id: true },
  });
  createdOrderIds.push(o.id);
  createdGuias.push(trackingNumber);
  return o.id;
}

function webhookRequest(payload: unknown, secret: string = SECRET): Request {
  return new Request(
    `http://localhost/api/webhooks/aveonline?secret=${encodeURIComponent(secret)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    },
  );
}

describe.skipIf(!hasDb)("webhook Aveonline ROUTE — path real con guia numérica", () => {
  const prevSecret = process.env.AVEONLINE_WEBHOOK_SECRET;
  const prevProvider = process.env.SHIPPING_PROVIDER;
  const prevAllowQuery = process.env.AVEONLINE_ALLOW_QUERY_SECRET;

  beforeAll(() => {
    process.env.AVEONLINE_WEBHOOK_SECRET = SECRET;
    process.env.SHIPPING_PROVIDER = "aveonline";
    // webhookRequest autentica por ?secret= → encender la vía query (D-1, default OFF)
    // salvo en el test que valida explícitamente el flag apagado.
    process.env.AVEONLINE_ALLOW_QUERY_SECRET = "true";
  });

  afterAll(async () => {
    if (prevSecret === undefined) delete process.env.AVEONLINE_WEBHOOK_SECRET;
    else process.env.AVEONLINE_WEBHOOK_SECRET = prevSecret;
    if (prevProvider === undefined) delete process.env.SHIPPING_PROVIDER;
    else process.env.SHIPPING_PROVIDER = prevProvider;
    if (prevAllowQuery === undefined) delete process.env.AVEONLINE_ALLOW_QUERY_SECRET;
    else process.env.AVEONLINE_ALLOW_QUERY_SECRET = prevAllowQuery;

    if (createdGuias.length > 0) {
      await prisma.webhookEvent
        .deleteMany({
          where: {
            source: "AVEONLINE",
            OR: createdGuias.map((g) => ({ externalId: { startsWith: `${g}-` } })),
          },
        })
        .catch(() => {});
    }
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }).catch(() => {});
  });

  beforeEach(() => {
    emailCalls.length = 0;
  });

  it("guia NUMÉRICA + IN_TRANSIT → FULFILLING→SHIPPED (coerción number→String) + email + webhookEvent procesado", async () => {
    const guia = freshGuia();
    const orderId = await makeFulfillingOrder(String(guia));

    const res = await POST(
      webhookRequest({
        status: "ok",
        guia, // ← NÚMERO, tal cual lo manda Aveonline
        estado: [{ estado_id: 5, nombre_estado: "EN TRANSITO", fecha: "2026-07-11 10:00:00" }],
      }),
    );
    expect(res.status).toBe(200);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    expect(order?.status).toBe("SHIPPED"); // ← con el bug (number sin coercer) quedaba en FULFILLING
    expect(emailCalls.filter((e) => e.fn === "sendOrderShipped")).toHaveLength(1);

    const ev = await prisma.webhookEvent.findFirst({
      where: { source: "AVEONLINE", externalId: { startsWith: `${guia}-` } },
    });
    expect(ev).not.toBeNull();
    expect(ev?.processedAt).not.toBeNull();
  });

  it("guia NUMÉRICA + ENTREGADA → DELIVERED + deliveredAt sellado + email", async () => {
    const guia = freshGuia();
    const orderId = await makeFulfillingOrder(String(guia));

    await POST(
      webhookRequest({
        status: "ok",
        guia,
        estado: [{ nombre_estado: "EN TRANSITO", fecha: "2026-07-11 10:00:00" }],
      }),
    );
    const res = await POST(
      webhookRequest({
        status: "ok",
        guia,
        estado: [{ nombre_estado: "ENTREGADA", fecha: "2026-07-11 15:00:00" }],
      }),
    );
    expect(res.status).toBe(200);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, deliveredAt: true },
    });
    expect(order?.status).toBe("DELIVERED");
    expect(order?.deliveredAt).not.toBeNull(); // ancla la ventana de retracto (F3)
    expect(emailCalls.filter((e) => e.fn === "sendOrderDelivered")).toHaveLength(1);
  });

  it("idempotente: el MISMO webhook 2 veces no re-transiciona ni re-envía email (dedup por externalId)", async () => {
    const guia = freshGuia();
    const orderId = await makeFulfillingOrder(String(guia));
    const payload = {
      status: "ok",
      guia,
      estado: [{ nombre_estado: "EN TRANSITO", fecha: "2026-07-11 10:00:00" }],
    };

    await POST(webhookRequest(payload));
    emailCalls.length = 0;
    const res2 = await POST(webhookRequest(payload));
    expect(res2.status).toBe(200);

    expect(emailCalls).toHaveLength(0); // no re-envía
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    expect(order?.status).toBe("SHIPPED");
  });

  it("secret inválido → 401 y la orden queda intacta", async () => {
    const guia = freshGuia();
    const orderId = await makeFulfillingOrder(String(guia));

    const res = await POST(
      webhookRequest(
        {
          status: "ok",
          guia,
          estado: [{ nombre_estado: "EN TRANSITO", fecha: "2026-07-11 10:00:00" }],
        },
        "secret-equivocado",
      ),
    );
    expect(res.status).toBe(401);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    expect(order?.status).toBe("FULFILLING");
    expect(emailCalls).toHaveLength(0);
  });

  it("guia de una orden inexistente → 200 sin efectos (no_match, no revienta)", async () => {
    const guia = freshGuia(); // sin orden asociada
    createdGuias.push(String(guia)); // para limpiar el webhookEvent creado
    const res = await POST(
      webhookRequest({
        status: "ok",
        guia,
        estado: [{ nombre_estado: "EN TRANSITO", fecha: "2026-07-11 10:00:00" }],
      }),
    );
    expect(res.status).toBe(200);
  });

  it("carrera de dedup (findUnique miss + create P2002 por entrega concurrente) → 200, sin doble saga ni 500", async () => {
    // Certificación 2026-07-29: dos entregas concurrentes del mismo evento pasan el
    // findUnique; el create perdedor revienta P2002. Antes: 500 crudo → reintentos
    // ciegos de Aveonline. Ahora: 200 "concurrent duplicate" y el ganador procesa.
    const guia = freshGuia();
    const orderId = await makeFulfillingOrder(String(guia));
    const payload = {
      status: "ok",
      guia,
      estado: [{ nombre_estado: "EN TRANSITO", fecha: "2026-07-11 10:00:00" }],
    };
    // externalId EXACTO que construirá el route (parse con el provider real).
    const provider = await getShippingProvider();
    const parsed = await provider.handleWebhook(JSON.stringify(payload), {});
    const tsKey = parsed.hasCarrierTimestamp ? String(parsed.timestamp.getTime()) : "no-ts";
    const externalId = `${parsed.trackingNumber}-${parsed.status}-${tsKey}`;
    // La fila YA existe en DB (la creó el request "ganador"), pero ESTE request la
    // pierde en findUnique (mock de UNA llamada) → su create revienta contra el
    // unique real (source, externalId) de la DB.
    await prisma.webhookEvent.create({
      data: { source: "AVEONLINE", externalId, payload: {} },
    });
    const spy = vi.spyOn(prisma.webhookEvent, "findUnique").mockResolvedValueOnce(null);

    const res = await POST(webhookRequest(payload));

    expect(res.status).toBe(200);
    // Sin doble procesamiento: ni email ni transición de estado (el ganador procesa).
    expect(emailCalls).toHaveLength(0);
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    expect(order?.status).toBe("FULFILLING");
    spy.mockRestore();
  });

  it("payload SIN fecha → dedup estable 'no-ts': 2 entregas = 1 fila y 1 procesamiento (D-4)", async () => {
    // Sin `fecha`/`timestamp` el parse cae a new Date() (distinto en cada entrega): si el
    // externalId usara ese valor, cada reintento re-procesaría. Con "no-ts" colapsan.
    const guia = freshGuia();
    const orderId = await makeFulfillingOrder(String(guia));
    const payload = {
      status: "ok",
      guia,
      estado: [{ nombre_estado: "EN TRANSITO" }], // ← sin fecha
    };

    const res1 = await POST(webhookRequest(payload));
    expect(res1.status).toBe(200);
    expect(emailCalls.filter((e) => e.fn === "sendOrderShipped")).toHaveLength(1);
    emailCalls.length = 0;

    const res2 = await POST(webhookRequest(payload));
    expect(res2.status).toBe(200);
    await expect(res2.json()).resolves.toMatchObject({ note: "already processed" });
    expect(emailCalls).toHaveLength(0); // no re-procesa ni re-envía email

    const rows = await prisma.webhookEvent.count({
      where: { source: "AVEONLINE", externalId: `${guia}-IN_TRANSIT-no-ts` },
    });
    expect(rows).toBe(1);
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    expect(order?.status).toBe("SHIPPED");
  });

  it("D-1: con AVEONLINE_ALLOW_QUERY_SECRET ausente, ?secret= NO autentica (401) y el header sí", async () => {
    delete process.env.AVEONLINE_ALLOW_QUERY_SECRET; // default OFF
    try {
      const guia = freshGuia();
      const orderId = await makeFulfillingOrder(String(guia));
      const payload = {
        status: "ok",
        guia,
        estado: [{ nombre_estado: "EN TRANSITO", fecha: "2026-07-11 10:00:00" }],
      };

      const byQuery = await POST(webhookRequest(payload)); // auth por ?secret=…
      expect(byQuery.status).toBe(401);
      let order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      expect(order?.status).toBe("FULFILLING"); // intacta

      const byHeader = await POST(
        new Request("http://localhost/api/webhooks/aveonline", {
          method: "POST",
          headers: { "content-type": "application/json", "x-aveonline-secret": SECRET },
          body: JSON.stringify(payload),
        }),
      );
      expect(byHeader.status).toBe(200);
      order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      expect(order?.status).toBe("SHIPPED");
    } finally {
      process.env.AVEONLINE_ALLOW_QUERY_SECRET = "true";
    }
  });
});
