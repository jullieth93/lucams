import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  probeAveonlineHealth: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/rate-limit-keys", () => ({
  ipKey: (scope: string, ip: string) => `${scope}:${ip}`,
}));
vi.mock("@/lib/client-ip", () => ({ getClientIp: () => "203.0.113.7" }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/features/shipping/aveonline", () => ({
  probeAveonlineHealth: mocks.probeAveonlineHealth,
}));

import { GET } from "./route";

const CRON_SECRET = "test-cron-secret-for-health-details";
const shipping = {
  ok: false,
  mode: "production",
  authenticated: true,
  idempresa: 15289,
  isDemoAccount: true,
  detail: "La cuenta DEMO no puede operar en producción",
};

function request(secret?: string) {
  return new Request("http://localhost/api/health/aveonline", {
    headers: secret ? { "x-cron-secret": secret } : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", CRON_SECRET);
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.probeAveonlineHealth.mockResolvedValue(shipping);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health/aveonline — cierre de metadatos internos", () => {
  it.each([undefined, "secreto-invalido"])(
    "sin autenticación válida devuelve solo status y ok (secreto: %s)",
    async (secret) => {
      const response = await GET(request(secret));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "warn", ok: false });
    },
  );

  it("con x-cron-secret válido expone el diagnóstico completo", async () => {
    const response = await GET(request(CRON_SECRET));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        status: "warn",
        ok: false,
        service: "aveonline",
        check: "auth",
        shipping,
      }),
    );
    expect(body.shipping.idempresa).toBe(15289);
  });

  it("una excepción pública no revela el error interno ni metadatos", async () => {
    mocks.probeAveonlineHealth.mockRejectedValueOnce(new Error("host interno secreto"));

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ status: "fail", ok: false });
  });

  it("una excepción autenticada conserva el problem detail operativo sin filtrar la excepción cruda", async () => {
    mocks.probeAveonlineHealth.mockRejectedValueOnce(new Error("host interno secreto"));

    const response = await GET(request(CRON_SECRET));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.detail).toBe("Aveonline healthcheck falló.");
    expect(JSON.stringify(body)).not.toContain("host interno secreto");
  });

  it("rate limit no llama al proveedor y mantiene la respuesta mínima", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false });

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ status: "rate_limited", ok: false });
    expect(mocks.probeAveonlineHealth).not.toHaveBeenCalled();
  });
});
