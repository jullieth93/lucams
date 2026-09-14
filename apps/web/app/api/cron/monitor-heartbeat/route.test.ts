/*
 * Unit — POST /api/cron/monitor-heartbeat (monitor externo de uptime en la VM).
 *
 * El consumidor es apps/web/scripts/uptime-monitor.mjs (crontab de la VM) tras
 * cada sondeo de los healthchecks de PRD. Garantías:
 *  - Auth igual que los demás /api/cron/*: header `x-cron-secret` timing-safe;
 *    sin secreto válido → 401 y NO se persiste.
 *  - Con secreto válido: upsert del latido (recordMonitorHeartbeat) con el
 *    `detail` del body cuando viene; body ausente/inválido NO lo bloquea.
 *  - Si el upsert FALLA → 500 a propósito (el script lo loguea y
 *    uptime_monitor_stale lo delata a los 30 min).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { recordMonitorHeartbeat, captureServerError } = vi.hoisted(() => ({
  recordMonitorHeartbeat: vi.fn(async () => {}),
  captureServerError: vi.fn(async () => {}),
}));

vi.mock("@/features/observability/cron-heartbeat", () => ({ recordMonitorHeartbeat }));
vi.mock("@/lib/error-capture", () => ({ captureServerError }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { NextRequest } from "next/server";

import { POST } from "./route";

const SECRET = "cron-secret-de-prueba";

function req(opts: { secret?: string; body?: string }): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.secret !== undefined) headers["x-cron-secret"] = opts.secret;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest("https://lucamsshop.com/api/cron/monitor-heartbeat", {
    method: "POST",
    headers,
    body: opts.body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/cron/monitor-heartbeat — auth (mismo patrón que los demás crons)", () => {
  it("sin header → 401 y NO registra latido", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(401);
    expect(recordMonitorHeartbeat).not.toHaveBeenCalled();
  });

  it("secreto equivocado → 401 y NO registra latido", async () => {
    const res = await POST(req({ secret: "otro-secreto" }));
    expect(res.status).toBe(401);
    expect(recordMonitorHeartbeat).not.toHaveBeenCalled();
  });

  it("sin CRON_SECRET configurado en el ambiente → 401 (fail-closed)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(req({ secret: SECRET }));
    expect(res.status).toBe(401);
    expect(recordMonitorHeartbeat).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/monitor-heartbeat — latido", () => {
  it("con secreto válido persiste el detail del body", async () => {
    const res = await POST(req({ secret: SECRET, body: JSON.stringify({ detail: "OK 5/5" }) }));
    expect(res.status).toBe(200);
    expect(recordMonitorHeartbeat).toHaveBeenCalledWith("OK 5/5");
  });

  it("también persiste el resumen de falla (lo lee la regla uptime_monitor_failing)", async () => {
    const detail = "FALLA 1/5: /api/health/wompi";
    const res = await POST(req({ secret: SECRET, body: JSON.stringify({ detail }) }));
    expect(res.status).toBe(200);
    expect(recordMonitorHeartbeat).toHaveBeenCalledWith(detail);
  });

  it("body ausente → latido igualmente (detail undefined)", async () => {
    const res = await POST(req({ secret: SECRET }));
    expect(res.status).toBe(200);
    expect(recordMonitorHeartbeat).toHaveBeenCalledWith(undefined);
  });

  it("body inválido → NO bloquea el latido", async () => {
    const res = await POST(req({ secret: SECRET, body: "no-json{{" }));
    expect(res.status).toBe(200);
    expect(recordMonitorHeartbeat).toHaveBeenCalledWith(undefined);
  });

  it("si el upsert FALLA → 500 a propósito (visible en el log de la VM y vía uptime_monitor_stale)", async () => {
    recordMonitorHeartbeat.mockRejectedValueOnce(new Error("db caída"));
    const res = await POST(req({ secret: SECRET, body: JSON.stringify({ detail: "OK 5/5" }) }));
    expect(res.status).toBe(500);
    expect(captureServerError).toHaveBeenCalled();
  });
});
