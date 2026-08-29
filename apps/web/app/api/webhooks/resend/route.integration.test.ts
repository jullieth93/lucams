/*
 * Integración — ROUTE del webhook Resend (app/api/webhooks/resend/route.ts).
 *
 * Ejercita el PATH REAL: POST → verificación de firma Svix (HMAC-SHA256, clave base64
 * tras `whsec_`, contenido `${id}.${ts}.${body}`, tolerancia 5 min) → upsert EmailEvent
 * en DB. FOCO (D-2, auditoría 2026-08-24): el upsert last-write-wins dejaba que un
 * evento viejo/reordenado pisara email.bounced/email.complained → la supresión de
 * lib/resend.ts dejaba de aplicar y se re-escribía a direcciones rebotadas/quejadas.
 *
 * Corre contra la DB de dev (DATABASE_URL). Aislamiento: resendId RUN-prefijados;
 * afterAll borra los EmailEvent creados.
 */

import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// El setup corre contra la Supabase de dev por red; el default de 5s es demasiado
// ajustado y da timeouts flaky bajo carga (mismo criterio que aveonline/route).
vi.setConfig({ testTimeout: 20_000, hookTimeout: 30_000 });

// next/headers → el route hace `await headers()`. Fuera de un request context real eso
// lanza; el mock devuelve los headers Svix que el helper fija antes de cada POST.
// `currentHeaders` solo se LEE al invocar headers() (ya inicializado para entonces).
let currentHeaders = new Headers();
vi.mock("next/headers", () => ({
  headers: async () => currentHeaders,
}));

import { prisma } from "@/lib/db";
import { POST } from "@/app/api/webhooks/resend/route";

const hasDb = Boolean(process.env.DATABASE_URL);
const RUN = `whresend${Date.now()}${Math.floor(Math.random() * 1e6)}`.toLowerCase();
// Secreto Svix sintético del run: `whsec_` + base64 (la clave HMAC son los bytes decodificados).
const SECRET = `whsec_${Buffer.from(`${RUN}-signing-key`).toString("base64")}`;

const createdResendIds: string[] = [];

