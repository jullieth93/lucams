/*
 * Unit — GET /api/designs/<id>/render-status (ADR-131, 2026-10-13): el polling del Estudio
 * que muestra el progreso real del render 300 DPI. Cubre el contrato de seguridad (un diseño
 * ajeno responde 404, igual que uno inexistente — sin oráculo de ids), el rate-limit y la
 * forma mínima de la respuesta. Todo mockeado (auth, cart-session, rate-limit, services).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    customerId: null as string | null,
    sessionId: "sess_poll" as string | null,
    rateLimitDeny: false,
    ownedDesign: null as null | { id: string; status: string; productionUrls: string[] },
    job: null as null | { status: string; totalUnits: number; doneUnits: number },
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-vercel-forwarded-for": "203.0.113.10" }),
}));
vi.mock("@/lib/auth", () => ({
  getCurrentCustomer: async () =>
    state.customerId ? { customer: { id: state.customerId } } : null,
}));
vi.mock("@/lib/cart-session", () => ({ peekCartSession: async () => state.sessionId }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ allowed: !state.rateLimitDeny, count: 1, resetAt: new Date() }),
}));
vi.mock("@/features/personalization/service", () => ({
  getOwnedDesign: async () => state.ownedDesign,
}));
vi.mock("@/features/personalization/render-job-service", () => ({
  getRenderJobProgress: async () => state.job,
}));

import { GET } from "./route";

function call(designId = "design_1") {
  return GET(new Request(`https://x/api/designs/${designId}/render-status`), {
    params: Promise.resolve({ designId }),
  });
}

describe("GET /api/designs/<id>/render-status", () => {
  beforeEach(() => {
    state.customerId = null;
    state.sessionId = "sess_poll";
    state.rateLimitDeny = false;
    state.ownedDesign = { id: "design_1", status: "READY", productionUrls: [] };
    state.job = { status: "PROCESSING", totalUnits: 36, doneUnits: 12 };
  });

  it("devuelve el progreso real del job al dueño del diseño", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      designStatus: "READY",
      productionReady: false,
      job: { status: "PROCESSING", totalUnits: 36, doneUnits: 12 },
    });
  });

  it("diseño ajeno o inexistente → 404 (sin oráculo de ids)", async () => {
    state.ownedDesign = null;
    const res = await call("design_ajeno");
    expect(res.status).toBe(404);
  });

  it("sin job (diseño con render síncrono viejo o ya integrado) → job null", async () => {
    state.job = null;
    state.ownedDesign = { id: "design_1", status: "READY", productionUrls: ["d/slot-01.png"] };
    const res = await call();
    const body = await res.json();
    expect(body.job).toBeNull();
    expect(body.productionReady).toBe(true);
  });

  it("rate-limit → 429", async () => {
    state.rateLimitDeny = true;
    const res = await call();
    expect(res.status).toBe(429);
  });
});
