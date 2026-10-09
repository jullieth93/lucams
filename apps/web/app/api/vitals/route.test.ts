/*
 * Unit — POST /api/vitals (auditoría 2026-08-24, C-1 + C-8):
 *  - Backstop GLOBAL de filas nuevas ("vitals:new-row:global", 3000/5 min)
 *    además del límite por IP: un botnet que rota IPs no puede inflar la tabla.
 *  - La key por IP va hasheada (ipKey) — la IP no queda en claro en
 *    rate_limit_buckets.
 * Prisma y rateLimit mockeados — sin DB.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { rateLimit, webVitalCreate } = vi.hoisted(() => ({
  rateLimit: vi.fn(async (_key: string, _limit?: number, _windowSeconds?: number) => ({
    allowed: true,
    count: 1,
    resetAt: new Date(),
  })),
  webVitalCreate: vi.fn(async () => ({})),
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/db", () => ({ prisma: { webVital: { create: webVitalCreate } } }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "./route";

const VALID_BODY = {
  name: "LCP",
  value: 1234.5,
  rating: "good",
  delta: 100,
  route: "/producto/[slug]",
  sessionId: "sess-1",
};

function req(body: unknown = VALID_BODY): Request {
  return new Request("https://lucamsshop.com/api/vitals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-forwarded-for": "203.0.113.7",
    },
    body: JSON.stringify(body),
  });
}

const allowed = { allowed: true, count: 1, resetAt: new Date() };
const blocked = { allowed: false, count: 9999, resetAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue(allowed);
});

describe("POST /api/vitals — backstop global (C-1)", () => {
  it("consulta el límite por IP y el tope global antes de insertar", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(rateLimit).toHaveBeenCalledTimes(2);
    const keys = rateLimit.mock.calls.map((c) => (c as unknown as [string, number, number])[0]);
    expect(keys[0]).toMatch(/^vitals:ip:[0-9a-f]{16}$/); // C-8: IP hasheada
    expect(keys[0]).not.toContain("203.0.113.7");
    expect(keys[1]).toBe("vitals:new-row:global");
    expect(webVitalCreate).toHaveBeenCalledTimes(1);
  });

  it("con el tope global agotado NO inserta (y devuelve 200 ok:false para que el beacon no reintente)", async () => {
    rateLimit.mockImplementation(async (key: string) =>
      key === "vitals:new-row:global" ? blocked : allowed,
    );
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
    expect(webVitalCreate).not.toHaveBeenCalled();
  });

  it("con el límite por IP excedido devuelve 429 y no consulta el global", async () => {
    rateLimit.mockResolvedValueOnce(blocked);
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(rateLimit).toHaveBeenCalledTimes(1);
    expect(webVitalCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/vitals — métricas por pageview (Paquete C, 2026-10-09)", () => {
  it("acepta LONGTASK (value=ms totales, delta=cantidad)", async () => {
    const res = await POST(
      req({ name: "LONGTASK", value: 340, rating: "needs-improvement", delta: 3, route: "/" }),
    );
    expect(res.status).toBe(200);
    expect(webVitalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "LONGTASK", value: 340, delta: 3 }),
    });
  });

  it("acepta PAGEWEIGHT (value=bytes, delta=recursos)", async () => {
    const res = await POST(
      req({ name: "PAGEWEIGHT", value: 1_800_000, rating: "good", delta: 42, route: "/" }),
    );
    expect(res.status).toBe(200);
    expect(webVitalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "PAGEWEIGHT", value: 1_800_000 }),
    });
  });

  it("rechaza métricas fuera del enum", async () => {
    const res = await POST(req({ ...VALID_BODY, name: "MEMORY" }));
    expect(res.status).toBe(400);
    expect(webVitalCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/vitals — sessionId desde cookie cart_session (Paquete C)", () => {
  const CART_UUID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

  function reqWithCookie(body: unknown, cookie?: string): Request {
    return new Request("https://lucamsshop.com/api/vitals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vercel-forwarded-for": "203.0.113.7",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it("sin sessionId en el payload, toma la cookie cart_session (HttpOnly — el cliente no la lee)", async () => {
    const { sessionId: _omit, ...noSession } = VALID_BODY;
    const res = await POST(reqWithCookie(noSession, `cart_session=${CART_UUID}; other=1`));
    expect(res.status).toBe(200);
    expect(webVitalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessionId: CART_UUID }),
    });
  });

  it("el sessionId del payload tiene prioridad sobre la cookie", async () => {
    const res = await POST(reqWithCookie(VALID_BODY, `cart_session=${CART_UUID}`));
    expect(res.status).toBe(200);
    expect(webVitalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessionId: "sess-1" }),
    });
  });

  it("cookie con valor que no es UUID se ignora (persiste null)", async () => {
    const { sessionId: _omit, ...noSession } = VALID_BODY;
    const res = await POST(reqWithCookie(noSession, "cart_session=../../etc/passwd"));
    expect(res.status).toBe(200);
    expect(webVitalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessionId: null }),
    });
  });

  it("sin cookie persiste null", async () => {
    const { sessionId: _omit, ...noSession } = VALID_BODY;
    const res = await POST(reqWithCookie(noSession));
    expect(res.status).toBe(200);
    expect(webVitalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessionId: null }),
    });
  });
});

describe("POST /api/vitals — target del INP (2026-09-18)", () => {
  it("persiste el selector del elemento cuando el payload lo trae", async () => {
    const res = await POST(
      req({
        name: "INP",
        value: 232,
        rating: "needs-improvement",
        delta: 232,
        route: "/estudio/[slug]",
        target: "main.bg-brand-cream.flex-1#contenido",
      }),
    );
    expect(res.status).toBe(200);
    expect(webVitalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "INP",
        target: "main.bg-brand-cream.flex-1#contenido",
      }),
    });
  });

  it("sin target en el payload persiste null (retrocompatible)", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(webVitalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ target: null }),
    });
  });
});
