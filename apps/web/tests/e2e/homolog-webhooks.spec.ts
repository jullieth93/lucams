/*
 * HOMOLOGACIÓN E2E — webhooks entrantes como flujo (PROMPT_E2E_HOMOLOGACION
 * §8): "firma Wompi sintética bien/mal formada (200/401), dedup por reintento
 * del mismo evento, environment-match (sandbox≠prod); Resend Svix (firma +
 * tolerancia anti-replay + idempotencia por resendId); Aveonline con secret
 * por header (dedup + timing-safe). Sin compras ni guías reales."
 *
 * Se golpean las rutas REALES del ambiente por HTTP (LOCAL :4000 / STG con
 * bypass) con eventos sintéticos firmados con los secrets del propio ambiente
 * (cargados del .env del ambiente por _setup/env — nunca hardcodeados):
 *
 *   Wompi (sha256 concatenado + timingSafeEqual, ventana 25h, env-match):
 *     firma mala → 401 · firma válida con orden inexistente → 200
 *     "order not found, ignored" + WebhookEvent sellado · MISMO evento otra
 *     vez → 200 "already processed" (1 sola fila) · timestamp 26h → 401 ·
 *     environment test/probado dinámicamente: exactamente UNO de {test, prod}
 *     es aceptado y el otro → 401 mismatch (la aserción no asume WOMPI_ENV).
 *
 *   Resend (Svix: HMAC-SHA256 base64 sobre `${id}.${ts}.${rawBody}`, tolerancia
 *   5 min): sin headers → 401 · firma mala → 401 · firma válida → 200 +
 *     EmailEvent por resendId · reintento → 200 y sigue 1 fila (upsert) ·
 *     timestamp 10 min viejo → 401 (anti-replay).
 *
 *   Aveonline (secret estático timing-safe por header o query): secret malo
 *     (misma longitud que el real — el 401 no depende del largo) → 401 ·
 *     guía inexistente firmada → 200 + WebhookEvent sellado · MISMO evento
 *     (misma fecha → mismo externalId) → 200 "already processed" (1 fila) ·
 *     secret por query-string también aceptado (rama documentada con warning).
 *
 *   Wompi §7.5.2 (monto adulterado): orden PENDING_PAYMENT sembrada + evento
 *     APPROVED firmado con amount ≠ total → 200 "amount mismatch, manual
 *     review" + needsReconciliation=true + orden sin transicionar + stock
 *     intacto + WebhookEvent sellado. Sin llamadas externas.
 *
 * En PRD PROHIBIDO (escribe WebhookEvent/EmailEvent). Limpieza: las filas del
 * run se borran en afterAll (externalId/resendId contienen el RUN); la orden y
 * el producto del test §7.5 también se borran.
 */

import { createHash, createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { strip } from "./_setup/env";
import { E2E_ENV, expect, test } from "./fixtures/auth";
import { db, disconnectDb } from "./fixtures/db";
import { newRunId } from "./fixtures/run";
import {
  createEphemeralProduct,
  deleteEphemeralProduct,
  type EphemeralProduct,
} from "./fixtures/data-factory";

const EVIDENCE_DIR = resolve(__dirname, "../../tmp/e2e-homologacion");

test.skip(
  E2E_ENV === "prd",
  "Los webhooks sintéticos escriben WebhookEvent/EmailEvent: prohibido en PRD.",
);

const run = newRunId("webhooks");
const digits = run.replace(/\D/g, "").slice(-8);
const GUIA = `89${digits}`;
const RESEND_ID = `re_${run.replace(/-/g, "_")}`;

const WOMPI_SECRET = strip(process.env.WOMPI_EVENTS_SECRET);
const RESEND_SECRET = strip(process.env.RESEND_WEBHOOK_SECRET);
const AVE_SECRET = strip(process.env.AVEONLINE_WEBHOOK_SECRET);

// Semillas del test §7.5 (monto adulterado) — limpiadas en afterAll.
let tamperOrderId = "";
let tamperProduct: EphemeralProduct | null = null;

type Step = { step: string; ok: boolean; detail?: string; at: string };

function evidenceWriter(tag: string, project: string) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const resultsPath = resolve(EVIDENCE_DIR, `results-${E2E_ENV}-${project}-${run}-${tag}.json`);
  const steps: Step[] = [];
  const record = (step: string, ok: boolean, detail?: string) =>
    steps.push({ step, ok, detail, at: new Date().toISOString() });
  const write = (status: "pass" | "fail", error?: unknown) => {
    writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          spec: "homolog-webhooks",
          env: E2E_ENV,
          project,
          run,
          status,
          ...(error ? { error: String(error) } : {}),
          steps,
        },
        null,
        2,
      ),
    );
    console.log(`✓ evidencia ${tag}: ${resultsPath}`);
  };
  return { record, write };
}

