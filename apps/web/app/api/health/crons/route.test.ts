/*
 * Unit — GET /api/health/crons (auditoría 2026-08-24, C-4):
 *  - Público: respuesta MÍNIMA { status, timestamp } (503 si degraded) — los
 *    nombres de jobs, lastRunAt y disabled son topología operativa interna.
 *  - Con header `x-cron-secret` válido: detalle completo (jobs/overdue/disabled).
 * getCronHealth y rateLimit mockeados — sin DB.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rateLimit, getCronHealth } = vi.hoisted(() => ({
  rateLimit: vi.fn(async (_key: string, _limit?: number, _windowSeconds?: number) => ({
    allowed: true,
    count: 1,
    resetAt: new Date(),
  })),
  getCronHealth: vi.fn(async () => [
    {
      job: "alerts",
      label: "Alertas",
      intervalMs: 300_000,
      lastRunAt: new Date("2026-08-29T10:00:00Z"),
      overdue: false,
      pending: false,
      disabled: false,
    },
    {
      job: "daily-summary",
      label: "Resumen diario",
      intervalMs: 86_400_000,
      lastRunAt: new Date("2026-08-26T10:00:00Z"), // >2×24h → vencido de verdad
      overdue: true,
      pending: false,
      disabled: false,
    },
    {
      job: "review-request",
      label: "Solicitud de reseñas",
      intervalMs: 86_400_000,
      lastRunAt: null,
      overdue: false,
      pending: false,
      disabled: true,
    },
  ]),
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/features/observability/cron-heartbeat", () => ({ getCronHealth }));

import { GET } from "./route";

const SECRET = "cron-secret-de-prueba";

function req(secret?: string): Request {
  const headers: Record<string, string> = { "x-vercel-forwarded-for": "203.0.113.7" };
  if (secret !== undefined) headers["x-cron-secret"] = secret;
  return new Request("https://lucamsshop.com/api/health/crons", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimit.mockResolvedValue({ allowed: true, count: 1, resetAt: new Date() });
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health/crons — respuesta pública mínima (C-4)", () => {
  it("sin secreto: solo { status, timestamp } y 503 cuando hay jobs vencidos", async () => {
    const res = await GET(req());
    expect(res.status).toBe(503); // daily-summary está overdue en el mock
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("degraded");
    expect(body.timestamp).toEqual(expect.any(String));
    // Sin topología operativa: nada de jobs/overdue/disabled ni nombres.
    expect(body).not.toHaveProperty("jobs");
    expect(body).not.toHaveProperty("overdue");
    expect(body).not.toHaveProperty("disabled");
    expect(JSON.stringify(body)).not.toContain("daily-summary");
  });

  it("con secreto inválido: misma respuesta mínima", async () => {
    const res = await GET(req("secreto-equivocado"));
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("jobs");
  });

  it("con secreto válido: incluye el detalle completo de jobs", async () => {
    const res = await GET(req(SECRET));
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      status: string;
      overdue: Array<{ job: string }>;
      disabled: string[];
      jobs: Array<{ job: string }>;
    };
    expect(body.status).toBe("degraded");
    expect(body.overdue.map((o) => o.job)).toEqual(["daily-summary"]);
    expect(body.disabled).toEqual(["review-request"]);
    expect(body.jobs.map((j) => j.job)).toEqual(["alerts", "daily-summary", "review-request"]);
  });

  it("200 cuando ningún job está vencido", async () => {
    getCronHealth.mockResolvedValueOnce([
      {
        job: "alerts",
        label: "Alertas",
        intervalMs: 300_000,
        lastRunAt: new Date(),
        overdue: false,
        pending: false,
        disabled: false,
      },
    ]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("F-04: un cron recién agendado (pending, sin primer latido) NO degrada el health", async () => {
    getCronHealth.mockResolvedValueOnce([
      {
        job: "alerts",
        label: "Alertas",
        intervalMs: 300_000,
        lastRunAt: new Date(),
        overdue: false,
        pending: false,
        disabled: false,
      },
      {
        job: "purge-delivered-designs",
        label: "Purga diseños entregados",
        intervalMs: 86_400_000,
        lastRunAt: null,
        overdue: false,
        pending: true,
        disabled: false,
      },
    ]);
    // Sin secreto: 200 con la respuesta mínima (el monitor externo no alerta).
    const pub = await GET(req());
    expect(pub.status).toBe(200);
    expect(((await pub.json()) as { status: string }).status).toBe("ok");

    // Con secreto: el detalle reporta el job como pending (visible, no degradado).
    getCronHealth.mockResolvedValueOnce([
      {
        job: "purge-delivered-designs",
        label: "Purga diseños entregados",
        intervalMs: 86_400_000,
        lastRunAt: null,
        overdue: false,
        pending: true,
        disabled: false,
      },
    ]);
    const res = await GET(req(SECRET));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      pending: string[];
      jobs: Array<{ job: string; pending: boolean }>;
    };
    expect(body.status).toBe("ok");
    expect(body.pending).toEqual(["purge-delivered-designs"]);
    expect(body.jobs[0]).toMatchObject({ job: "purge-delivered-designs", pending: true });
  });

  it("la key de rate-limit lleva la IP hasheada (C-8)", async () => {
    await GET(req());
    const key = rateLimit.mock.calls[0][0] as string;
    expect(key).toMatch(/^health_crons:ip:[0-9a-f]{16}$/);
    expect(key).not.toContain("203.0.113.7");
  });
});
