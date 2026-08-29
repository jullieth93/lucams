/*
 * Unit — GET /api/health (auditoría 2026-08-24, C-3):
 *  - La respuesta pública NO incluye `version` (SHA del commit) ni `environment`:
 *    el SHA exacto identifica el commit en el repo público (fingerprinting).
 *  - Ahora tiene rate-limit por IP como el resto de los healthchecks (era el
 *    único sin límite), con la IP hasheada en la key (C-8).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { rateLimit } = vi.hoisted(() => ({
  rateLimit: vi.fn(async (_key: string, _limit?: number, _windowSeconds?: number) => ({
    allowed: true,
    count: 1,
    resetAt: new Date(),
  })),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));

import { GET } from "./route";

function req(): Request {
  return new Request("https://lucamsshop.com/api/health", {
    headers: { "x-vercel-forwarded-for": "203.0.113.7" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue({ allowed: true, count: 1, resetAt: new Date() });
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123def456");
  vi.stubEnv("VERCEL_ENV", "production");
});

describe("GET /api/health — respuesta mínima pública (C-3)", () => {
  it("devuelve status/timestamp pero NO version ni environment", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.timestamp).toEqual(expect.any(String));
    expect(body).not.toHaveProperty("version");
    expect(body).not.toHaveProperty("environment");
    expect(JSON.stringify(body)).not.toContain("abc123def456");
  });

  it("aplica rate-limit por IP con key hasheada (era el único healthcheck sin límite)", async () => {
    await GET(req());
    const key = rateLimit.mock.calls[0][0] as string;
    expect(key).toMatch(/^health:ip:[0-9a-f]{16}$/);
    expect(key).not.toContain("203.0.113.7");
  });

  it("429 cuando se excede el límite", async () => {
    rateLimit.mockResolvedValue({ allowed: false, count: 99, resetAt: new Date() });
    const res = await GET(req());
    expect(res.status).toBe(429);
  });
});