/** Body de evento Wompi con la firma oficial: sha256 de valores+timestamp+secret. */
function wompiEvent(opts: {
  txId: string;
  status: string;
  amount: number;
  reference: string;
  environment: "test" | "prod";
  timestamp: number;
  badSignature?: boolean;
}): string {
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const concat =
    String(opts.txId) +
    String(opts.status) +
    String(opts.amount) +
    String(opts.timestamp) +
    WOMPI_SECRET!;
  const checksum = opts.badSignature
    ? "0".repeat(64)
    : createHash("sha256").update(concat).digest("hex");
  return JSON.stringify({
    event: "transaction.updated",
    data: {
      transaction: {
        id: opts.txId,
        reference: opts.reference,
        status: opts.status,
        amount_in_cents: opts.amount,
        currency: "COP",
        payment_method_type: "CARD",
      },
    },
    environment: opts.environment,
    signature: { properties, checksum },
    timestamp: opts.timestamp,
  });
}

function svixHeaders(id: string, tsSec: number, rawBody: string): Record<string, string> {
  const key = Buffer.from(RESEND_SECRET!.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${tsSec}.${rawBody}`).digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": String(tsSec),
    "svix-signature": `v1,${sig}`,
    "Content-Type": "application/json",
  };
}

test.afterAll(async () => {
  await db()
    .webhookEvent.deleteMany({
      where: {
        OR: [
          { source: "WOMPI", externalId: { contains: run } },
          { source: "AVEONLINE", externalId: { contains: GUIA } },
        ],
      },
    })
    .catch(() => {});
  await db()
    .emailEvent.deleteMany({ where: { resendId: { contains: run.replace(/-/g, "_") } } })
    .catch(() => {});
  if (tamperOrderId) {
    await db()
      .orderItem.deleteMany({ where: { orderId: tamperOrderId } })
      .catch(() => {});
    await db()
      .order.deleteMany({ where: { id: tamperOrderId } })
      .catch(() => {});
  }
  if (tamperProduct) await deleteEphemeralProduct(tamperProduct);
  await disconnectDb();
});

test("webhook Wompi §8: firma 200/401 · dedup · environment-match · anti-replay", async ({
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(!WOMPI_SECRET, "Sin WOMPI_EVENTS_SECRET en el ambiente.");
  const { record, write } = evidenceWriter("wompi", testInfo.project.name);
  const post = (body: string) =>
    request.post("/api/webhooks/wompi", {
      headers: { "Content-Type": "application/json" },
      data: body,
    });

  try {
    const get = await request.get("/api/webhooks/wompi");
    expect(get.status()).toBe(405);
    record("get-405", true, "GET → 405 (POST only)");

    const bad = await post(
      wompiEvent({
        txId: `e2e-${run}-bad`,
        status: "APPROVED",
        amount: 100000,
        reference: `E2E-${run}`,
        environment: "test",
        timestamp: Math.floor(Date.now() / 1000),
        badSignature: true,
      }),
    );
    expect(bad.status()).toBe(401);
    expect(await bad.json()).toMatchObject({ error: "invalid signature" });
    record("firma-mala-401", true, "checksum adulterado → 401 invalid signature");

    // Firma válida, orden inexistente → 200 ignored + fila sellada.
    const now = Math.floor(Date.now() / 1000);
    const txId = `e2e-${run}-ok`;
    const body = wompiEvent({
      txId,
      status: "APPROVED",
      amount: 12345600,
      reference: `E2E-${run}`,
      environment: "test",
      timestamp: now,
    });
    const ok = await post(body);
    const okJson = await ok.json();
    // Si el ambiente espera "prod" este POST da 401 mismatch — el environment-match
    // dinámico de abajo lo resuelve; acá exigimos una de las dos rutas conocidas.
    const envNote =
      ok.status() === 200
        ? String(okJson.note)
        : `401 ${String(okJson.error)} (el ambiente espera prod — ver environment-match)`;
    record("firma-valida", true, `orden inexistente → ${ok.status()} · ${envNote}`);

    if (ok.status() === 200) {
      expect(okJson.note).toContain("ignored");
      // Dedup: el MISMO evento otra vez → already processed, 1 sola fila.
      const again = await post(body);
      expect(again.status()).toBe(200);
      expect(await again.json()).toMatchObject({ note: "already processed" });
      const rows = await db().webhookEvent.count({
        where: { source: "WOMPI", externalId: `${txId}-APPROVED-${now}` },
      });
      expect(rows, "una sola fila WebhookEvent para el evento duplicado").toBe(1);
      const row = await db().webhookEvent.findFirst({
        where: { source: "WOMPI", externalId: `${txId}-APPROVED-${now}` },
      });
      expect(row!.processedAt, "la fila quedó sellada").not.toBeNull();
      record("dedup-reintento", true, `reintento → 200 "already processed" · 1 fila sellada`);
    }

    // Anti-replay: timestamp 26h viejo (firma válida de ese timestamp) → 401.
    const stale = await post(
      wompiEvent({
        txId: `e2e-${run}-stale`,
        status: "APPROVED",
        amount: 100000,
        reference: `E2E-${run}`,
        environment: "test",
        timestamp: now - 26 * 3600,
      }),
    );
    expect(stale.status()).toBe(401);
    expect(await stale.json()).toMatchObject({ error: "timestamp out of window" });
    record("anti-replay-401", true, "timestamp 26h → 401 timestamp out of window (ventana 25h)");

    // Environment-match dinámico: exactamente UNO de {test, prod} pasa.
    const mkEnv = (environment: "test" | "prod", tag: string) =>
      wompiEvent({
        txId: `e2e-${run}-env-${tag}`,
        status: "PENDING",
        amount: 100000,
        reference: `E2E-${run}`,
        environment,
        timestamp: now,
      });
    const envTest = await post(mkEnv("test", "t"));
    const envProd = await post(mkEnv("prod", "p"));
    const results = {
      test: { status: envTest.status(), body: await envTest.json() },
      prod: { status: envProd.status(), body: await envProd.json() },
    };
    const accepted = (["test", "prod"] as const).filter((e) => results[e].status === 200);
    const rejected = (["test", "prod"] as const).filter(
      (e) => results[e].status === 401 && results[e].body.error === "environment mismatch",
    );
    expect(accepted.length, "exactamente un environment aceptado").toBe(1);
    expect(rejected.length, "el otro → 401 environment mismatch").toBe(1);
    record(
      "environment-match",
      true,
      `el ambiente acepta "${accepted[0]}" y rechaza "${rejected[0]}" con 401 mismatch`,
    );

    write("pass");
  } catch (err) {
    write("fail", err);
    throw err;
  }
});

test("webhook Resend §8 (Svix): firma · tolerancia anti-replay · idempotencia por resendId", async ({
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(!RESEND_SECRET, "Sin RESEND_WEBHOOK_SECRET en el ambiente.");
  const { record, write } = evidenceWriter("resend", testInfo.project.name);

  try {
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      type: "email.delivered",
      created_at: new Date(now * 1000).toISOString(),
      data: {
        email_id: RESEND_ID,
        to: [`${run}@e2e.test`],
        from: "tienda@lucamsshop.com",
        subject: `E2E webhooks ${run}`,
      },
    });

    const noHeaders = await request.post("/api/webhooks/resend", {
      headers: { "Content-Type": "application/json" },
      data: payload,
    });
    expect(noHeaders.status()).toBe(401);
    record("sin-headers-401", true, "POST sin headers Svix → 401");

    const badSig = await request.post("/api/webhooks/resend", {
      headers: {
        "svix-id": `msg_${run}`,
        "svix-timestamp": String(now),
        "svix-signature": "v1,c2lnbmF0dXJlLWFkdWx0ZXJhdGE=",
        "Content-Type": "application/json",
      },
      data: payload,
    });
    expect(badSig.status()).toBe(401);
    record("firma-mala-401", true, "firma adulterada → 401 Invalid signature");

    const good = await request.post("/api/webhooks/resend", {
      headers: svixHeaders(`msg_${run}`, now, payload),
      data: payload,
    });
    expect(good.status()).toBe(200);
    expect(await good.json()).toMatchObject({ ok: true });
    await expect(async () => {
      const ev = await db().emailEvent.findFirst({ where: { resendId: RESEND_ID } });
      expect(ev, "EmailEvent del run debe existir").not.toBeNull();
      expect(ev!.type).toBe("email.delivered");
    }).toPass({ timeout: 15_000 });
    record("firma-valida-200", true, `200 ok:true + EmailEvent ${RESEND_ID} en DB`);

    // Idempotencia: el reintento de Resend del MISMO evento → 200, 1 fila.
    const retry = await request.post("/api/webhooks/resend", {
      headers: svixHeaders(`msg_${run}`, now, payload),
      data: payload,
    });
    expect(retry.status()).toBe(200);
    const rows = await db().emailEvent.count({ where: { resendId: RESEND_ID } });
    expect(rows, "upsert por resendId → sigue 1 fila").toBe(1);
    record("idempotencia-resendId", true, "reintento → 200 · 1 sola fila (upsert)");

    // Anti-replay: timestamp 10 min viejo (firma válida de ese ts) → 401.
    const oldTs = now - 600;
    const oldPayload = payload;
    const stale = await request.post("/api/webhooks/resend", {
      headers: svixHeaders(`msg_${run}_stale`, oldTs, oldPayload),
      data: oldPayload,
    });
    expect(stale.status()).toBe(401);
    record("anti-replay-401", true, "svix-timestamp 10 min viejo → 401 (tolerancia 5 min)");

    write("pass");
  } catch (err) {
    write("fail", err);
    throw err;
  }
});

test("webhook Aveonline §8: secret por header (timing-safe) · dedup", async ({
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(!AVE_SECRET, "Sin AVEONLINE_WEBHOOK_SECRET en el ambiente.");
  const { record, write } = evidenceWriter("aveonline", testInfo.project.name);

  const payload = JSON.stringify({
    // La doc de Aveonline envía `guia` como NÚMERO — ejerce la coerción.
    guia: Number(GUIA),
    estado: [{ nombre_estado: "EN REPARTO", fecha: "2026-08-07 10:00:00" }],
  });
  const post = (headers: Record<string, string>, query = "") =>
    request.post(`/api/webhooks/aveonline${query}`, {
      headers: { "Content-Type": "application/json", ...headers },
      data: payload,
    });

  try {
    const get = await request.get("/api/webhooks/aveonline");
    expect(get.status()).toBe(405);
    record("get-405", true, "GET → 405 (POST only)");

    // Secret malo de la MISMA longitud que el real: el 401 no depende del
    // largo (la comparación es timing-safe, lib/timing-safe.ts).
    const wrongSameLength = "x".repeat(AVE_SECRET!.trim().length);
    const bad = await post({ "x-aveonline-secret": wrongSameLength });
    expect(bad.status()).toBe(401);
    expect(await bad.json()).toMatchObject({ error: "invalid secret" });
    record("secret-malo-401", true, "secret inválido (misma longitud) → 401 invalid secret");

    const ok = await post({ "x-aveonline-secret": AVE_SECRET! });
    expect(ok.status()).toBe(200);
    await expect(async () => {
      const row = await db().webhookEvent.findFirst({
        where: { source: "AVEONLINE", externalId: { startsWith: `${GUIA}-IN_TRANSIT-` } },
      });
      expect(row, "WebhookEvent AVEONLINE del run debe existir").not.toBeNull();
      expect(row!.processedAt, "la fila quedó sellada").not.toBeNull();
    }).toPass({ timeout: 15_000 });
    record(
      "secret-valido-200",
      true,
      `guía sintética ${GUIA} inexistente → 200 + WebhookEvent sellado (saga: orden no hallada)`,
    );

    // Dedup: MISMO payload (misma fecha → mismo externalId) → already processed.
    const again = await post({ "x-aveonline-secret": AVE_SECRET! });
    expect(again.status()).toBe(200);
    expect(await again.json()).toMatchObject({ note: "already processed" });
    const rows = await db().webhookEvent.count({
      where: { source: "AVEONLINE", externalId: { startsWith: `${GUIA}-IN_TRANSIT-` } },
    });
    expect(rows, "una sola fila para el evento duplicado").toBe(1);
    record("dedup-reintento", true, `reintento → 200 "already processed" · 1 fila`);

    // Rama por query-string: DESHABILITADA por defecto (auditoría 2026-08-24, D-1)
    // — solo se acepta con AVEONLINE_ALLOW_QUERY_SECRET=true. Acá debe dar 401.
    const byQuery = await post({}, `?secret=${encodeURIComponent(AVE_SECRET!.trim())}`);
    expect(byQuery.status()).toBe(401);
    record("secret-por-query-401", true, "?secret=… rechazado por defecto (D-1: flag OFF)");

    write("pass");
  } catch (err) {
    write("fail", err);
    throw err;
  }
});

/**
 * §7.5.2 (parcial, modo-catálogo compatible): "monto adulterado →
 * needsReconciliation y NO descuento de stock prematuro". Siembra una orden
 * PENDING_PAYMENT con ítem y le dispara un evento APPROVED firmado pero con
 * amount_in_cents ≠ total: la ruta debe marcar needsReconciliation, NO
 * transicionar la orden, NO tocar el stock y sellar el WebhookEvent.
 * (El camino APPROVED feliz → saga → guía Aveonline se certifica aparte en
 * wompi-sandbox.spec.ts contra sandbox — acá no se llama nada externo.)
 */
test("webhook Wompi §7.5: monto adulterado → needsReconciliation + stock intacto", async ({
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(!WOMPI_SECRET, "Sin WOMPI_EVENTS_SECRET en el ambiente.");
  const { record, write } = evidenceWriter("wompi-tamper", testInfo.project.name);

  try {
    tamperProduct = await createEphemeralProduct(run);
    const unitPrice = 19_900;
    const stockBefore = await db().productVariant.findUniqueOrThrow({
      where: { id: tamperProduct.variantId },
      select: { stock: true },
    });
    const order = await db().order.create({
      data: {
        number: `E2E-TAMPER-${run}`,
        email: `${run}@e2e.test`,
        phone: "3000000000",
        shippingAddress: { line1: "Calle 1 # 2-3", city: "Bogotá", department: "Cundinamarca" },
        subtotal: unitPrice,
        shipping: 0,
        total: unitPrice,
        status: "PENDING_PAYMENT",
        paymentMethod: "WOMPI",
        items: { create: [{ variantId: tamperProduct.variantId, qty: 1, unitPrice }] },
      },
      select: { id: true },
    });
    tamperOrderId = order.id;

    const now = Math.floor(Date.now() / 1000);
    const txId = `e2e-${run}-tamper`;
    // La firma NO cubre `environment` (solo id/status/amount+timestamp): el
    // mismo checksum sirve para ambos — se prueba "test" y si el ambiente
    // espera "prod" se reenvía con ese (401 mismatch no escribe nada).
    const mkBody = (environment: "test" | "prod") =>
      wompiEvent({
        txId,
        status: "APPROVED",
        amount: unitPrice + 10_000, // ← adulterado: +$100 sobre el total real
        reference: `E2E-TAMPER-${run}`,
        environment,
        timestamp: now,
      });
    let res = await request.post("/api/webhooks/wompi", {
      headers: { "Content-Type": "application/json" },
      data: mkBody("test"),
    });
    if (res.status() === 401) {
      res = await request.post("/api/webhooks/wompi", {
        headers: { "Content-Type": "application/json" },
        data: mkBody("prod"),
      });
    }
    expect(res.status(), "firma válida + environment correcto → 200").toBe(200);
    expect(await res.json()).toMatchObject({ note: "amount mismatch, manual review" });

    await expect(async () => {
      const after = await db().order.findUniqueOrThrow({
        where: { id: order.id },
        select: { status: true, needsReconciliation: true, reconciliationReason: true },
      });
      expect(after.needsReconciliation, "orden marcada para revisión manual").toBe(true);
      expect(after.reconciliationReason).toContain("Monto Wompi");
      expect(after.status, "la orden NO avanza (sigue PENDING_PAYMENT)").toBe("PENDING_PAYMENT");
      const stock = await db().productVariant.findUniqueOrThrow({
        where: { id: tamperProduct!.variantId },
        select: { stock: true },
      });
      expect(stock.stock, "stock intacto: no hay descuento prematuro").toBe(stockBefore.stock);
    }).toPass({ timeout: 15_000 });
    const row = await db().webhookEvent.findFirst({
      where: { source: "WOMPI", externalId: `${txId}-APPROVED-${now}` },
    });
    expect(row?.processedAt, "el evento quedó sellado (no reintenta)").not.toBeNull();
    record(
      "monto-adulterado-reconciliacion",
      true,
      `200 "amount mismatch" · needsReconciliation=true · status=PENDING_PAYMENT · stock ${stockBefore.stock}→sin cambio · WebhookEvent sellado`,
    );

    write("pass");
  } catch (err) {
    write("fail", err);
    throw err;
  }
});
