/*
 * Unit — GET /api/health/all (auditoría 2026-08-24, C-3):
 *  - Público: la respuesta agregada NO incluye `version` (SHA exacto del deploy)
 *    ni `environment` — el SHA identifica el commit en el repo público.
 *  - Con header `x-cron-secret` válido sí se incluyen (el monitor externo puede
 *    seguir sabiendo QUÉ deploy está mirando).
 * fetch global stubbed (sub-probes OK) y rateLimit mockeado — sin DB ni red.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rateLimit } = vi.hoisted(() => ({
  rateLimit: vi.fn(async (_key: string, _limit?: number, _windowSeconds?: number) => ({
    allowed: true,
    count: 1,
    resetAt: new Date(),
  })),
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/origin", () => ({ getTrustedSelfBaseUrl: () => "https://self.test" }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "./route";

const SECRET = "cron-secret-de-prueba";

function req(secret?: string): Request {
  const headers: Record<string, string> = { "x-vercel-forwarded-for": "203.0.113.7" };
  if (secret !== undefined) headers["x-cron-secret"] = secret;
  return new Request("https://lucamsshop.com/api/health/all", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue({ allowed: true, count: 1, resetAt: new Date() });
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123def456");
  vi.stubEnv("VERCEL_ENV", "production");
  // Sub-probes: todos responden ok con latencia.
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "ok", latencyMs: 5 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/health/all — versión/entorno gated por secreto (C-3)", () => {
  it("sin secreto: no expone version ni environment", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body).not.toHaveProperty("version");
    expect(body).not.toHaveProperty("environment");
    expect(JSON.stringify(body)).not.toContain("abc123def456");
  });

  it("con secreto válido: incluye version y environment", async () => {
    const res = await GET(req(SECRET));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.version).toBe("abc123def456");
    expect(body.environment).toBe("production");
  });

  it("con secreto inválido: no expone version", async () => {
    const res = await GET(req("otro-secreto"));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("version");
  });

  it("la key de rate-limit lleva la IP hasheada (C-8)", async () => {
    await GET(req());
    const key = rateLimit.mock.calls[0][0] as string;
    expect(key).toMatch(/^health_all:ip:[0-9a-f]{16}$/);
    expect(key).not.toContain("203.0.113.7");
  });
});
