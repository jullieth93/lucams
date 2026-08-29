/*
 * Unit — GET /api/catalog/search: cap de longitud de `q` (auditoría 2026-08-24,
 * C-6) y key de rate-limit hasheada (C-8). Todo mockeado (sin DB).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { rateLimit, searchCatalog } = vi.hoisted(() => ({
  rateLimit: vi.fn(async (_key: string, _limit?: number, _windowSeconds?: number) => ({
    allowed: true,
    count: 1,
    resetAt: new Date(),
  })),
  searchCatalog: vi.fn(async (_q: string, _limit?: number) => []),
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/catalog", () => ({ searchCatalog }));

import { GET } from "./route";

function req(q: string): Request {
  return new Request(`https://lucamsshop.com/api/catalog/search?q=${q}`, {
    headers: { "x-vercel-forwarded-for": "203.0.113.7" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue({ allowed: true, count: 1, resetAt: new Date() });
});

describe("GET /api/catalog/search — cap de q (C-6)", () => {
  it("trunca q a 120 chars antes de llamar searchCatalog", async () => {
    const long = "a".repeat(500);
    await GET(req(long));
    const q = searchCatalog.mock.calls[0][0] as string;
    expect(q).toHaveLength(120);
    expect(q).toBe("a".repeat(120));
  });

  it("trimea espacios antes de validar el mínimo de 2 chars", async () => {
    const res = await GET(req(encodeURIComponent("   x ")));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[]; message?: string };
    expect(body.results).toEqual([]);
    expect(searchCatalog).not.toHaveBeenCalled();
  });

  it("la key de rate-limit lleva la IP hasheada, nunca en claro (C-8)", async () => {
    await GET(req("jarron"));
    const key = rateLimit.mock.calls[0][0] as string;
    expect(key).toMatch(/^catalog_search:ip:[0-9a-f]{16}$/);
    expect(key).not.toContain("203.0.113.7");
  });
});
