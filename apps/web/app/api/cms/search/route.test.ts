/*
 * Unit — GET /api/cms/search: cap de longitud de `q` (auditoría 2026-08-24, C-6).
 * _helpers (rate-limit/IP) y lib/cms mockeados — sin DB ni contexto Next.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { applyRateLimit, searchCmsBlocks } = vi.hoisted(() => ({
  applyRateLimit: vi.fn(async (_ip: string) => null),
  searchCmsBlocks: vi.fn(async (_q: string) => []),
}));

vi.mock("../_helpers", () => ({
  extractIp: async () => "203.0.113.7",
  applyRateLimit,
  withCmsCacheHeaders: (body: object) => Response.json(body),
}));
vi.mock("@/lib/cms", () => ({ searchCmsBlocks }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  applyRateLimit.mockResolvedValue(null);
});

describe("GET /api/cms/search — cap de q (C-6)", () => {
  it("trunca q a 120 chars antes de llamar searchCmsBlocks", async () => {
    const long = "b".repeat(400);
    const res = await GET(new Request(`https://lucamsshop.com/api/cms/search?q=${long}`));
    expect(res.status).toBe(200);
    const q = searchCmsBlocks.mock.calls[0][0] as string;
    expect(q).toHaveLength(120);
  });

  it("q vacío tras trim sigue devolviendo 400 problem+json", async () => {
    const res = await GET(
      new Request(`https://lucamsshop.com/api/cms/search?q=${encodeURIComponent("   ")}`),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toContain("application/problem+json");
    expect(searchCmsBlocks).not.toHaveBeenCalled();
  });
});
