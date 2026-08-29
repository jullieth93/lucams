/*
 * Unit — GET /api/catalog/products: parsing defensivo de query params
 * (auditoría 2026-08-24, C-7/C-10) y key de rate-limit hasheada (C-8).
 *
 * Todo mockeado (sin DB): la ruta es una capa delgada sobre listCatalogProducts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { rateLimit, listCatalogProducts } = vi.hoisted(() => ({
  rateLimit: vi.fn(async (_key: string, _limit?: number, _windowSeconds?: number) => ({
    allowed: true,
    count: 1,
    resetAt: new Date(),
  })),
  listCatalogProducts: vi.fn(async (_filters: Record<string, unknown>) => []),
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/catalog", () => ({ listCatalogProducts }));

import { GET } from "./route";

function req(query = ""): Request {
  return new Request(`https://lucamsshop.com/api/catalog/products${query}`, {
    headers: { "x-vercel-forwarded-for": "203.0.113.7" },
  });
}

function lastFilters(): Record<string, unknown> {
  const calls = listCatalogProducts.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue({ allowed: true, count: 1, resetAt: new Date() });
});

describe("GET /api/catalog/products — hardening de params", () => {
  it("priceMin/priceMax no numéricos quedan undefined (NaN-guard, C-10)", async () => {
    const res = await GET(req("?priceMin=abc&priceMax=xyz"));
    expect(res.status).toBe(200);
    expect(lastFilters().priceMin).toBeUndefined();
    expect(lastFilters().priceMax).toBeUndefined();
  });

  it("priceMin/priceMax negativos quedan undefined", async () => {
    await GET(req("?priceMin=-5000&priceMax=-1"));
    expect(lastFilters().priceMin).toBeUndefined();
    expect(lastFilters().priceMax).toBeUndefined();
  });

  it("priceMin/priceMax válidos pasan como enteros", async () => {
    await GET(req("?priceMin=10000&priceMax=50000"));
    expect(lastFilters().priceMin).toBe(10000);
    expect(lastFilters().priceMax).toBe(50000);
  });

  it("offset se clampa a 10_000 por arriba y a 0 por abajo (C-7)", async () => {
    await GET(req("?offset=99999999"));
    expect(lastFilters().offset).toBe(10_000);
    await GET(req("?offset=-50"));
    expect(lastFilters().offset).toBe(0);
    await GET(req("?offset=240"));
    expect(lastFilters().offset).toBe(240);
  });

  it("la key de rate-limit lleva la IP hasheada, nunca en claro (C-8)", async () => {
    await GET(req());
    const key = rateLimit.mock.calls[0][0] as string;
    expect(key).toMatch(/^catalog_products:ip:[0-9a-f]{16}$/);
    expect(key).not.toContain("203.0.113.7");
  });

  it("429 cuando el rate-limit no permite", async () => {
    rateLimit.mockResolvedValue({ allowed: false, count: 99, resetAt: new Date() });
    const res = await GET(req());
    expect(res.status).toBe(429);
    expect(listCatalogProducts).not.toHaveBeenCalled();
  });
});