function svixHeaders(id: string, tsSec: number, rawBody: string): Headers {
  const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${tsSec}.${rawBody}`).digest("base64");
  return new Headers({
    "svix-id": id,
    "svix-timestamp": String(tsSec),
    "svix-signature": `v1,${sig}`,
    "content-type": "application/json",
  });
}

let msgSeq = 0;
async function postEvent(opts: {
  emailId: string;
  type: string;
  occurredAt: string; // ISO — viaja como `created_at` del evento
  badSignature?: boolean;
}): Promise<Response> {
  const rawBody = JSON.stringify({
    type: opts.type,
    created_at: opts.occurredAt,
    data: {
      email_id: opts.emailId,
      to: [`${RUN}@lucams.test`],
      from: "tienda@lucamsshop.com",
      subject: `Test ${RUN}`,
    },
  });
  const now = Math.floor(Date.now() / 1000);
  const id = `msg_${RUN}_${++msgSeq}`;
  currentHeaders = opts.badSignature
    ? new Headers({
        "svix-id": id,
        "svix-timestamp": String(now),
        "svix-signature": "v1,c2lnbmF0dXJlLWFkdWx0ZXJhdGE=",
        "content-type": "application/json",
      })
    : svixHeaders(id, now, rawBody);
  return POST(
    new Request("http://localhost/api/webhooks/resend", { method: "POST", body: rawBody }),
  );
}

describe.skipIf(!hasDb)("webhook Resend ROUTE — firma Svix + upsert con guardas (D-2)", () => {
  const prevSecret = process.env.RESEND_WEBHOOK_SECRET;

  beforeAll(() => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
  });

  afterAll(async () => {
    if (prevSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = prevSecret;
    await prisma.emailEvent
      .deleteMany({ where: { resendId: { in: createdResendIds } } })
      .catch(() => {});
  });

  it("firma inválida → 401 y NO se crea EmailEvent", async () => {
    const emailId = `re_${RUN}_badsig`;
    const res = await postEvent({
      emailId,
      type: "email.delivered",
      occurredAt: "2026-08-20T10:00:00.000Z",
      badSignature: true,
    });
    expect(res.status).toBe(401);
    const row = await prisma.emailEvent.findUnique({ where: { resendId: emailId } });
    expect(row).toBeNull();
  });

  it("evento nuevo → crea EmailEvent (rama create del upsert)", async () => {
    const emailId = `re_${RUN}_create`;
    createdResendIds.push(emailId);
    const res = await postEvent({
      emailId,
      type: "email.delivered",
      occurredAt: "2026-08-20T10:00:00.000Z",
    });
    expect(res.status).toBe(200);
    const row = await prisma.emailEvent.findUnique({ where: { resendId: emailId } });
    expect(row?.type).toBe("email.delivered");
    expect(row?.occurredAt.toISOString()).toBe("2026-08-20T10:00:00.000Z");
  });

  it("reintento del MISMO evento → 200 y sigue 1 fila (idempotencia por resendId)", async () => {
    const emailId = `re_${RUN}_retry`;
    createdResendIds.push(emailId);
    await postEvent({ emailId, type: "email.delivered", occurredAt: "2026-08-20T10:00:00.000Z" });
    const res = await postEvent({
      emailId,
      type: "email.delivered",
      occurredAt: "2026-08-20T10:00:00.000Z",
    });
    expect(res.status).toBe(200);
    const rows = await prisma.emailEvent.count({ where: { resendId: emailId } });
    expect(rows).toBe(1);
  });

  it("D-2: bounced y luego delivered REORDENADO (occurredAt más viejo) → la fila NO se degrada", async () => {
    const emailId = `re_${RUN}_reorder`;
    createdResendIds.push(emailId);
    // Llega primero el rebote (ocurrido más tarde)…
    await postEvent({ emailId, type: "email.bounced", occurredAt: "2026-08-20T12:00:00.000Z" });
    // …y después un delivered retrasado (ocurrido ANTES del rebote): el caso del hallazgo.
    const res = await postEvent({
      emailId,
      type: "email.delivered",
      occurredAt: "2026-08-20T09:00:00.000Z",
    });
    expect(res.status).toBe(200); // 200 igual: que Resend no reintente en ciclo
    const row = await prisma.emailEvent.findUnique({ where: { resendId: emailId } });
    expect(row?.type).toBe("email.bounced"); // la supresión sobrevive
    expect(row?.occurredAt.toISOString()).toBe("2026-08-20T12:00:00.000Z");
  });

  it("D-2: bounced y luego delivered con occurredAt MÁS NUEVO → tampoco degrada (el tipo supresor manda)", async () => {
    const emailId = `re_${RUN}_supp`;
    createdResendIds.push(emailId);
    await postEvent({ emailId, type: "email.bounced", occurredAt: "2026-08-20T10:00:00.000Z" });
    const res = await postEvent({
      emailId,
      type: "email.delivered",
      occurredAt: "2026-08-20T11:00:00.000Z", // más nuevo, pero no-supresor
    });
    expect(res.status).toBe(200);
    const row = await prisma.emailEvent.findUnique({ where: { resendId: emailId } });
    expect(row?.type).toBe("email.bounced");
  });

  it("evento VIEJO no-supresor (occurredAt anterior al almacenado) → se ignora, queda el más nuevo", async () => {
    const emailId = `re_${RUN}_stale`;
    createdResendIds.push(emailId);
    await postEvent({ emailId, type: "email.delivered", occurredAt: "2026-08-20T12:00:00.000Z" });
    const res = await postEvent({
      emailId,
      type: "email.sent",
      occurredAt: "2026-08-20T09:00:00.000Z",
    });
    expect(res.status).toBe(200);
    const row = await prisma.emailEvent.findUnique({ where: { resendId: emailId } });
    expect(row?.type).toBe("email.delivered");
    expect(row?.occurredAt.toISOString()).toBe("2026-08-20T12:00:00.000Z");
  });

  it("evento no-supresor MÁS NUEVO sí actualiza (comportamiento normal preservado)", async () => {
    const emailId = `re_${RUN}_newer`;
    createdResendIds.push(emailId);
    await postEvent({ emailId, type: "email.sent", occurredAt: "2026-08-20T10:00:00.000Z" });
    const res = await postEvent({
      emailId,
      type: "email.delivered",
      occurredAt: "2026-08-20T11:00:00.000Z",
    });
    expect(res.status).toBe(200);
    const row = await prisma.emailEvent.findUnique({ where: { resendId: emailId } });
    expect(row?.type).toBe("email.delivered");
    expect(row?.occurredAt.toISOString()).toBe("2026-08-20T11:00:00.000Z");
  });
});
