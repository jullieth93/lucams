/*
 * Unit tests — ROUTE del webhook Resend (app/api/webhooks/resend/route.ts).
 *
 * FOCO (E1, 2026-10-07): jerarquía de terminalidad del upsert por resendId.
 * Antes guardaba UN row por email con el ÚLTIMO tipo y solo protegía
 * bounced/complained (D-2) → un email entregado y luego abierto terminaba
 * type=email.opened y dejaba de contar como "Entregado" en el panel de
 * entregabilidad (features/observability/email-deliverability.ts).
 *
 * Reglas bajo test:
 *  - delivered/delayed/bounced/complained NUNCA se degradan por opened/clicked.
 *  - opened/clicked SÍ se actualizan entre sí.
 *  - occurredAt nunca retrocede (evento viejo → se ignora).
 *  - bounced/complained no se degradan por NADA no-supresor (D-2, preservado).
 *
 * Sin DB: prisma mockeado ($transaction ejecuta el callback con el mismo stub);
 * firma Svix real (HMAC) como en route.integration.test.ts, que cubre el path
 * end-to-end contra DB.
 */

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RUN = `whunit${Date.now()}`.toLowerCase();
const SECRET = `whsec_${Buffer.from(`${RUN}-signing-key`).toString("base64")}`;

const state = vi.hoisted(() => ({
  existing: null as { type: string; occurredAt: Date } | null,
  upserts: [] as Array<{ update: Record<string, unknown>; create: Record<string, unknown> }>,
}));

let currentHeaders = new Headers();
vi.mock("next/headers", () => ({
  headers: async () => currentHeaders,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        emailEvent: {
          findUnique: vi.fn(async () => state.existing),
          upsert: vi.fn(async (arg: { update: never; create: never }) => {
            state.upserts.push(arg);
            return {};
          }),
        },
      }),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/security-events", () => ({
  recordSecurityEvent: vi.fn(async () => {}),
  SECURITY_EVENT: { WEBHOOK_INVALID_SIGNATURE: "webhook_invalid_signature" },
}));

import { POST } from "@/app/api/webhooks/resend/route";

let msgSeq = 0;
async function postEvent(opts: {
  emailId?: string;
  type: string;
  occurredAt: string;
}): Promise<Response> {
  const rawBody = JSON.stringify({
    type: opts.type,
    created_at: opts.occurredAt,
    data: {
      email_id: opts.emailId ?? "re_unit_1",
      to: ["clienta@example.com"],
      from: "tienda@lucamsshop.com",
      subject: "Test",
    },
  });
  const now = Math.floor(Date.now() / 1000);
  const id = `msg_${RUN}_${++msgSeq}`;
  const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${now}.${rawBody}`).digest("base64");
  currentHeaders = new Headers({
    "svix-id": id,
    "svix-timestamp": String(now),
    "svix-signature": `v1,${sig}`,
    "content-type": "application/json",
  });
  return POST(
    new Request("http://localhost/api/webhooks/resend", { method: "POST", body: rawBody }),
  );
}

beforeEach(() => {
  vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
  state.existing = null;
  state.upserts = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("webhook Resend — jerarquía de terminalidad (E1)", () => {
  it("delivered y luego opened → la fila NO se degrada (sigue contando como entregado)", async () => {
    state.existing = { type: "email.delivered", occurredAt: new Date("2026-10-01T10:00:00Z") };

    const res = await postEvent({ type: "email.opened", occurredAt: "2026-10-01T11:00:00Z" });

    expect(res.status).toBe(200); // 200 igual: que Resend no reintente en ciclo
    expect(state.upserts).toHaveLength(0);
  });

  it("delivered y luego clicked → tampoco degrada", async () => {
    state.existing = { type: "email.delivered", occurredAt: new Date("2026-10-01T10:00:00Z") };

    const res = await postEvent({ type: "email.clicked", occurredAt: "2026-10-01T11:00:00Z" });

    expect(res.status).toBe(200);
    expect(state.upserts).toHaveLength(0);
  });

  it("delayed y luego opened → el diferido (estado de entrega) manda", async () => {
    state.existing = { type: "email.delayed", occurredAt: new Date("2026-10-01T10:00:00Z") };

    await postEvent({ type: "email.opened", occurredAt: "2026-10-01T11:00:00Z" });

    expect(state.upserts).toHaveLength(0);
  });

  it("bounced y luego clicked → protegido por AMBAS guardas (D-2 + E1)", async () => {
    state.existing = { type: "email.bounced", occurredAt: new Date("2026-10-01T10:00:00Z") };

    await postEvent({ type: "email.clicked", occurredAt: "2026-10-01T11:00:00Z" });

    expect(state.upserts).toHaveLength(0);
  });

  it("opened y luego clicked → SÍ actualizan entre sí (upsert con el nuevo tipo)", async () => {
    state.existing = { type: "email.opened", occurredAt: new Date("2026-10-01T10:00:00Z") };

    const res = await postEvent({ type: "email.clicked", occurredAt: "2026-10-01T11:00:00Z" });

    expect(res.status).toBe(200);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].update.type).toBe("email.clicked");
  });

  it("opened viejo (occurredAt anterior al almacenado) → se ignora: occurredAt no retrocede", async () => {
    state.existing = { type: "email.opened", occurredAt: new Date("2026-10-01T12:00:00Z") };

    await postEvent({ type: "email.clicked", occurredAt: "2026-10-01T11:00:00Z" });

    expect(state.upserts).toHaveLength(0);
  });

  it("sent y luego delivered → el estado de entrega sí actualiza (flujo normal)", async () => {
    state.existing = { type: "email.sent", occurredAt: new Date("2026-10-01T10:00:00Z") };

    await postEvent({ type: "email.delivered", occurredAt: "2026-10-01T10:05:00Z" });

    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].update.type).toBe("email.delivered");
  });

  it("delivered y luego bounced (supresor nuevo) → SÍ actualiza: el rebote gana siempre", async () => {
    state.existing = { type: "email.delivered", occurredAt: new Date("2026-10-01T10:00:00Z") };

    await postEvent({ type: "email.bounced", occurredAt: "2026-10-01T10:05:00Z" });

    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].update.type).toBe("email.bounced");
  });

  it("evento nuevo (sin fila previa) → crea con el tipo del evento (rama create)", async () => {
    state.existing = null;

    const res = await postEvent({ type: "email.delivered", occurredAt: "2026-10-01T10:00:00Z" });

    expect(res.status).toBe(200);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].create.type).toBe("email.delivered");
    expect(state.upserts[0].create.resendId).toBe("re_unit_1");
  });
});
