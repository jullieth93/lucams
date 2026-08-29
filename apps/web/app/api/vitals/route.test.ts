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
