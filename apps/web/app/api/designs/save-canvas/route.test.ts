/*
 * Unit — POST /api/designs/save-canvas (ronda 2 QA 2026-10-08): mismo contrato que
 * saveCanvasAction (Zod + ownership + saveCanvas) para el sendBeacon del flush.
 * Todo mockeado (service, auth, cart-session, rate-limit, logger).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    saveCalls: [] as Array<Record<string, unknown>>,
    saveError: null as Error | null,
    customerId: null as string | null,
    sessionId: "sess_beacon" as string | null,
    rateLimitDeny: false,
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-vercel-forwarded-for": "203.0.113.9" }),
}));
vi.mock("@/lib/auth", () => ({
  getCurrentCustomer: async () =>
    state.customerId ? { customer: { id: state.customerId } } : null,
}));
vi.mock("@/lib/cart-session", () => ({ peekCartSession: async () => state.sessionId }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: !state.rateLimitDeny, count: 1, resetAt: new Date() }),
}));
vi.mock("@/features/personalization/service", () => ({
  saveCanvas: async (args: Record<string, unknown>) => {
    state.saveCalls.push(args);
    if (state.saveError) throw state.saveError;
  },
}));

import { POST } from "./route";

const VALID_CANVAS = {
  version: 2,
  unitTemplate: { version: 1, stage: { width: 100, height: 100 }, layers: [] },
  slotCount: 1,
  slots: [],
  gridLayout: { cols: 1, rows: 1, gap: 0 },
};

function req(body: unknown): Request {
  return new Request("https://x/api/designs/save-canvas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/designs/save-canvas (beacon flush del Estudio)", () => {
  beforeEach(() => {
    state.saveCalls = [];
    state.saveError = null;
    state.customerId = null;
    state.sessionId = "sess_beacon";
    state.rateLimitDeny = false;
  });

  it("guarda con la sesión anónima de la cookie (200)", async () => {
    const res = await POST(req({ designId: "d1", canvasData: VALID_CANVAS }));
    expect(res.status).toBe(200);
    expect(state.saveCalls).toHaveLength(1);
    expect(state.saveCalls[0]).toMatchObject({
      designId: "d1",
      customerId: null,
      sessionId: "sess_beacon",
    });
  });

  it("logueado: ownership por customerId (sessionId null)", async () => {
    state.customerId = "cust_1";
    const res = await POST(req({ designId: "d1", canvasData: VALID_CANVAS }));
    expect(res.status).toBe(200);
    expect(state.saveCalls[0]).toMatchObject({ customerId: "cust_1", sessionId: null });
  });

  it("JSON inválido → 400 sin tocar el service", async () => {
    const res = await POST(req("{not json"));
    expect(res.status).toBe(400);
    expect(state.saveCalls).toHaveLength(0);
  });

  it("payload que no pasa el schema → 400", async () => {
    const res = await POST(req({ designId: "", canvasData: null }));
    expect(res.status).toBe(400);
    expect(state.saveCalls).toHaveLength(0);
  });

  it("rate-limit → 429", async () => {
    state.rateLimitDeny = true;
    const res = await POST(req({ designId: "d1", canvasData: VALID_CANVAS }));
    expect(res.status).toBe(429);
    expect(state.saveCalls).toHaveLength(0);
  });

  it("error del service (ownership/estado) → 500", async () => {
    state.saveError = new Error("Design is READY — only DRAFT can be edited");
    const res = await POST(req({ designId: "d1", canvasData: VALID_CANVAS }));
    expect(res.status).toBe(500);
  });
});
