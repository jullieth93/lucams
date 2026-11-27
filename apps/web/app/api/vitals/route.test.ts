/*
 * Unit — POST /api/vitals (auditoría 2026-08-24, C-1 + C-8):
 *  - Backstop GLOBAL de filas nuevas ("vitals:new-row:global", 3000/5 min)
 *    además del límite por IP: un botnet que rota IPs no puede inflar la tabla.
 *  - La key por IP va hasheada (ipKey) — la IP no queda en claro en
 *    rate_limit_buckets.
 * Prisma y rateLimit mockeados — sin DB.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { rateLimit, webVitalCreate, webVitalCreateMany } = vi.hoisted(() => ({
  rateLimit: vi.fn(
    async (_key: string, _limit?: number, _windowSeconds?: number, _cost?: number) => ({
      allowed: true,
      count: 1,
      resetAt: new Date(),
    }),
  ),
  webVitalCreate: vi.fn(async () => ({})),
  webVitalCreateMany: vi.fn(async () => ({ count: 0 })),
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/db", () => ({
  prisma: { webVital: { create: webVitalCreate, createMany: webVitalCreateMany } },
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST, VITALS_MAX_BATCH_SIZE } from "./route";

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

describe("POST /api/vitals — techo de valor por métrica (auditoría RUM 2026-10-20)", () => {
  it("INP de 28680ms (artefacto real de STG 2026-10-02) NO se persiste: 200 ok:false + warn", async () => {
    const res = await POST(
      req({ name: "INP", value: 28680, rating: "poor", delta: 28680, route: "/" }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
    expect(webVitalCreate).not.toHaveBeenCalled();
  });

  it("INP de 10s exactos (techo) sí se persiste; 10.001s no", async () => {
    const ok = await POST(
      req({ name: "INP", value: 10_000, rating: "poor", delta: 10_000, route: "/" }),
    );
    expect(ok.status).toBe(200);
    expect(webVitalCreate).toHaveBeenCalledTimes(1);
    webVitalCreate.mockClear();
    const over = await POST(
      req({ name: "INP", value: 10_001, rating: "poor", delta: 10_001, route: "/" }),
    );
    expect(((await over.json()) as { ok: boolean }).ok).toBe(false);
    expect(webVitalCreate).not.toHaveBeenCalled();
  });

  it("LCP tiene techo más holgado (60s): 45s se persiste", async () => {
    const res = await POST(req({ ...VALID_BODY, value: 45_000, rating: "poor" }));
    expect(res.status).toBe(200);
    expect(webVitalCreate).toHaveBeenCalledTimes(1);
  });

  it("valores negativos los rechaza el schema (400)", async () => {
    const res = await POST(req({ ...VALID_BODY, value: -5 }));
    expect(res.status).toBe(400);
    expect(webVitalCreate).not.toHaveBeenCalled();
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

describe("POST /api/vitals — soporte de lote acotado (Fase 4 · #15)", () => {
  it("persiste un lote válido en una sola llamada createMany y mantiene compatibilidad con payload único", async () => {
    const res = await POST(
      req({
        metrics: [
          { name: "TTFB", value: 180, rating: "good", delta: 180, route: "/" },
          { name: "FCP", value: 850, rating: "good", delta: 850, route: "/" },
          {
            name: "LCP",
            value: 1450,
            rating: "good",
            delta: 1450,
            route: "/producto/[slug]",
            target: "img.hero",
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, accepted: 3 });
    // H-1 anti-amplificación: cobra el costo real de 3 filas en IP-rows y en el backstop global.
    expect(rateLimit).toHaveBeenCalledWith(expect.stringMatching(/^vitals:rows:ip:/), 120, 60, 3);
    expect(rateLimit).toHaveBeenCalledWith("vitals:new-row:global", 3000, 300, 3);
    expect(webVitalCreate).not.toHaveBeenCalled();
    expect(webVitalCreateMany).toHaveBeenCalledTimes(1);
    expect(webVitalCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ name: "TTFB", value: 180, route: "/" }),
        expect.objectContaining({ name: "FCP", value: 850, route: "/" }),
        expect.objectContaining({ name: "LCP", value: 1450, target: "img.hero" }),
      ],
    });
  });

  it("descarta únicamente métricas fuera de rango dentro de un lote válido", async () => {
    const res = await POST(
      req({
        metrics: [
          { name: "INP", value: 28_680, rating: "poor", delta: 28_680, route: "/" },
          { name: "LCP", value: 1200, rating: "good", delta: 1200, route: "/" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, accepted: 1, dropped: 1 });
    expect(webVitalCreate).toHaveBeenCalledTimes(1);
    expect(webVitalCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "LCP", value: 1200 }),
    });
  });

  it("rechaza con 400 lote vacío, lote excedido (>VITALS_MAX_BATCH_SIZE) o con campos desconocidos", async () => {
    const emptyRes = await POST(req({ metrics: [] }));
    expect(emptyRes.status).toBe(400);

    const oversized = Array.from({ length: VITALS_MAX_BATCH_SIZE + 1 }, () => ({
      ...VALID_BODY,
    }));
    const overRes = await POST(req({ metrics: oversized }));
    expect(overRes.status).toBe(400);

    const extraFieldRes = await POST(req({ metrics: [VALID_BODY], extra: true }));
    expect(extraFieldRes.status).toBe(400);

    const malformedItemRes = await POST(
      req({ metrics: [VALID_BODY, { ...VALID_BODY, name: "INVALID_METRIC" }] }),
    );
    expect(malformedItemRes.status).toBe(400);

    expect(webVitalCreate).not.toHaveBeenCalled();
    expect(webVitalCreateMany).not.toHaveBeenCalled();
  });

  it("rechaza con 413 un payload que excede el límite de 16 KB", async () => {
    const huge = new Request("https://lucamsshop.com/api/vitals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-vercel-forwarded-for": "203.0.113.7",
      },
      body: JSON.stringify({ metrics: [VALID_BODY], padding: "x".repeat(17 * 1024) }),
    });
    const res = await POST(huge);
    expect(res.status).toBe(413);
    expect(webVitalCreate).not.toHaveBeenCalled();
    expect(webVitalCreateMany).not.toHaveBeenCalled();
  });

  it("rechaza con 429 si un lote excede el presupuesto por IP de filas (anti-amplificación H-1)", async () => {
    rateLimit.mockImplementation(async (key: string) =>
      key.startsWith("vitals:rows:ip:") ? blocked : allowed,
    );
    const res = await POST(
      req({
        metrics: [
          { name: "TTFB", value: 180, rating: "good", delta: 180, route: "/" },
          { name: "LCP", value: 1200, rating: "good", delta: 1200, route: "/" },
        ],
      }),
    );
    expect(res.status).toBe(429);
    expect(webVitalCreateMany).not.toHaveBeenCalled();
  });
});
